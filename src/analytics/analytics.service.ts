import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  // ─── Post Stats ───────────────────────────────────────────────────────────

  private async getPostStats() {
    const [total, published, draft] = await Promise.all([
      this.prisma.post.count(),
      this.prisma.post.count({ where: { published: true } }),
      this.prisma.post.count({ where: { published: false } }),
    ]);
    return { total, published, draft };
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

  async getPopularPosts(limit = 10) {
    return this.prisma.post.findMany({
      where: { published: true },
      select: { slug: true, title: true, category: true, viewCount: true, createdAt: true },
      orderBy: { viewCount: 'desc' },
      take: limit,
    });
  }

  // ─── Visitor Stats ────────────────────────────────────────────────────────

  async getVisitorStats(days = 30, appName?: string) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = {
      createdAt: { gte: since },
      ...(appName && { appName }),
    };

    const [totalViews, uniqueIps, dailyViews] = await Promise.all([
      this.prisma.pageView.count({ where }),
      this.prisma.pageView.groupBy({ by: ['ipAddress'], where }).then(r => r.length),
      this.prisma.pageView.groupBy({
        by: ['createdAt'],
        where,
        _count: true,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // 일별 집계
    const dailyMap = new Map<string, number>();
    for (const row of dailyViews) {
      const date = row.createdAt.toISOString().split('T')[0];
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + row._count);
    }

    return {
      totalViews,
      uniqueVisitors: uniqueIps,
      daily: Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count })),
    };
  }

  // ─── Referrer Stats ───────────────────────────────────────────────────────

  async getReferrerStats(days = 30, appName?: string) {
    const since = new Date();
    since.setDate(since.getDate() - days);

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

  // ─── Popular Pages ────────────────────────────────────────────────────────

  async getPopularPages(days = 30, appName?: string, limit = 20) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const views = await this.prisma.pageView.groupBy({
      by: ['path'],
      where: {
        createdAt: { gte: since },
        ...(appName && { appName }),
      },
      _count: true,
      orderBy: { _count: { path: 'desc' } },
      take: limit,
    });

    return views.map(v => ({ path: v.path, count: v._count }));
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
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      nodeVersion: process.version,
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
