import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface TrackPageViewDto {
  path: string;
  appName: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class PageViewService {
  constructor(private readonly prisma: PrismaService) {}

  async track(dto: TrackPageViewDto): Promise<void> {
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
