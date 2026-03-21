import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Post, PostTag, Tag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { RECENT_DAYS, RELATED_POST_COUNT } from './blog.constants';
import type { CreatePostDto } from './dto/create-post.dto';
import type { PostQueryDto, SearchQueryDto, TagQueryDto } from './dto/post-query.dto';
import type { UpdatePostDto } from './dto/update-post.dto';

type PostWithTags = Post & {
  postTags: Array<PostTag & { tag: Tag }>;
};

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly revalidation: RevalidationService,
  ) {}

  async findAll(query: PostQueryDto) {
    const { page = 1, limit = 10, category, tag } = query;
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      posts: (posts as PostWithTags[]).map(post => this.formatPost(post)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findBySlug(slug: string, isAdmin = false) {
    const post = (await this.prisma.post.findUnique({
      where: { slug },
      include: { postTags: { include: { tag: true } } },
    })) as PostWithTags | null;

    if (!post || (!isAdmin && !post.published)) {
      throw new NotFoundException('Post not found');
    }

    return this.formatPost(post, true);
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

    return {
      posts: formatted,
      total,
      query: q,
      grouped,
    };
  }

  async getCategories() {
    const posts = await this.prisma.post.findMany({
      where: { published: true, category: { not: null } },
      select: { category: true, createdAt: true, postTags: { select: { tag: true } } },
    });

    const recentThreshold = new Date();
    recentThreshold.setDate(recentThreshold.getDate() - RECENT_DAYS);

    const map = new Map<
      string,
      {
        count: number;
        recent: boolean;
        tags: Map<string, { name: string; slug: string; count: number }>;
      }
    >();

    for (const post of posts) {
      const cat = post.category as string;
      let entry = map.get(cat);
      if (!entry) {
        entry = { count: 0, recent: false, tags: new Map() };
        map.set(cat, entry);
      }
      entry.count += 1;
      if (post.createdAt >= recentThreshold) entry.recent = true;

      for (const { tag } of post.postTags) {
        const existing = entry.tags.get(tag.slug);
        if (existing) {
          existing.count += 1;
        } else {
          entry.tags.set(tag.slug, { name: tag.name, slug: tag.slug, count: 1 });
        }
      }
    }

    return Array.from(map.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        recent: data.recent,
        tags: Array.from(data.tags.values()).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);
  }

  async getRecentPosts(limit = 5) {
    const posts = await this.prisma.post.findMany({
      where: { published: true },
      include: { postTags: { include: { tag: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return (posts as PostWithTags[]).map(post => this.formatPost(post));
  }

  async getTags(query: TagQueryDto) {
    const { limit = 15 } = query;

    const [tags, total] = await this.prisma.$transaction([
      this.prisma.tag.findMany({
        include: { _count: { select: { postTags: true } } },
        orderBy: { postTags: { _count: 'desc' } },
        take: limit,
      }),
      this.prisma.tag.count(),
    ]);

    return {
      tags: tags.map(tag => ({
        name: tag.name,
        slug: tag.slug,
        count: tag._count.postTags,
      })),
      total,
    };
  }

  async getRelatedPosts(slug: string) {
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
        where: {
          published: true,
          id: { notIn: [...excludeIds] },
        },
        include: { postTags: { include: { tag: true } } },
        skip: randomSkip,
        take: deficit,
      })) as PostWithTags[];

      recommended = pool.map(p => this.formatPost(p));
    }

    return { related, recommended };
  }

  async create(dto: CreatePostDto) {
    const existing = await this.prisma.post.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('Slug already exists');

    const post = (await this.prisma.post.create({
      data: {
        title: dto.title,
        slug: dto.slug,
        description: dto.description,
        content: dto.content,
        thumbnailUrl: dto.thumbnailUrl,
        category: dto.category,
        published: dto.published ?? false,
        postTags: dto.tags?.length
          ? { create: await this.resolveTagConnections(dto.tags) }
          : undefined,
      },
      include: { postTags: { include: { tag: true } } },
    })) as PostWithTags;

    const result = this.formatPost(post, true);
    await this.revalidation.trigger('blog', post.slug);
    return result;
  }

  async update(slug: string, dto: UpdatePostDto) {
    const existing = await this.prisma.post.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Post not found');

    const post = (await this.prisma.post.update({
      where: { slug },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.thumbnailUrl !== undefined && { thumbnailUrl: dto.thumbnailUrl }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.published !== undefined && { published: dto.published }),
        ...(dto.tags !== undefined && {
          postTags: {
            deleteMany: {},
            create: await this.resolveTagConnections(dto.tags),
          },
        }),
      },
      include: { postTags: { include: { tag: true } } },
    })) as PostWithTags;

    const result = this.formatPost(post, true);
    await this.revalidation.trigger('blog', post.slug);
    return result;
  }

  async remove(slug: string): Promise<void> {
    const existing = await this.prisma.post.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Post not found');
    await this.prisma.post.delete({ where: { slug } });
    await this.revalidation.trigger('blog', slug);
  }

  async updateThumbnail(slug: string, buffer: Buffer, filename: string, mimeType: string) {
    const existing = await this.prisma.post.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Post not found');

    if (existing.thumbnailUrl) {
      await this.storage.delete(existing.thumbnailUrl);
    }

    const url = await this.storage.upload(buffer, filename, mimeType, 'blog/thumbnails');

    const post = (await this.prisma.post.update({
      where: { slug },
      data: { thumbnailUrl: url },
      include: { postTags: { include: { tag: true } } },
    })) as PostWithTags;

    return this.formatPost(post, true);
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
