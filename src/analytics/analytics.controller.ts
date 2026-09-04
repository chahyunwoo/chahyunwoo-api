import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { AdminLogService } from './admin-log.service';
import { AnalyticsService } from './analytics.service';
import { safeAppName, safeInt } from './analytics.utils';
import {
  AdminLogDto,
  DashboardDto,
  PopularPostDto,
  ReferrerStatsDto,
  SystemStatusDto,
  VisitorStatsDto,
  VisitorTimelineDto,
} from './dto/analytics-response.dto';
import { TrackPageViewDto } from './dto/track-pageview.dto';
import { PageViewService } from './page-view.service';

@ApiTags('analytics')
@Controller('api/analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly pageView: PageViewService,
    private readonly adminLog: AdminLogService,
  ) {}

  // ─── Public (프론트에서 호출) ──────────────────────────────────────────────

  @Public()
  @ApiSecurity('api-key')
  @Post('pageview')
  @HttpCode(HttpStatus.NO_CONTENT)
  trackPageView(@Body() dto: TrackPageViewDto, @Req() req: FastifyRequest) {
    this.pageView
      .track({
        path: dto.path,
        appName: dto.appName,
        referrer: dto.referrer,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      })
      .catch(err => this.logger.error('pageview track failed', err));
  }

  // ─── Admin (JWT 필요) ──────────────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('dashboard')
  @ApiOkResponse({ type: DashboardDto })
  getDashboard() {
    return this.analytics.getDashboardStats();
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('popular-posts')
  @ApiOkResponse({ type: [PopularPostDto] })
  getPopularPosts(@Query('limit') limit?: string, @Query('days') days?: string) {
    return this.analytics.getPopularPosts(safeInt(limit), safeInt(days));
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('visitors')
  @ApiOkResponse({ type: VisitorStatsDto })
  getVisitors(@Query('days') days?: string, @Query('app') app?: string) {
    return this.analytics.getVisitorStats(safeInt(days), safeAppName(app));
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('visitors/timeline')
  @ApiOkResponse({ type: [VisitorTimelineDto] })
  getVisitorsTimeline(@Query('days') days?: string, @Query('app') app?: string) {
    return this.analytics.getVisitorsTimeline(safeInt(days), safeAppName(app));
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('referrers')
  @ApiOkResponse({ type: ReferrerStatsDto })
  getReferrers(@Query('days') days?: string, @Query('app') app?: string) {
    return this.analytics.getReferrerStats(safeInt(days), safeAppName(app));
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('system')
  @ApiOkResponse({ type: SystemStatusDto })
  getSystem() {
    return this.analytics.getSystemStatus();
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('admin-logs')
  @ApiOkResponse({ type: [AdminLogDto] })
  getAdminLogs(@Query('limit') limit?: string) {
    return this.adminLog.getRecent(safeInt(limit));
  }
}
