import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { SKIP_API_KEY } from '../decorators/skip-api-key.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skipApiKey = this.reflector.getAllAndOverride<boolean>(SKIP_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipApiKey) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // JWT 토큰이 있으면 어드민 요청이므로 API Key 체크 건너뜀
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return true;
    const cookieToken = (request as FastifyRequest & { cookies: Record<string, string> }).cookies
      ?.access_token;
    if (cookieToken) return true;

    const apiKey = request.headers['x-api-key'];
    const expectedKey = this.config.getOrThrow<string>('API_KEY');

    if (apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
