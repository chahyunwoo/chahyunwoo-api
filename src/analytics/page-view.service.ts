import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeolocationService } from './geolocation.service';

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

function detectBot(userAgent?: string): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

@Injectable()
export class PageViewService {
  private readonly logger = new Logger(PageViewService.name);
  private readonly excludeIps: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeolocationService,
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

  async track(dto: TrackPageViewInput): Promise<void> {
    const isBot = detectBot(dto.userAgent);
    if (isBot) return;

    if (dto.ipAddress && this.excludeIps.has(dto.ipAddress)) return;

    const record = await this.prisma.pageView.create({
      data: {
        path: decodeURIComponent(dto.path),
        appName: dto.appName,
        referrer: dto.referrer ?? null,
        userAgent: dto.userAgent ?? null,
        ipAddress: dto.ipAddress ?? null,
        isBot,
      },
    });

    if (dto.ipAddress) {
      this.geo
        .lookup(dto.ipAddress)
        .then(geo => {
          if (geo.city || geo.country) {
            return this.prisma.pageView.update({
              where: { id: record.id },
              data: { city: geo.city, country: geo.country },
            });
          }
        })
        .catch(err => this.logger.warn(`Geo update failed: ${err}`));
    }
  }
}
