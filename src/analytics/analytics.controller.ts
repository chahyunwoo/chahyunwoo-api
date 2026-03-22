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
import { ApiBearerAuth, ApiCookieAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { AdminLogService } from './admin-log.service';
import { AnalyticsService } from './analytics.service';
import { TrackPageViewDto } from './dto/track-pageview.dto';
import { PageViewService } from './page-view.service';

function safeInt(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

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
  getDashboard() {
    return this.analytics.getDashboardStats();
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('popular-posts')
  getPopularPosts(@Query('limit') limit?: string) {
    return this.analytics.getPopularPosts(safeInt(limit));
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('visitors')
  getVisitors(@Query('days') days?: string, @Query('app') app?: string) {
    return this.analytics.getVisitorStats(safeInt(days), app);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('referrers')
  getReferrers(@Query('days') days?: string, @Query('app') app?: string) {
    return this.analytics.getReferrerStats(safeInt(days), app);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('system')
  getSystem() {
    return this.analytics.getSystemStatus();
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('admin-logs')
  getAdminLogs(@Query('limit') limit?: string) {
    return this.adminLog.getRecent(safeInt(limit));
  }
}
