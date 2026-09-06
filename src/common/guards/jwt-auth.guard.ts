import { type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';

import { MACHINE_KEY } from '../decorators/machine-key.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeyGuard } from './api-key.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    // 머신 라우트는 전용 키로도 통과시킨다. 스케줄러가 블로그 글을 무인
    // 발행하는데, JWT 는 로그인 + 2FA 로 발급돼 기계가 쓸 수 없다.
    //
    // ⚠️ 조회용 API_KEY 가 아니라 BLOG_MACHINE_KEY 다 — 프런트가 들고 다니는
    // 조회 키가 새어도 발행까지 뚫리면 안 된다.
    // 키가 없거나 틀리면 아래 JWT 검사로 떨어지므로, 어드민 경로는 그대로다.
    const isMachine = this.reflector.getAllAndOverride<boolean>(MACHINE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isMachine) {
      const request = context.switchToHttp().getRequest<FastifyRequest>();
      const expected = this.config.get<string>('BLOG_MACHINE_KEY', '');
      if (ApiKeyGuard.hasValidMachineKey(request, expected)) return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser | false | null): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException();
    }
    return user;
  }
}
