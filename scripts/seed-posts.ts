/**
 * MDX 파일 + 썸네일 이미지를 파싱하여 R2 업로드 후 DB에 시드
 *
 * Usage:
 *   npx tsx scripts/seed-posts.ts <posts-dir> <thumbnails-dir>
 *
 * Example:
 *   npx tsx scripts/seed-posts.ts \
 *     ../hyunwoo-blog-nextjs/src/posts \
 *     ../hyunwoo-blog-nextjs/public/thumbnail
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import fg from 'fast-glob';
import matter from 'gray-matter';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PostFrontmatter {
  title: string;
  description: string;
  date: string;
  mainTag: string;
  tags: string[];
  thumbnail: string;
  published: boolean;
}

interface ParsedPost {
  meta: PostFrontmatter;
  content: string;
  slug: string;
}

// ─── Config ─────────────────────────────────────────────────────────────────

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
}

function createS3Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${getEnvOrThrow('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getEnvOrThrow('R2_ACCESS_KEY_ID'),
      secretAccessKey: getEnvOrThrow('R2_SECRET_ACCESS_KEY'),
    },
  });
}

async function createPrismaClient(): Promise<PrismaClient> {
  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  return new PrismaClient({ adapter });
}

// ─── Parsers ────────────────────────────────────────────────────────────────

function parsePostFile(filePath: string): ParsedPost {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);

  return {
    meta: {
      title: data.title ?? '',
      description: data.description ?? '',
      date: data.date ?? '',
      mainTag: data.mainTag ?? '',
      tags: data.tags ?? [],
      thumbnail: data.thumbnail ?? '',
      published: data.published !== false,
    },
    content: content.trim(),
    slug: path.basename(filePath, '.mdx'),
  };
}

function slugifyTag(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]/g, '');
}

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

// ─── R2 Upload ──────────────────────────────────────────────────────────────

async function uploadThumbnail(
  s3: S3Client,
  bucket: string,
  thumbnailsDir: string,
  thumbnailPath: string,
): Promise<string | null> {
  const filename = path.basename(thumbnailPath);
  const localPath = path.join(thumbnailsDir, filename);

  if (!fs.existsSync(localPath)) {
    console.warn(`  Thumbnail not found: ${localPath}`);
    return null;
  }

  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    console.warn(`  Unsupported image type: ${ext}`);
    return null;
  }

  const key = `blog/thumbnails/${filename}`;
  const buffer = fs.readFileSync(localPath);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  const publicUrl = getEnvOrThrow('R2_PUBLIC_URL');
  return `${publicUrl}/${key}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [postsDir, thumbnailsDir] = process.argv.slice(2);

  if (!postsDir || !thumbnailsDir) {
    console.error('Usage: npx tsx scripts/seed-posts.ts <posts-dir> <thumbnails-dir>');
    process.exit(1);
  }

  const resolvedPostsDir = path.resolve(postsDir);
  const resolvedThumbnailsDir = path.resolve(thumbnailsDir);

  if (!fs.existsSync(resolvedPostsDir)) {
    console.error(`Posts directory not found: ${resolvedPostsDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(resolvedThumbnailsDir)) {
    console.error(`Thumbnails directory not found: ${resolvedThumbnailsDir}`);
    process.exit(1);
  }

  const prisma = await createPrismaClient();
  const s3 = createS3Client();
  const bucket = getEnvOrThrow('R2_BUCKET_NAME');

  try {
    const files = await fg('*.mdx', { cwd: resolvedPostsDir, absolute: true });
    files.sort();
    console.log(`Found ${files.length} MDX files\n`);

    if (files.length === 0) return;

    const posts = files.map(parsePostFile);

    // 태그 일괄 upsert
    const uniqueTags = [...new Set(posts.flatMap(p => p.meta.tags))];
    const tagMap = new Map<string, number>();

    for (const tagName of uniqueTags) {
      const slug = slugifyTag(tagName);
      const tag = await prisma.tag.upsert({
        where: { slug },
        create: { name: tagName, slug },
        update: {},
      });
      tagMap.set(tagName, tag.id);
    }
    console.log(`Upserted ${uniqueTags.length} tags\n`);

    // 포스트 시드
    let created = 0;
    let skipped = 0;

    for (const post of posts) {
      const existing = await prisma.post.findUnique({ where: { slug: post.slug } });
      if (existing) {
        console.log(`  SKIP  ${post.slug} (already exists)`);
        skipped++;
        continue;
      }

      // 썸네일 R2 업로드
      let thumbnailUrl: string | null = null;
      if (post.meta.thumbnail) {
        thumbnailUrl = await uploadThumbnail(s3, bucket, resolvedThumbnailsDir, post.meta.thumbnail);
      }

      await prisma.post.create({
        data: {
          title: post.meta.title,
          slug: post.slug,
          description: post.meta.description || null,
          content: post.content,
          thumbnailUrl,
          category: post.meta.mainTag || null,
          published: post.meta.published,
          createdAt: post.meta.date ? new Date(post.meta.date) : new Date(),
          postTags: {
            create: post.meta.tags
              .filter(tag => tagMap.has(tag))
              .map(tag => ({ tagId: tagMap.get(tag)! })),
          },
        },
      });

      console.log(`  CREATE ${post.slug}${thumbnailUrl ? ' (+ thumbnail)' : ''}`);
      created++;
    }

    console.log(`\nDone: ${created} created, ${skipped} skipped`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
