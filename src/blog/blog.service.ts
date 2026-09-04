import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Post, PostTag, Tag } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AdminLogService } from '../analytics/admin-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { type CacheStore, NamespacedCache } from '../types/cache-store';
import {
  BLOG_CACHE_PREFIX,
  BLOG_CACHE_TTL,
  BLOG_TEMP_PREFIX,
  DEFAULT_CATEGORY_ICON,
  RECENT_DAYS,
  RELATED_POST_COUNT,
} from './blog.constants';
import { calculateReadingTime, extractDescription, generateSlug } from './blog.utils';
import type { CreatePostDto } from './dto/create-post.dto';
import type { PostQueryDto, SearchQueryDto, TagQueryDto } from './dto/post-query.dto';
import type { UpdatePostDto } from './dto/update-post.dto';

type PostWithTags = Post & {
  postTags: Array<PostTag & { tag: Tag }>;
};

/**
 * 이미지 확정 결과. `error`가 있으면 일부만 옮겨진 상태이고,
 * `content`/`thumbnailUrl`은 **그 시점까지 성공한 만큼**을 반영한 값이다.
 */
type FinalizeImagesResult = {
  content: string;
  thumbnailUrl?: string | null;
  /**
   * 이번 호출에서 실제로 R2에 옮긴 목적지 키.
   *
   * 롤백할 때 본문을 다시 파싱해 지울 대상을 유추하면 안 된다 — 부분 실패 시
   * 본문에는 확정 URL과 아직 못 옮긴 temp URL이 섞여 있어서, 파싱 기반으로
   * 지우면 재시도에 필요한 temp 원본까지 날아간다.
   */
  movedKeys: string[];
  error?: Error;
};

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly revalidation: RevalidationService,
    private readonly adminLog: AdminLogService,
    config: ConfigService,
    @Inject(CACHE_MANAGER) rawCache: CacheStore,
  ) {
    this.cache = new NamespacedCache(rawCache, BLOG_CACHE_PREFIX);
    this.adminUsername = config.getOrThrow<string>('ADMIN_USERNAME');
  }

  private readonly logger = new Logger(BlogService.name);
  private readonly cache: NamespacedCache;
  private readonly adminUsername: string;

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAll(query: PostQueryDto, isAdmin = false) {
    const { page = 1, limit = 10, category, tag } = query;
    const key = `posts:${page}:${limit}:${category ?? ''}:${tag ?? ''}:${isAdmin}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const skip = (page - 1) * limit;
    const where = {
      ...(isAdmin ? {} : { published: true }),
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

    await this.cache.set(key, result, BLOG_CACHE_TTL);
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
    if (!isAdmin) await this.cache.set(key, result, BLOG_CACHE_TTL);
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
    // 어드민이 수정·삭제할 때 쓴다. 이 라우트가 카테고리 목록의 유일한 출처인데
    // id가 없어서, 프론트가 이름을 경로에 넣어 호출하다 400을 맞고 있었다.
    const idMap = new Map(categoryMeta.map(c => [c.name, c.id]));

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
        id: idMap.get(c.category as string) ?? null,
        category: c.category as string,
        icon: iconMap.get(c.category as string) ?? DEFAULT_CATEGORY_ICON,
        count: c._count,
        recent: recentSet.has(c.category),
        tags: Array.from(tagMap.get(c.category as string)?.values() ?? []).sort(
          (a, b) => b.count - a.count,
        ),
      }))
      .sort((a, b) => b.count - a.count);

    await this.cache.set(key, result, BLOG_CACHE_TTL);
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
    await this.cache.set(key, result, BLOG_CACHE_TTL);
    return result;
  }

  async getTags(query: TagQueryDto) {
    const { limit = 15 } = query;
    const key = `tags:${limit}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    // 아무 글도 안 쓰는 태그는 목록에서도 총계에서도 뺀다.
    //
    // `tag.count()`로 전체를 세면 고아 태그가 포함되어, 프론트 사이드바가
    // 실제보다 많은 태그 수를 표시한다(운영 실측: 78 표시 / 실사용 75).
    // 고아 태그는 생성 경로를 막았지만(deleteOrphanTags), 이미 쌓인 것과
    // 정리 실패분이 있을 수 있으므로 조회 쪽에서도 방어한다.
    const usedOnly = { postTags: { some: {} } } as const;

    const [tags, total] = await this.prisma.$transaction([
      this.prisma.tag.findMany({
        where: usedOnly,
        include: { _count: { select: { postTags: true } } },
        orderBy: { postTags: { _count: 'desc' } },
        take: limit,
      }),
      this.prisma.tag.count({ where: usedOnly }),
    ]);

    const result = {
      tags: tags.map(tag => ({ name: tag.name, slug: tag.slug, count: tag._count.postTags })),
      total,
    };

    await this.cache.set(key, result, BLOG_CACHE_TTL);
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
      const excludeIds = [post.id, ...scored.slice(0, RELATED_POST_COUNT).map(s => s.post.id)];

      const pool = (await this.prisma.post.findMany({
        where: { published: true, id: { notIn: excludeIds } },
        include: { postTags: { include: { tag: true } } },
        orderBy: { createdAt: 'desc' },
        take: deficit,
      })) as PostWithTags[];

      recommended = pool.map(p => this.formatPost(p));
    }

    const result = { related, recommended };
    await this.cache.set(key, result, BLOG_CACHE_TTL);
    return result;
  }

  // ─── Category CRUD ─────────────────────────────────────────────────────────

  /**
   * 카테고리 변경의 부수효과.
   *
   * 프론트는 카테고리 목록을 `BLOG_CATEGORIES` 태그로 캐싱하고
   * `DEFAULT_REVALIDATE = false`라 시간 만료가 없다. 통보하지 않으면
   * 아이콘·정렬 변경이 사이드바에 **영구히** 반영되지 않는다.
   *
   * 이름 변경만 무효화 대상으로 보면 안 된다 — 아이콘과 정렬 순서도
   * 화면에 그대로 드러나는 값이다.
   */
  private async triggerCategorySideEffects(): Promise<void> {
    await this.cache.invalidate();
    this.revalidation
      .trigger('blog')
      .catch(err => this.logger.warn('blog revalidation failed', err));
  }

  async createCategory(dto: { name: string; icon?: string; sortOrder?: number }) {
    const result = await this.prisma.category.create({
      data: {
        name: dto.name,
        icon: dto.icon ?? DEFAULT_CATEGORY_ICON,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.triggerCategorySideEffects();
    return result;
  }

  async updateCategory(id: number, dto: { name?: string; icon?: string; sortOrder?: number }) {
    try {
      const updated = await this.prisma.$transaction(async tx => {
        const oldName =
          dto.name !== undefined
            ? (await tx.category.findUnique({ where: { id }, select: { name: true } }))?.name
            : undefined;

        const result = await tx.category.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.icon !== undefined && { icon: dto.icon }),
            ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          },
        });

        if (dto.name !== undefined && oldName && dto.name !== oldName) {
          await tx.post.updateMany({
            where: { category: oldName },
            data: { category: dto.name },
          });
        }

        return result;
      });

      await this.triggerCategorySideEffects();

      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Category not found');
      }
      throw error;
    }
  }

  async deleteCategory(id: number): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const existing = await tx.category.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Category not found');

      const postCount = await tx.post.count({ where: { category: existing.name } });
      if (postCount > 0) {
        throw new ConflictException(`Cannot delete category: ${postCount} posts are using it`);
      }

      await tx.category.delete({ where: { id } });
    });
    await this.triggerCategorySideEffects();
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async create(dto: CreatePostDto) {
    const slug = generateSlug();
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
          readingTime: calculateReadingTime(dto.content),
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
      const finalized = await this.finalizeImages(slug, post.content, post.thumbnailUrl);
      const updated = (await this.prisma.post.update({
        where: { slug },
        data: { content: finalized.content, thumbnailUrl: finalized.thumbnailUrl },
        include: { postTags: { include: { tag: true } } },
      })) as PostWithTags;

      if (finalized.error) {
        this.logger.error('Image finalization failed, rolling back post', finalized.error);

        // 글을 지우면 옮겨진 파일을 가리킬 레코드가 사라진다. cleanupTempFiles는
        // `blog/temp/` prefix만 훑으므로 그 파일들은 영원히 회수되지 않는다.
        // 그래서 레코드를 지우기 **전에** 이번에 옮긴 것만 정리한다.
        //
        // 지울 대상을 본문에서 파싱하면 안 된다 — 부분 실패 시 본문에는
        // 아직 못 옮긴 temp URL도 섞여 있어서, 그것까지 지우면 사용자가
        // "다시 저장"을 눌러도 원본이 없어 영구히 실패한다.
        await Promise.all(
          finalized.movedKeys.map(key =>
            this.storage
              .deleteByKey(key)
              .catch(err => this.logger.warn(`Rollback cleanup failed: ${key}`, err)),
          ),
        );

        await this.prisma.post
          .delete({ where: { slug } })
          .catch(deleteErr =>
            this.logger.error('Rollback failed: post left with temp URLs', deleteErr),
          );
        throw finalized.error;
      }

      const result = this.formatPost(updated, true);
      await this.triggerPostSideEffects('create', post.slug, post.title);
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
      // 태그를 교체하면 기존 연결이 끊긴다. 끊긴 뒤에는 어떤 태그였는지 알 수 없으므로
      // 교체 전에 후보 id를 확보한다.
      const previousTagIds =
        dto.tags !== undefined
          ? (
              await this.prisma.postTag.findMany({
                where: { post: { slug } },
                select: { tagId: true },
              })
            ).map(pt => pt.tagId)
          : [];

      // 교체당할 옛 썸네일 URL을 미리 확보한다. update 이후에는 알 수 없고,
      // 지우지 않으면 R2에 영구 고아로 남는다 — cleanupTempFiles는
      // `blog/temp/` prefix만 훑으므로 `blog/thumbnails/`는 회수 대상이 아니다.
      // remove()와 updateProfile()은 이미 옛 파일을 지우는데 여기만 빠져 있었다.
      const previousThumbnailUrl =
        dto.thumbnailUrl !== undefined
          ? (
              await this.prisma.post.findUnique({
                where: { slug },
                select: { thumbnailUrl: true },
              })
            )?.thumbnailUrl
          : null;

      // DB에 먼저 저장 (temp URL 그대로)
      const post = (await this.prisma.post.update({
        where: { slug },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.content !== undefined && {
            content: dto.content,
            readingTime: calculateReadingTime(dto.content),
          }),
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

      // 태그 정리는 이미지 확정보다 먼저 한다. 확정이 실패하면 아래에서 throw하므로,
      // 뒤에 두면 태그를 교체하면서 이미지 확정이 실패한 경우 정리가 건너뛰어져
      // 고아 태그가 남는다. 둘은 서로 독립된 정리 작업이다.
      await this.deleteOrphanTags(previousTagIds).catch(err =>
        this.logger.warn('orphan tag cleanup failed', err),
      );

      // DB 성공 후 temp 이미지 확정 경로로 이동.
      //
      // 판정을 `dto.content || dto.thumbnailUrl`로 하면 안 된다 — 빈 문자열이 falsy라
      // `content: ""`로 보내면 확정 단계를 건너뛴다. 값이 왔는지를 봐야 한다.
      let updated = post;
      if (dto.content !== undefined || dto.thumbnailUrl !== undefined) {
        const finalized = await this.finalizeImages(slug, post.content, post.thumbnailUrl);

        // 실패했더라도 그때까지 옮긴 만큼은 DB에 반영한다. 반영하지 않으면
        // 이미 이동된 파일을 가리킬 URL이 사라져 그 이미지가 즉시 깨진다.
        updated = (await this.prisma.post.update({
          where: { slug },
          data: { content: finalized.content, thumbnailUrl: finalized.thumbnailUrl },
          include: { postTags: { include: { tag: true } } },
        })) as PostWithTags;

        if (finalized.error) {
          // 삼키지 않는다. 삼키면 temp URL이 남은 채 200이 나가고, 그 temp 파일은
          // 매일 3시 StorageCleanupTask가 24시간 뒤 지우므로 다음 날 이미지가 깨진다.
          // 저장 시점에는 정상으로 보여 원인 추적이 어렵다.
          this.logger.error('Image finalization failed during update', finalized.error);
          // 부분 확정 결과가 이미 커밋됐으므로 캐시 무효화와 revalidation은
          // 반드시 해야 한다. 다만 action을 'update'로 남기면 어드민 로그에서
          // 실패한 요청과 성공한 수정이 구별되지 않는다.
          await this.triggerPostSideEffects('update_partial_failure', slug, updated.title);
          throw new InternalServerErrorException(
            '이미지 확정에 실패했습니다. 글 내용은 저장됐습니다. 이미지를 다시 저장해 주세요.',
          );
        }
      }

      // 확정까지 성공한 뒤에 옛 썸네일을 지운다. 실패 경로에서 지우면
      // 사용자가 재시도할 때 되돌아갈 이미지가 없다.
      if (
        previousThumbnailUrl &&
        previousThumbnailUrl !== updated.thumbnailUrl &&
        !previousThumbnailUrl.startsWith(`${this.storage.getPublicUrl()}/${BLOG_TEMP_PREFIX}/`)
      ) {
        this.storage
          .delete(previousThumbnailUrl)
          .catch(err => this.logger.warn('Old thumbnail cleanup failed', err));
      }

      const result = this.formatPost(updated, true);
      await this.triggerPostSideEffects('update', slug, updated.title);
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

      // post_tags는 FK CASCADE로 정리되지만 tags 본체는 남는다.
      // 삭제 후에는 어떤 태그였는지 알 수 없으므로 미리 확보한다.
      const tagIds = (
        await this.prisma.postTag.findMany({
          where: { postId: post.id },
          select: { tagId: true },
        })
      ).map(pt => pt.tagId);

      await this.prisma.post.delete({ where: { slug } });

      await this.deleteOrphanTags(tagIds).catch(err =>
        this.logger.warn('orphan tag cleanup failed', err),
      );

      // R2 파일 정리 (fire-and-forget)
      this.cleanupPostImages(post.content, post.thumbnailUrl).catch(err =>
        this.logger.warn('Post image cleanup failed', err),
      );
      await this.triggerPostSideEffects('delete', slug);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Post not found');
      }
      throw error;
    }
  }

  async uploadTempImage(buffer: Buffer, filename: string, mimeType: string) {
    const url = await this.storage.upload(buffer, filename, mimeType, BLOG_TEMP_PREFIX);
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
   * blog/temp/xxx.jpg (thumbnail) → blog/thumbnails/{nanoid}.ext
   */
  /**
   * temp에 올라간 이미지를 확정 경로로 옮기고, 본문의 URL을 새 위치로 치환한다.
   *
   * **부분 실패를 삼키지 않되, 이미 옮긴 것은 잃지 않는다.**
   *
   * 이전 구현은 루프 중간에 `storage.move`가 실패하면 예외가 그대로 올라가면서
   * 그때까지 치환한 `finalContent`를 통째로 버렸다. 그런데 `move`는 R2에서
   * Copy → Head → Delete를 수행하므로 성공한 파일의 원본 temp는 이미 삭제된
   * 상태다. 결과적으로 파일은 옮겨졌는데 DB는 옛 temp URL을 가리켜 즉시 깨졌다.
   *
   * 그래서 실패해도 "여기까지 옮겼다"는 결과를 함께 돌려준다. 호출부가 그것을
   * DB에 먼저 반영한 뒤 예외를 올리면, 실패한 이미지 하나만 temp를 가리키고
   * 나머지는 정상 위치를 가리킨다 — 어느 쪽도 유실되지 않는다.
   */
  private async finalizeImages(
    slug: string,
    content: string,
    thumbnailUrl?: string | null,
  ): Promise<FinalizeImagesResult> {
    const publicUrl = this.storage.getPublicUrl();
    const tempPrefix = `${publicUrl}/${BLOG_TEMP_PREFIX}/`;
    let finalContent = content;
    let finalThumbnail = thumbnailUrl;

    // `match(/g)`는 같은 URL이 본문에 두 번 나오면 **두 번 다** 배열에 넣는다.
    // 중복을 제거하지 않으면 같은 원본에 move가 두 번 불리는데, move는
    // Copy → Head → Delete(원본)라서 1회차에 원본이 사라지고 2회차 Copy가
    // NoSuchKey로 터진다. 즉 도입부와 정리 섹션에 같은 이미지를 넣은 글은
    // 정상 입력인데도 저장이 실패했다.
    //
    // 중복 제거가 `replaceAll`보다 **먼저**다. replaceAll만 넣으면 치환은
    // 양쪽 다 되지만 move는 여전히 두 번 불려 같은 예외가 난다.
    const tempUrls = [
      ...new Set(
        content.match(
          new RegExp(`${tempPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"\\s)]+`, 'g'),
        ) ?? [],
      ),
    ];

    // 실제로 옮긴 목적지를 기록한다. 호출부가 롤백할 때 이 목록만 지우면 되고,
    // 본문을 다시 파싱해 유추하지 않아도 된다 — 유추하면 아직 옮기지 않은
    // temp 원본까지 지워서 재시도 가능하던 실패가 복구 불가능해진다.
    const movedKeys: string[] = [];

    for (const tempUrl of tempUrls) {
      const filename = tempUrl.slice(tempPrefix.length);
      const destKey = `blog/posts/${slug}/${filename}`;
      try {
        const newUrl = await this.storage.move(tempUrl, destKey);
        // 같은 URL이 본문에 여러 번 있으면 전부 바꿔야 한다. `replace`에
        // 문자열을 넘기면 첫 번째만 치환되어 나머지가 temp를 가리킨 채 남는다.
        finalContent = finalContent.replaceAll(tempUrl, newUrl);
        movedKeys.push(destKey);
      } catch (error) {
        return {
          content: finalContent,
          thumbnailUrl: finalThumbnail,
          movedKeys,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }

    if (thumbnailUrl?.startsWith(tempPrefix)) {
      const ext = thumbnailUrl.slice(thumbnailUrl.lastIndexOf('.'));
      const destKey = `blog/thumbnails/${generateSlug()}${ext}`;
      try {
        finalThumbnail = await this.storage.move(thumbnailUrl, destKey);
        movedKeys.push(destKey);
      } catch (error) {
        return {
          content: finalContent,
          thumbnailUrl: finalThumbnail,
          movedKeys,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    }

    return { content: finalContent, thumbnailUrl: finalThumbnail, movedKeys };
  }

  private async triggerPostSideEffects(action: string, slug: string, title?: string) {
    await this.cache.invalidate();
    this.revalidation
      .trigger('blog', slug)
      .catch(err => this.logger.warn('blog revalidation failed', err));
    this.revalidation
      .trigger('portfolio', slug)
      .catch(err => this.logger.warn('portfolio revalidation failed', err));
    this.adminLog
      .log({
        action,
        entity: 'post',
        entityId: slug,
        ...(title && { detail: title }),
        username: this.adminUsername,
      })
      .catch(err => this.logger.warn('admin log failed', err));
  }

  /**
   * 주어진 태그 중 아무 글도 참조하지 않게 된 것을 삭제한다.
   *
   * 전체 태그를 스캔하지 않고 **후보를 받아서** 검사한다. 지금 규모(78건)에서는
   * 차이가 없지만, "방금 연결이 끊긴 것만 본다"는 형태가 의도를 드러낸다.
   *
   * 안전 조건: 다른 글이 아직 쓰는 태그는 지우지 않는다. 이게 이 함수에서
   * 가장 깨지기 쉬운 지점이라 테스트로 고정해 뒀다.
   *
   * 실패해도 글 수정/삭제 자체를 되돌리지 않는다 — 고아 태그가 남는 것은
   * 기능적 문제가 아니고(카테고리 집계는 post_tags 기준이라 노출되지 않는다),
   * 이것 때문에 사용자의 저장을 실패시키는 편이 더 나쁘다.
   */
  private async deleteOrphanTags(tagIds: number[]): Promise<void> {
    if (tagIds.length === 0) return;

    await this.prisma.tag.deleteMany({
      where: {
        id: { in: tagIds },
        postTags: { none: {} },
      },
    });
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
