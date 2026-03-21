import { Global, Module } from '@nestjs/common';
import { AdminLogService } from './admin-log.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PageViewService } from './page-view.service';

@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PageViewService, AdminLogService],
  exports: [PageViewService, AdminLogService],
})
export class AnalyticsModule {}
