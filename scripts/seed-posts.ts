/**
 * MDX 파일 + 이미지(썸네일/본문)를 R2에 업로드하고 DB에 시드
 *
 * Usage:
 *   npx tsx scripts/seed-posts.ts <posts-dir> <public-dir>
 *
 * Example:
 *   npx tsx scripts/seed-posts.ts \
 *     ../hyunwoo-blog-nextjs/src/posts \
 *     ../hyunwoo-blog-nextjs/public
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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── R2 Upload ──────────────────────────────────────────────────────────────

async function uploadFileToR2(
  s3: S3Client,
  bucket: string,
  localPath: string,
  r2Key: string,
): Promise<string | null> {
  if (!fs.existsSync(localPath)) {
    console.warn(`  File not found: ${localPath}`);
    return null;
  }

  const ext = path.extname(localPath).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    console.warn(`  Unsupported image type: ${ext}`);
    return null;
  }

  const buffer = fs.readFileSync(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return `${getEnvOrThrow('R2_PUBLIC_URL')}/${r2Key}`;
}

async function uploadPostImages(
  s3: S3Client,
  bucket: string,
  publicDir: string,
  slug: string,
): Promise<number> {
  const postImagesDir = path.join(publicDir, 'posts', slug);
  if (!fs.existsSync(postImagesDir)) return 0;

  const images = await fg('*.{png,jpg,jpeg,webp,gif}', {
    cwd: postImagesDir,
    absolute: true,
  });

  for (const imagePath of images) {
    const filename = path.basename(imagePath);
    const r2Key = `blog/posts/${slug}/${filename}`;
    await uploadFileToR2(s3, bucket, imagePath, r2Key);
  }

  return images.length;
}

function rewriteImagePaths(content: string, publicUrl: string): string {
  // /posts/slug/image.png → https://assets.chahyunwoo.dev/blog/posts/slug/image.png
  // /thumbnail/image.png → https://assets.chahyunwoo.dev/blog/thumbnails/image.png
  return content
    .replace(/src="\/posts\//g, `src="${publicUrl}/blog/posts/`)
    .replace(/\(\/posts\//g, `(${publicUrl}/blog/posts/`)
    .replace(/src="\/thumbnail\//g, `src="${publicUrl}/blog/thumbnails/`)
    .replace(/\(\/thumbnail\//g, `(${publicUrl}/blog/thumbnails/`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [postsDir, publicDir] = process.argv.slice(2);

  if (!postsDir || !publicDir) {
    console.error('Usage: npx tsx scripts/seed-posts.ts <posts-dir> <public-dir>');
    process.exit(1);
  }

  const resolvedPostsDir = path.resolve(postsDir);
  const resolvedPublicDir = path.resolve(publicDir);

  if (!fs.existsSync(resolvedPostsDir)) {
    console.error(`Posts directory not found: ${resolvedPostsDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(resolvedPublicDir)) {
    console.error(`Public directory not found: ${resolvedPublicDir}`);
    process.exit(1);
  }

  const prisma = await createPrismaClient();
  const s3 = createS3Client();
  const bucket = getEnvOrThrow('R2_BUCKET_NAME');
  const publicUrl = getEnvOrThrow('R2_PUBLIC_URL');

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
    let totalImages = 0;

    for (const post of posts) {
      const existing = await prisma.post.findUnique({ where: { slug: post.slug } });
      if (existing) {
        console.log(`  SKIP  ${post.slug}`);
        skipped++;
        continue;
      }

      // 썸네일 R2 업로드
      let thumbnailUrl: string | null = null;
      if (post.meta.thumbnail) {
        const filename = path.basename(post.meta.thumbnail);
        const localPath = path.join(resolvedPublicDir, 'thumbnail', filename);
        thumbnailUrl = await uploadFileToR2(s3, bucket, localPath, `blog/thumbnails/${filename}`);
      }

      // 본문 이미지 R2 업로드
      const imageCount = await uploadPostImages(s3, bucket, resolvedPublicDir, post.slug);
      totalImages += imageCount;

      // 본문 내 이미지 경로 치환
      const rewrittenContent = rewriteImagePaths(post.content, publicUrl);

      await prisma.post.create({
        data: {
          title: post.meta.title,
          slug: post.slug,
          description: post.meta.description || null,
          content: rewrittenContent,
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

      const extras = [thumbnailUrl && 'thumbnail', imageCount > 0 && `${imageCount} images`]
        .filter(Boolean)
        .join(', ');
      console.log(`  CREATE ${post.slug}${extras ? ` (${extras})` : ''}`);
      created++;
    }

    console.log(`\nDone: ${created} created, ${skipped} skipped, ${totalImages} post images uploaded`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
