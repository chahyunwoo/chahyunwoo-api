import { ApiProperty } from '@nestjs/swagger';

/**
 * analytics 도메인의 응답 스키마.
 *
 * 필드는 실제 응답을 받아 관측한 것이다. 집계 결과라 DB 모델과 1:1이 아니고
 * 서비스가 조립한 형태이므로, 스키마만 보고 추측하면 어긋난다.
 */

// ─── Dashboard ────────────────────────────────────────────────────────────────

export class PostStatsDto {
  @ApiProperty({ example: 40 })
  total: number;

  @ApiProperty({ example: 38 })
  published: number;

  @ApiProperty({ example: 2 })
  draft: number;
}

export class CategoryStatDto {
  @ApiProperty({ example: 'Frontend' })
  category: string;

  @ApiProperty({ example: 8 })
  count: number;
}

export class DashboardPostDto {
  @ApiProperty({ example: 'abc123' })
  slug: string;

  @ApiProperty({ example: '글 제목' })
  title: string;

  @ApiProperty({ type: String, nullable: true, example: 'Frontend' })
  category: string | null;

  @ApiProperty({ example: 128 })
  viewCount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

export class RecentlyUpdatedPostDto {
  @ApiProperty({ example: 'abc123' })
  slug: string;

  @ApiProperty({ example: '글 제목' })
  title: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;
}

export class DashboardDto {
  @ApiProperty({ type: PostStatsDto })
  postStats: PostStatsDto;

  @ApiProperty({ type: [CategoryStatDto] })
  categoryStats: CategoryStatDto[];

  @ApiProperty({ type: [DashboardPostDto] })
  recentPosts: DashboardPostDto[];

  @ApiProperty({ type: [RecentlyUpdatedPostDto] })
  recentlyUpdated: RecentlyUpdatedPostDto[];
}

// ─── Visitors ─────────────────────────────────────────────────────────────────

export class DailyViewDto {
  @ApiProperty({ example: '2026-09-04', description: 'YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: 42 })
  count: number;
}

export class VisitorStatsDto {
  @ApiProperty({ example: 991 })
  totalViews: number;

  @ApiProperty({ example: 210, description: 'IP 기준 고유 방문자' })
  uniqueVisitors: number;

  @ApiProperty({ type: [DailyViewDto], description: '날짜 오름차순' })
  daily: DailyViewDto[];
}

export class VisitDto {
  @ApiProperty({ example: '/blog/abc123', description: 'URL 디코딩된 경로' })
  path: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'google.com',
    description: '도메인만 남긴다',
  })
  referrer: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  visitedAt: string;
}

/** `GET /api/analytics/visitors/timeline` — IP별로 묶은 방문 이력. IP는 마스킹된다. */
export class VisitorTimelineDto {
  @ApiProperty({ example: '123.45.*.*', description: '마스킹된 IP' })
  ipAddress: string;

  @ApiProperty({ type: String, nullable: true, example: 'Seoul' })
  city: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'KR' })
  country: string | null;

  @ApiProperty({ example: false })
  isBot: boolean;

  @ApiProperty({ example: 5 })
  totalViews: number;

  @ApiProperty({ type: [VisitDto], description: '최근 방문 우선' })
  visits: VisitDto[];
}

// ─── Referrers ────────────────────────────────────────────────────────────────

export class ReferrerSummaryDto {
  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 40, description: '리퍼러 없음' })
  direct: number;

  @ApiProperty({ example: 30 })
  search: number;

  @ApiProperty({ example: 20 })
  social: number;

  @ApiProperty({ example: 10 })
  other: number;
}

export class ReferrerItemDto {
  @ApiProperty({ example: 'google.com' })
  source: string;

  /**
   * 자유 문자열이 아니라 `categorizeReferrer()`가 넷 중 하나로만 채운다.
   * 프론트가 이 값을 색·라벨 매핑의 키로 쓰므로(`Record<ReferrerCategory, string>`)
   * `string`으로 열어두면 인덱싱이 막힌다.
   */
  @ApiProperty({ enum: ['direct', 'search', 'social', 'other'], example: 'search' })
  category: 'direct' | 'search' | 'social' | 'other';

  @ApiProperty({ example: 30 })
  count: number;

  @ApiProperty({ example: 30, description: '전체 대비 백분율(정수)' })
  percentage: number;
}

export class ReferrerStatsDto {
  @ApiProperty({ type: ReferrerSummaryDto })
  summary: ReferrerSummaryDto;

  @ApiProperty({ type: [ReferrerItemDto], description: 'count 내림차순' })
  referrers: ReferrerItemDto[];
}

// ─── Popular posts / Admin logs / System ──────────────────────────────────────

export class PopularPostDto {
  @ApiProperty({ example: 'abc123' })
  slug: string;

  @ApiProperty({ example: '글 제목' })
  title: string;

  @ApiProperty({ type: String, nullable: true, example: 'Frontend' })
  category: string | null;

  @ApiProperty({ example: 128 })
  viewCount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

export class AdminLogDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'create', description: 'create | update | delete 등' })
  action: string;

  @ApiProperty({ example: 'post' })
  entity: string;

  @ApiProperty({ type: String, nullable: true, example: 'abc123' })
  entityId: string | null;

  @ApiProperty({ type: String, nullable: true, description: '글 제목 등 부가 정보' })
  detail: string | null;

  @ApiProperty({ example: 'admin' })
  username: string;

  @ApiProperty({ type: String, nullable: true })
  ipAddress: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

export class MemoryUsageDto {
  @ApiProperty({ example: 52428800, description: '바이트' })
  heapUsed: number;

  @ApiProperty({ example: 83886080 })
  heapTotal: number;

  @ApiProperty({ example: 125829120, description: 'Resident Set Size' })
  rss: number;
}

export class SystemStatusDto {
  @ApiProperty({ example: 86400000, description: '프로세스 기동 후 경과 밀리초' })
  uptime: number;

  @ApiProperty({ example: '1d 0h 0m' })
  uptimeFormatted: string;

  @ApiProperty({ example: 'connected', description: 'connected | disconnected' })
  database: string;

  @ApiProperty({ type: MemoryUsageDto })
  memory: MemoryUsageDto;
}
