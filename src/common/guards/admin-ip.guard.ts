import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AdminIpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 공개 API는 IP 제한 없음
    if (isPublic) return true;

    const whitelist = this.config.get<string>('ADMIN_IP_WHITELIST', '');
    // whitelist 미설정이면 제한 안 함 (개발 환경)
    if (!whitelist) return true;

    const allowedIps = whitelist.split(',').map(ip => ip.trim());
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const clientIp = request.ip;

    if (!allowedIps.includes(clientIp)) {
      throw new ForbiddenException('Access denied from this IP');
    }

    return true;
  }
}
