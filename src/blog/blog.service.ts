import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Post, PostTag, Tag } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { CreatePostDto } from './dto/create-post.dto';
import type { PostQueryDto, SearchQueryDto } from './dto/post-query.dto';
import type { UpdatePostDto } from './dto/update-post.dto';

type PostWithTags = Post & {
  postTags: Array<PostTag & { tag: Tag }>;
};

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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
        { content: { contains: q, mode: 'insensitive' as const } },
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

    return {
      posts: (posts as PostWithTags[]).map(post => this.formatPost(post)),
      total,
      query: q,
    };
  }

  async getCategories() {
    const posts = await this.prisma.post.findMany({
      where: { published: true, category: { not: null } },
      select: { category: true, postTags: { select: { tag: true } } },
    });

    const map = new Map<
      string,
      { count: number; tags: Map<string, { name: string; slug: string; count: number }> }
    >();

    for (const post of posts) {
      const cat = post.category as string;
      let entry = map.get(cat);
      if (!entry) {
        entry = { count: 0, tags: new Map() };
        map.set(cat, entry);
      }
      entry.count += 1;

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
        tags: Array.from(data.tags.values()).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);
  }

  async create(dto: CreatePostDto) {
    const existing = await this.prisma.post.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug '${dto.slug}' already exists`);

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

    return this.formatPost(post, true);
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

    return this.formatPost(post, true);
  }

  async remove(slug: string): Promise<void> {
    const existing = await this.prisma.post.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Post not found');
    await this.prisma.post.delete({ where: { slug } });
  }

  async updateThumbnail(slug: string, buffer: Buffer, filename: string, mimeType: string) {
    const existing = await this.prisma.post.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Post not found');

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
