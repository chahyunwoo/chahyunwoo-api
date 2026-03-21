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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { AdminLogService } from './admin-log.service';
import { AnalyticsService } from './analytics.service';
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
  @Get('dashboard')
  getDashboard() {
    return this.analytics.getDashboardStats();
  }

  @ApiBearerAuth()
  @Get('popular-posts')
  getPopularPosts(@Query('limit') limit?: string) {
    return this.analytics.getPopularPosts(limit ? Number(limit) : undefined);
  }

  @ApiBearerAuth()
  @Get('visitors')
  getVisitors(@Query('days') days?: string, @Query('app') app?: string) {
    return this.analytics.getVisitorStats(days ? Number(days) : undefined, app);
  }

  @ApiBearerAuth()
  @Get('referrers')
  getReferrers(@Query('days') days?: string, @Query('app') app?: string) {
    return this.analytics.getReferrerStats(days ? Number(days) : undefined, app);
  }

  @ApiBearerAuth()
  @Get('popular-pages')
  getPopularPages(
    @Query('days') days?: string,
    @Query('app') app?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.getPopularPages(
      days ? Number(days) : undefined,
      app,
      limit ? Number(limit) : undefined,
    );
  }

  @ApiBearerAuth()
  @Get('system')
  getSystem() {
    return this.analytics.getSystemStatus();
  }

  @ApiBearerAuth()
  @Get('admin-logs')
  getAdminLogs(@Query('limit') limit?: string) {
    return this.adminLog.getRecent(limit ? Number(limit) : undefined);
  }
}
