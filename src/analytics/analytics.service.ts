import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DAYS = 365;
const MAX_LIMIT = 100;

function clamp(value: number | undefined, defaultVal: number, max: number): number {
  const v = value ?? defaultVal;
  return Math.min(Math.max(1, v), max);
}

@Injectable()
export class AnalyticsService {
  private readonly startTime = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Dashboard Stats ──────────────────────────────────────────────────────

  async getDashboardStats() {
    const [postStats, categoryStats, recentPosts, recentlyUpdated] = await Promise.all([
      this.getPostStats(),
      this.getCategoryDistribution(),
      this.getRecentPosts(),
      this.getRecentlyUpdatedPosts(),
    ]);

    return { postStats, categoryStats, recentPosts, recentlyUpdated };
  }

  private async getPostStats() {
    const [total, published] = await Promise.all([
      this.prisma.post.count(),
      this.prisma.post.count({ where: { published: true } }),
    ]);
    return { total, published, draft: total - published };
  }

  private async getCategoryDistribution() {
    const result = await this.prisma.post.groupBy({
      by: ['category'],
      where: { published: true, category: { not: null } },
      _count: true,
      orderBy: { _count: { category: 'desc' } },
    });

    return result.map(r => ({ category: r.category as string, count: r._count }));
  }

  private async getRecentPosts() {
    return this.prisma.post.findMany({
      where: { published: true },
      select: { slug: true, title: true, category: true, viewCount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  private async getRecentlyUpdatedPosts() {
    return this.prisma.post.findMany({
      select: { slug: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
  }

  // ─── Popular Posts ────────────────────────────────────────────────────────

  async getPopularPosts(limit?: number) {
    return this.prisma.post.findMany({
      where: { published: true },
      select: { slug: true, title: true, category: true, viewCount: true, createdAt: true },
      orderBy: { viewCount: 'desc' },
      take: clamp(limit, 10, MAX_LIMIT),
    });
  }

  // ─── Visitor Stats ────────────────────────────────────────────────────────

  async getVisitorStats(days?: number, appName?: string) {
    const dateFilter = days
      ? (() => {
          const d = clamp(days, 1, MAX_DAYS);
          const since = new Date();
          since.setDate(since.getDate() - d);
          return since;
        })()
      : undefined;

    const appFilter = appName ? Prisma.sql`AND app_name = ${appName}` : Prisma.empty;
    const dateWhere = dateFilter
      ? Prisma.sql`WHERE created_at >= ${dateFilter} ${appFilter}`
      : appName
        ? Prisma.sql`WHERE app_name = ${appName}`
        : Prisma.sql`WHERE 1=1`;

    const [totalViews, uniqueResult, dailyResult] = await Promise.all([
      this.prisma.pageView.count({
        where: {
          ...(dateFilter && { createdAt: { gte: dateFilter } }),
          ...(appName && { appName }),
        },
      }),
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT ip_address) as count
        FROM analytics.page_views
        ${dateWhere}
      `,
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM analytics.page_views
        ${dateWhere}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
    ]);

    return {
      totalViews,
      uniqueVisitors: Number(uniqueResult[0]?.count ?? 0),
      daily: dailyResult.map(r => ({ date: String(r.date), count: Number(r.count) })),
    };
  }

  // ─── Referrer Stats ───────────────────────────────────────────────────────

  async getReferrerStats(days?: number, appName?: string) {
    const d = clamp(days, 30, MAX_DAYS);
    const since = new Date();
    since.setDate(since.getDate() - d);

    const views = await this.prisma.pageView.groupBy({
      by: ['referrer'],
      where: {
        createdAt: { gte: since },
        referrer: { not: null },
        ...(appName && { appName }),
      },
      _count: true,
      orderBy: { _count: { referrer: 'desc' } },
      take: 20,
    });

    return views.map(v => ({ referrer: v.referrer as string, count: v._count }));
  }

  // ─── System Status ────────────────────────────────────────────────────────

  async getSystemStatus() {
    const uptimeMs = Date.now() - this.startTime;

    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    return {
      uptime: Math.floor(uptimeMs / 1000),
      uptimeFormatted: this.formatUptime(uptimeMs),
      database: dbStatus,
      memory: (() => {
        const mem = process.memoryUsage();
        return {
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          rss: Math.round(mem.rss / 1024 / 1024),
        };
      })(),
    };
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }
}
