import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BlogModule } from './blog/blog.module';
import { HttpModule } from './common/http.module';
import { MailModule } from './common/mail/mail.module';
import { HealthController } from './health.controller';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PrismaModule } from './prisma/prisma.module';
import { RevalidationModule } from './revalidation/revalidation.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.register({ isGlobal: true, ttl: 60_000 }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    StorageModule,
    RevalidationModule,
    AnalyticsModule,
    AuthModule,
    BlogModule,
    PortfolioModule,
    HttpModule,
    MailModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
