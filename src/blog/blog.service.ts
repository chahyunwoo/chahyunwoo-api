import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Post, PostTag, Tag } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AdminLogService } from '../analytics/admin-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { type CacheStore, NamespacedCache } from '../types/cache-store';
import { RECENT_DAYS, RELATED_POST_COUNT } from './blog.constants';
import { extractDescription, generateSlug } from './blog.utils';
import type { CreatePostDto } from './dto/create-post.dto';
import type { PostQueryDto, SearchQueryDto, TagQueryDto } from './dto/post-query.dto';
import type { UpdatePostDto } from './dto/update-post.dto';

type PostWithTags = Post & {
  postTags: Array<PostTag & { tag: Tag }>;
};

const CACHE_PREFIX = 'blog';
const CACHE_TTL = 60_000; // 1 minute (블로그는 포트폴리오보다 자주 바뀜)

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly revalidation: RevalidationService,
    private readonly adminLog: AdminLogService,
    @Inject(CACHE_MANAGER) rawCache: CacheStore,
  ) {
    this.cache = new NamespacedCache(rawCache, CACHE_PREFIX);
  }

  private readonly logger = new Logger(BlogService.name);
  private readonly cache: NamespacedCache;

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAll(query: PostQueryDto) {
    const { page = 1, limit = 10, category, tag } = query;
    const key = `posts:${page}:${limit}:${category ?? ''}:${tag ?? ''}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const where = {
      published: true,
      ...(category && { category }),
      ...(tag && { postTags: { some: { tag: { slug: tag } } } }),
    };

    const include = { postTags: { include: { tag: true } } } as const;

    const [posts, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    const result = {
      posts: (posts as PostWithTags[]).map(post => this.formatPost(post)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await this.cache.set(key, result, CACHE_TTL);
    return result;
  }

  async findBySlug(slug: string, isAdmin = false) {
    const key = `post:${slug}`;
    if (!isAdmin) {
      const cached = await this.cache.get(key);
      if (cached) return cached;
    }

    const post = (await this.prisma.post.findUnique({
      where: { slug },
      include: { postTags: { include: { tag: true } } },
    })) as PostWithTags | null;

    if (!post || (!isAdmin && !post.published)) {
      throw new NotFoundException('Post not found');
    }

    // 조회수 증가 (fire-and-forget, 어드민 조회 제외)
    if (!isAdmin) {
      this.prisma.post
        .update({ where: { slug }, data: { viewCount: { increment: 1 } } })
        .catch(err => this.logger.warn('viewCount increment failed', err));
    }

    const result = this.formatPost(post, true);
    if (!isAdmin) await this.cache.set(key, result, CACHE_TTL);
    return result;
  }

  async search(query: SearchQueryDto) {
    const { q, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where = {
      published: true,
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { description: { contains: q, mode: 'insensitive' as const } },
        { category: { contains: q, mode: 'insensitive' as const } },
        { postTags: { some: { tag: { name: { contains: q, mode: 'insensitive' as const } } } } },
      ],
    };

    const include = { postTags: { include: { tag: true } } } as const;

    const [posts, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    const formatted = (posts as PostWithTags[]).map(post => this.formatPost(post));

    const grouped: Record<string, typeof formatted> = {};
    for (const post of formatted) {
      const cat = (post.category as string) ?? 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(post);
    }

    return { posts: formatted, total, query: q, grouped };
  }

  async getCategories() {
    const key = 'categories';
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const recentThreshold = new Date();
    recentThreshold.setDate(recentThreshold.getDate() - RECENT_DAYS);

    // 카테고리별 카운트 + 최근 여부를 2개 쿼리로 분리 (메모리 집계 최소화)
    const [categoryCounts, recentCategories, tagCounts, categoryMeta] = await Promise.all([
      this.prisma.post.groupBy({
        by: ['category'],
        where: { published: true, category: { not: null } },
        _count: true,
      }),
      this.prisma.post.groupBy({
        by: ['category'],
        where: { published: true, category: { not: null }, createdAt: { gte: recentThreshold } },
        _count: true,
      }),
      this.prisma.postTag.findMany({
        where: { post: { published: true, category: { not: null } } },
        select: {
          tag: { select: { name: true, slug: true } },
          post: { select: { category: true } },
        },
      }),
      this.prisma.category.findMany(),
    ]);

    const recentSet = new Set(recentCategories.map(r => r.category));
    const iconMap = new Map(categoryMeta.map(c => [c.name, c.icon]));

    // 태그 카운트 집계
    const tagMap = new Map<string, Map<string, { name: string; slug: string; count: number }>>();
    for (const row of tagCounts) {
      const cat = row.post.category as string;
      let catTags = tagMap.get(cat);
      if (!catTags) {
        catTags = new Map();
        tagMap.set(cat, catTags);
      }
      const existing = catTags.get(row.tag.slug);
      if (existing) {
        existing.count += 1;
      } else {
        catTags.set(row.tag.slug, { name: row.tag.name, slug: row.tag.slug, count: 1 });
      }
    }

    const result = categoryCounts
      .map(c => ({
        category: c.category as string,
        icon: iconMap.get(c.category as string) ?? 'LayoutGrid',
        count: c._count,
        recent: recentSet.has(c.category),
        tags: Array.from(tagMap.get(c.category as string)?.values() ?? []).sort(
          (a, b) => b.count - a.count,
        ),
      }))
      .sort((a, b) => b.count - a.count);

    await this.cache.set(key, result, CACHE_TTL);
    return result;
  }

  async getRecentPosts(limit = 5) {
    const key = `recent:${limit}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const posts = await this.prisma.post.findMany({
      where: { published: true },
      include: { postTags: { include: { tag: true } } },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });

    const result = (posts as PostWithTags[]).map(post => this.formatPost(post));
    await this.cache.set(key, result, CACHE_TTL);
    return result;
  }

  async getTags(query: TagQueryDto) {
    const { limit = 15 } = query;
    const key = `tags:${limit}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const [tags, total] = await this.prisma.$transaction([
      this.prisma.tag.findMany({
        include: { _count: { select: { postTags: true } } },
        orderBy: { postTags: { _count: 'desc' } },
        take: limit,
      }),
      this.prisma.tag.count(),
    ]);

    const result = {
      tags: tags.map(tag => ({ name: tag.name, slug: tag.slug, count: tag._count.postTags })),
      total,
    };

    await this.cache.set(key, result, CACHE_TTL);
    return result;
  }

  async getRelatedPosts(slug: string) {
    const key = `related:${slug}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const post = (await this.prisma.post.findUnique({
      where: { slug },
      include: { postTags: { include: { tag: true } } },
    })) as PostWithTags | null;

    if (!post) throw new NotFoundException('Post not found');

    const tagIds = post.postTags.map(pt => pt.tagId);

    const candidates = (await this.prisma.post.findMany({
      where: {
        published: true,
        id: { not: post.id },
        OR: [
          { category: post.category },
          ...(tagIds.length > 0 ? [{ postTags: { some: { tagId: { in: tagIds } } } }] : []),
        ],
      },
      include: { postTags: { include: { tag: true } } },
      orderBy: { createdAt: 'desc' },
      take: RELATED_POST_COUNT * 10,
    })) as PostWithTags[];

    const scored = candidates
      .map(candidate => {
        const candidateTagIds = new Set(candidate.postTags.map(pt => pt.tagId));
        const overlap = tagIds.filter(id => candidateTagIds.has(id)).length;
        const sameCategory = candidate.category === post.category ? 1 : 0;
        return { post: candidate, score: overlap + sameCategory };
      })
      .sort((a, b) => b.score - a.score);

    const related = scored.slice(0, RELATED_POST_COUNT).map(s => this.formatPost(s.post));

    const deficit = RELATED_POST_COUNT - related.length;
    let recommended: ReturnType<typeof this.formatPost>[] = [];

    if (deficit > 0) {
      const excludeIds = new Set([
        post.id,
        ...scored.slice(0, RELATED_POST_COUNT).map(s => s.post.id),
      ]);

      const count = await this.prisma.post.count({
        where: { published: true, id: { notIn: [...excludeIds] } },
      });
      const randomSkip = Math.max(0, Math.floor(Math.random() * (count - deficit)));

      const pool = (await this.prisma.post.findMany({
        where: { published: true, id: { notIn: [...excludeIds] } },
        include: { postTags: { include: { tag: true } } },
        skip: randomSkip,
        take: deficit,
      })) as PostWithTags[];

      recommended = pool.map(p => this.formatPost(p));
    }

    const result = { related, recommended };
    await this.cache.set(key, result, CACHE_TTL);
    return result;
  }

  // ─── Category CRUD ─────────────────────────────────────────────────────────

  async createCategory(dto: { name: string; icon?: string; sortOrder?: number }) {
    return this.prisma.category.create({
      data: { name: dto.name, icon: dto.icon ?? 'LayoutGrid', sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async updateCategory(id: number, dto: { name?: string; icon?: string; sortOrder?: number }) {
    try {
      const existing = await this.prisma.category.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Category not found');

      const updated = await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.icon !== undefined && { icon: dto.icon }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
      });

      // 이름 변경 시 포스트의 category 문자열도 같이 업데이트
      if (dto.name !== undefined && dto.name !== existing.name) {
        await this.prisma.post.updateMany({
          where: { category: existing.name },
          data: { category: dto.name },
        });
        await this.cache.invalidate();
      }

      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Category not found');
      }
      throw error;
    }
  }

  async deleteCategory(id: number): Promise<void> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    // 해당 카테고리를 사용하는 포스트가 있으면 삭제 불가
    const postCount = await this.prisma.post.count({ where: { category: existing.name } });
    if (postCount > 0) {
      throw new ConflictException(`Cannot delete category: ${postCount} posts are using it`);
    }

    await this.prisma.category.delete({ where: { id } });
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async create(dto: CreatePostDto) {
    const slug = generateSlug(dto.title);
    const description = dto.description || extractDescription(dto.content);

    try {
      // DB에 먼저 저장 (temp URL 그대로)
      const post = (await this.prisma.post.create({
        data: {
          title: dto.title,
          slug,
          description,
          content: dto.content,
          thumbnailUrl: dto.thumbnailUrl,
          category: dto.category,
          published: dto.published ?? false,
          publishedAt: dto.publishedAt
            ? new Date(dto.publishedAt)
            : dto.published
              ? new Date()
              : null,
          postTags: dto.tags?.length
            ? { create: await this.resolveTagConnections(dto.tags) }
            : undefined,
        },
        include: { postTags: { include: { tag: true } } },
      })) as PostWithTags;

      // DB 성공 후 temp 이미지를 확정 경로로 이동
      let updated = post;
      try {
        const finalized = await this.finalizeImages(slug, post.content, post.thumbnailUrl);
        updated = (await this.prisma.post.update({
          where: { slug },
          data: { content: finalized.content, thumbnailUrl: finalized.thumbnailUrl },
          include: { postTags: { include: { tag: true } } },
        })) as PostWithTags;
      } catch (moveError) {
        this.logger.error('Image finalization failed, rolling back post', moveError);
        await this.prisma.post.delete({ where: { slug } }).catch(() => {});
        throw moveError;
      }

      const result = this.formatPost(updated, true);
      await this.cache.invalidate();
      this.revalidation
        .trigger('blog', post.slug)
        .catch(err => this.logger.warn('revalidation failed', err));
      this.adminLog
        .log({
          action: 'create',
          entity: 'post',
          entityId: post.slug,
          detail: post.title,
          username: 'admin',
        })
        .catch(err => this.logger.warn('admin log failed', err));
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Slug collision. Please retry.');
      }
      throw error;
    }
  }

  async update(slug: string, dto: UpdatePostDto) {
    try {
      // DB에 먼저 저장 (temp URL 그대로)
      const post = (await this.prisma.post.update({
        where: { slug },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.content !== undefined && { content: dto.content }),
          ...(dto.thumbnailUrl !== undefined && { thumbnailUrl: dto.thumbnailUrl }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.published !== undefined && { published: dto.published }),
          ...(dto.publishedAt !== undefined && { publishedAt: new Date(dto.publishedAt) }),
          // published=true로 변경 시 publishedAt 자동 세팅
          ...(dto.published === true && !dto.publishedAt && { publishedAt: new Date() }),
          ...(dto.tags !== undefined && {
            postTags: {
              deleteMany: {},
              create: await this.resolveTagConnections(dto.tags),
            },
          }),
        },
        include: { postTags: { include: { tag: true } } },
      })) as PostWithTags;

      // DB 성공 후 temp 이미지 확정 경로로 이동
      if (dto.content || dto.thumbnailUrl) {
        try {
          const finalized = await this.finalizeImages(slug, post.content, post.thumbnailUrl);
          await this.prisma.post.update({
            where: { slug },
            data: { content: finalized.content, thumbnailUrl: finalized.thumbnailUrl },
          });
        } catch (moveError) {
          this.logger.error('Image finalization failed during update', moveError);
          // DB에는 temp URL이 남지만, temp 파일은 유지되므로 24시간 내 재시도 가능
        }
      }

      const updated = (await this.prisma.post.findUniqueOrThrow({
        where: { slug },
        include: { postTags: { include: { tag: true } } },
      })) as PostWithTags;

      const result = this.formatPost(updated, true);
      await this.cache.invalidate();
      this.revalidation
        .trigger('blog', slug)
        .catch(err => this.logger.warn('revalidation failed', err));
      this.adminLog
        .log({
          action: 'update',
          entity: 'post',
          entityId: slug,
          detail: updated.title,
          username: 'admin',
        })
        .catch(err => this.logger.warn('admin log failed', err));
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Post not found');
      }
      throw error;
    }
  }

  async remove(slug: string): Promise<void> {
    try {
      // 삭제 전 포스트 데이터 가져와서 R2 파일 정리용
      const post = await this.prisma.post.findUnique({ where: { slug } });
      if (!post) throw new NotFoundException('Post not found');

      await this.prisma.post.delete({ where: { slug } });

      // R2 파일 정리 (fire-and-forget)
      this.cleanupPostImages(post.content, post.thumbnailUrl).catch(err =>
        this.logger.warn('Post image cleanup failed', err),
      );
      await this.cache.invalidate();
      this.revalidation
        .trigger('blog', slug)
        .catch(err => this.logger.warn('revalidation failed', err));
      this.adminLog
        .log({ action: 'delete', entity: 'post', entityId: slug, username: 'admin' })
        .catch(err => this.logger.warn('admin log failed', err));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Post not found');
      }
      throw error;
    }
  }

  async uploadTempImage(buffer: Buffer, filename: string, mimeType: string) {
    const url = await this.storage.upload(buffer, filename, mimeType, 'blog/temp');
    return { url };
  }

  private async cleanupPostImages(content: string, thumbnailUrl: string | null): Promise<void> {
    const publicUrl = this.storage.getPublicUrl();
    const urlPattern = new RegExp(
      `${publicUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/blog/[^"\\s)]+`,
      'g',
    );

    // content 내 모든 R2 이미지 URL 삭제
    const urls = content.match(urlPattern) ?? [];
    for (const url of urls) {
      await this.storage.delete(url).catch(() => {});
    }

    // 썸네일 삭제
    if (thumbnailUrl) {
      await this.storage.delete(thumbnailUrl).catch(() => {});
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * content + thumbnailUrl에서 temp URL을 찾아서 확정 경로로 이동
   * blog/temp/xxx.png → blog/posts/{slug}/xxx.png
   * blog/temp/xxx.jpg (thumbnail) → blog/thumbnails/{slug}.ext
   */
  private async finalizeImages(slug: string, content: string, thumbnailUrl?: string | null) {
    const publicUrl = this.storage.getPublicUrl();
    const tempPrefix = `${publicUrl}/blog/temp/`;
    let finalContent = content;

    // content 내 temp 이미지 이동
    const tempUrls =
      content.match(
        new RegExp(`${tempPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"\\s)]+`, 'g'),
      ) ?? [];
    for (const tempUrl of tempUrls) {
      const filename = tempUrl.slice(tempPrefix.length);
      const destKey = `blog/posts/${slug}/${filename}`;
      const newUrl = await this.storage.move(tempUrl, destKey);
      finalContent = finalContent.replace(tempUrl, newUrl);
    }

    // 썸네일 temp → 확정 경로
    let finalThumbnail = thumbnailUrl;
    if (thumbnailUrl?.startsWith(tempPrefix)) {
      const ext = thumbnailUrl.slice(thumbnailUrl.lastIndexOf('.'));
      const destKey = `blog/thumbnails/${slug}${ext}`;
      finalThumbnail = await this.storage.move(thumbnailUrl, destKey);
    }

    return { content: finalContent, thumbnailUrl: finalThumbnail };
  }

  private async resolveTagConnections(tagNames: string[]) {
    return Promise.all(
      tagNames.map(async name => {
        const slug = this.slugifyTag(name);
        const tag = await this.prisma.tag.upsert({
          where: { slug },
          create: { name, slug },
          update: {},
        });
        return { tagId: tag.id };
      }),
    );
  }

  private slugifyTag(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^\w-]/g, '');
  }

  private formatPost(post: PostWithTags, withContent = false) {
    const { postTags, content, ...rest } = post;
    return {
      ...rest,
      ...(withContent ? { content } : {}),
      tags: postTags.map((pt: PostTag & { tag: Tag }) => pt.tag),
    };
  }
}
