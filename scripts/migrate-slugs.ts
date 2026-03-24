/**
 * 한국어 슬러그를 nanoid 스타일 랜덤 슬러그로 마이그레이션
 *
 * Usage: npx tsx scripts/migrate-slugs.ts
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
}

function generateSlug(): string {
  return randomBytes(8).toString('base64url').slice(0, 10);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    const posts = await prisma.post.findMany({
      select: { id: true, slug: true, title: true },
    });

    const koreanPosts = posts.filter((p) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(p.slug));

    if (koreanPosts.length === 0) {
      console.log('No Korean slugs found. Nothing to migrate.');
      return;
    }

    console.log(`Found ${koreanPosts.length} posts with Korean slugs:\n`);

    for (const post of koreanPosts) {
      const newSlug = generateSlug();
      await prisma.post.update({
        where: { id: post.id },
        data: { slug: newSlug },
      });
      console.log(`  [${post.id}] "${post.title}"`);
      console.log(`    ${post.slug} → ${newSlug}\n`);
    }

    console.log(`Migrated ${koreanPosts.length} slugs.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
