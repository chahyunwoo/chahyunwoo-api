/**
 * 테스트용 analytics 데이터 시딩
 *
 * Usage: npx tsx scripts/seed-analytics.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    // ─── 포스트 viewCount 랜덤 부여 ──────────────────────────────────────────
    const posts = await prisma.post.findMany({ select: { id: true, slug: true } });
    for (const post of posts) {
      await prisma.post.update({
        where: { id: post.id },
        data: { viewCount: randomInt(10, 500) },
      });
    }
    console.log(`Updated viewCount for ${posts.length} posts`);

    // ─── Page Views (최근 30일) ──────────────────────────────────────────────
    const apps = ['blog', 'portfolio', 'admin'];
    const blogPaths = posts.map(p => `/blog/${p.slug}`);
    const portfolioPaths = ['/about', '/projects', '/experience'];
    const adminPaths = ['/admin/dashboard', '/admin/posts', '/admin/settings'];
    const referrers = [
      'https://google.com',
      'https://www.google.com',
      'https://github.com',
      'https://twitter.com',
      'https://linkedin.com',
      null,
      null,
      null,
    ];

    const pageViews = [];
    for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
      const dailyCount = randomInt(5, 50);
      for (let i = 0; i < dailyCount; i++) {
        const app = randomItem(apps);
        const paths = app === 'blog' ? blogPaths : app === 'portfolio' ? portfolioPaths : adminPaths;
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        date.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59));

        pageViews.push({
          path: randomItem(paths),
          appName: app,
          referrer: randomItem(referrers),
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          ipAddress: `192.168.1.${randomInt(1, 254)}`,
          createdAt: date,
        });
      }
    }

    await prisma.pageView.createMany({ data: pageViews });
    console.log(`Created ${pageViews.length} page views`);

    // ─── Admin Logs ─────────────────────────────────────────────────────────
    const actions = ['create', 'update', 'delete'];
    const entities = ['post', 'experience', 'project', 'skill'];
    const adminLogs = [];

    for (let daysAgo = 0; daysAgo < 14; daysAgo++) {
      const dailyCount = randomInt(0, 3);
      for (let i = 0; i < dailyCount; i++) {
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        date.setHours(randomInt(9, 18), randomInt(0, 59));

        const action = randomItem(actions);
        const entity = randomItem(entities);

        adminLogs.push({
          action,
          entity,
          entityId: entity === 'post' ? randomItem(posts).slug : String(randomInt(1, 10)),
          detail: `${action} ${entity}`,
          username: 'chwzp',
          ipAddress: '127.0.0.1',
          createdAt: date,
        });
      }
    }

    await prisma.adminLog.createMany({ data: adminLogs });
    console.log(`Created ${adminLogs.length} admin logs`);

    console.log('\nAnalytics seed complete!');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
