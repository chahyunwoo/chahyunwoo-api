import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface TrackPageViewInput {
  path: string;
  appName: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
}

const BOT_PATTERNS = [
  /bot/i,
  /crawl/i,
  /spider/i,
  /slurp/i,
  /mediapartners/i,
  /googlebot/i,
  /bingbot/i,
  /yandex/i,
  /baidu/i,
  /duckduck/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /semrush/i,
  /ahref/i,
  /mj12bot/i,
  /dotbot/i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
];

function isBot(userAgent?: string): boolean {
  if (!userAgent) return false;
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

@Injectable()
export class PageViewService {
  constructor(private readonly prisma: PrismaService) {}

  async track(dto: TrackPageViewInput): Promise<void> {
    if (isBot(dto.userAgent)) return;

    await this.prisma.pageView.create({
      data: {
        path: dto.path,
        appName: dto.appName,
        referrer: dto.referrer ?? null,
        userAgent: dto.userAgent ?? null,
        ipAddress: dto.ipAddress ?? null,
      },
    });
  }
}
