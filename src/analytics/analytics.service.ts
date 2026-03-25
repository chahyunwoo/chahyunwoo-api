import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DAYS = 365;
const MAX_LIMIT = 100;

const SEARCH_DOMAINS = new Set([
  'google.com',
  'bing.com',
  'yahoo.com',
  'duckduckgo.com',
  'naver.com',
  'daum.net',
  'baidu.com',
  'yandex.com',
]);
const SOCIAL_DOMAINS = new Set([
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'reddit.com',
  'threads.net',
  'github.com',
]);

function clamp(value: number | undefined, defaultVal: number, max: number): number {
  const v = value ?? defaultVal;
  return Math.min(Math.max(1, v), max);
}

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function categorizeReferrer(domain: string): string {
  if (SEARCH_DOMAINS.has(domain)) return 'search';
  if (SOCIAL_DOMAINS.has(domain)) return 'social';
  return 'other';
}

@Injectable()
export class AnalyticsService {
  private readonly startTime = Date.now();
  private readonly excludeIps: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('ANALYTICS_EXCLUDE_IPS', '');
    this.excludeIps = new Set(
      raw
        .split(',')
        .map(ip => ip.trim())
        .filter(Boolean),
    );
  }

  private get ipFilter(): Prisma.PageViewWhereInput {
    if (this.excludeIps.size === 0) return {};
    return { ipAddress: { notIn: [...this.excludeIps] } };
  }

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

  async getPopularPosts(limit?: number, days?: number) {
    const take = clamp(limit, 10, MAX_LIMIT);

    if (this.excludeIps.size === 0) {
      return this.prisma.post.findMany({
        where: { published: true },
        select: { slug: true, title: true, category: true, viewCount: true, createdAt: true },
        orderBy: { viewCount: 'desc' },
        take,
      });
    }

    const ips = [...this.excludeIps];
    const dayCount = days ? clamp(days, 1, MAX_DAYS) : 0;
    const dateFilter =
      dayCount > 0
        ? Prisma.sql`AND pv.created_at >= NOW() - make_interval(days => ${dayCount})`
        : Prisma.empty;

    const result = await this.prisma.$queryRaw<
      {
        slug: string;
        title: string;
        category: string | null;
        view_count: number;
        created_at: Date;
      }[]
    >`
      SELECT p.slug, p.title, p.category, COUNT(pv.id)::int as view_count, p.created_at
      FROM blog.posts p
      LEFT JOIN analytics.page_views pv
        ON pv.path = '/blog/' || p.slug
        AND pv.ip_address NOT IN (${Prisma.join(ips)})
        ${dateFilter}
      WHERE p.published = true
      GROUP BY p.id
      ORDER BY view_count DESC
      LIMIT ${take}
    `;

    return result.map(r => ({
      slug: r.slug,
      title: r.title,
      category: r.category,
      viewCount: r.view_count,
      createdAt: r.created_at,
    }));
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

    const where: Prisma.PageViewWhereInput = {
      ...this.ipFilter,
      ...(dateFilter && { createdAt: { gte: dateFilter } }),
      ...(appName && { appName }),
    };

    const [totalViews, uniqueResult, dailyResult] = await Promise.all([
      this.prisma.pageView.count({ where }),
      this.prisma.pageView.groupBy({
        by: ['ipAddress'],
        where,
        _count: true,
      }),
      this.prisma.pageView.groupBy({
        by: ['createdAt'],
        where,
        _count: true,
      }),
    ]);

    const dailyMap = new Map<string, number>();
    for (const r of dailyResult) {
      const date = r.createdAt.toISOString().split('T')[0];
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + r._count);
    }

    return {
      totalViews,
      uniqueVisitors: uniqueResult.length,
      daily: [...dailyMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    };
  }

  // ─── Referrer Stats ───────────────────────────────────────────────────────

  async getReferrerStats(days?: number, appName?: string) {
    const d = clamp(days, 30, MAX_DAYS);
    const since = new Date();
    since.setDate(since.getDate() - d);

    const views = await this.prisma.pageView.findMany({
      where: {
        createdAt: { gte: since },
        ...this.ipFilter,
        ...(appName && { appName }),
      },
      select: { referrer: true },
    });

    const total = views.length;
    const grouped = new Map<string, { count: number; category: string }>();

    let directCount = 0;

    for (const v of views) {
      if (!v.referrer) {
        directCount++;
        continue;
      }
      const domain = extractDomain(v.referrer);
      const category = categorizeReferrer(domain);
      const existing = grouped.get(domain);
      if (existing) {
        existing.count++;
      } else {
        grouped.set(domain, { count: 1, category });
      }
    }

    const referrers = [
      {
        source: 'direct',
        category: 'direct',
        count: directCount,
        percentage: total > 0 ? Math.round((directCount / total) * 1000) / 10 : 0,
      },
      ...[...grouped.entries()]
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([source, data]) => ({
          source,
          category: data.category,
          count: data.count,
          percentage: total > 0 ? Math.round((data.count / total) * 1000) / 10 : 0,
        })),
    ];

    const summary = { total, direct: directCount, search: 0, social: 0, other: 0 };
    for (const [, data] of grouped) {
      if (data.category === 'search') summary.search += data.count;
      else if (data.category === 'social') summary.social += data.count;
      else summary.other += data.count;
    }

    return { summary, referrers };
  }

  // ─── Visitors Timeline ────────────────────────────────────────────────────

  async getVisitorsTimeline(days?: number, appName?: string) {
    const d = clamp(days, 7, MAX_DAYS);
    const since = new Date();
    since.setDate(since.getDate() - d);

    const views = await this.prisma.pageView.findMany({
      where: {
        createdAt: { gte: since },
        ...this.ipFilter,
        ...(appName && { appName }),
      },
      select: {
        ipAddress: true,
        path: true,
        referrer: true,
        city: true,
        country: true,
        isBot: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const grouped = new Map<
      string,
      {
        city: string | null;
        country: string | null;
        isBot: boolean;
        visits: { path: string; referrer: string | null; visitedAt: Date }[];
      }
    >();

    for (const v of views) {
      const ip = v.ipAddress ?? 'unknown';
      let visitor = grouped.get(ip);
      if (!visitor) {
        visitor = {
          city: v.city,
          country: v.country,
          isBot: v.isBot,
          visits: [],
        };
        grouped.set(ip, visitor);
      }
      if (!visitor.city && v.city) visitor.city = v.city;
      if (!visitor.country && v.country) visitor.country = v.country;

      visitor.visits.push({
        path: decodeURIComponent(v.path),
        referrer: v.referrer ? extractDomain(v.referrer) : null,
        visitedAt: v.createdAt,
      });
    }

    return [...grouped.entries()]
      .map(([ip, data]) => ({
        ipAddress: this.maskIp(ip),
        city: data.city,
        country: data.country,
        isBot: data.isBot,
        totalViews: data.visits.length,
        visits: data.visits,
      }))
      .sort((a, b) => {
        const aLatest = a.visits[0]?.visitedAt ?? new Date(0);
        const bLatest = b.visits[0]?.visitedAt ?? new Date(0);
        return new Date(bLatest).getTime() - new Date(aLatest).getTime();
      });
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

  private maskIp(ip: string): string {
    if (ip === 'unknown') return 'unknown';
    if (ip.includes(':')) {
      const parts = ip.split(':');
      return `${parts.slice(0, 4).join(':')}:****`;
    }
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  }
}
