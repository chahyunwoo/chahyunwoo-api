import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface LogActionDto {
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  username: string;
  ipAddress?: string;
}

@Injectable()
export class AdminLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(dto: LogActionDto): Promise<void> {
    await this.prisma.adminLog.create({
      data: {
        action: dto.action,
        entity: dto.entity,
        entityId: dto.entityId ?? null,
        detail: dto.detail ?? null,
        username: dto.username,
        ipAddress: dto.ipAddress ?? null,
      },
    });
  }

  async getRecent(limit = 20) {
    return this.prisma.adminLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 100),
    });
  }
}
