import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
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

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 공개 API → 반드시 API Key 검증
    if (isPublic) {
      return this.validateApiKey(context);
    }

    // 비공개 API → JWT 인증이 처리하므로 건너뜀
    return true;
  }

  /**
   * 머신 키가 유효한가. 헤더가 없거나 틀리면 false 를 돌려준다 —
   * 여기서 던지지 않는 이유는 JWT 라는 다른 인증 수단이 남아 있기 때문이다.
   * 실제 401 은 두 수단이 모두 실패했을 때 JwtAuthGuard 가 던진다.
   */
  static hasValidMachineKey(request: FastifyRequest, expected: string): boolean {
    const provided = request.headers['x-machine-key'];
    if (!expected || typeof provided !== 'string') return false;
    // 길이 비교는 바이트 기준이어야 한다(아래 validateApiKey 주석 참고).
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private validateApiKey(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const apiKey = request.headers['x-api-key'];
    const expectedKey = this.config.getOrThrow<string>('API_KEY');

    if (typeof apiKey !== 'string') {
      throw new UnauthorizedException('Invalid API key');
    }

    // 길이 비교는 **바이트** 기준이어야 한다.
    //
    // `apiKey.length`(문자 수)로 거르면 멀티바이트 문자가 섞인 헤더가 이 가드를
    // 통과한다. 예: 32자 ASCII 키에 대해 "31자 ASCII + 2바이트 문자 1개"는
    // 문자 수가 32로 같지만 바이트는 33이다. 그 상태로 timingSafeEqual에 넘기면
    // RangeError를 던지는데, 이건 HttpException이 아니라 예외 필터의 마지막
    // 분기로 떨어져 **401이 아니라 500**이 나간다. 즉 인증 없이 임의 횟수로
    // 500과 에러 스택 로그를 유발할 수 있었다.
    const provided = Buffer.from(apiKey, 'utf8');
    const expected = Buffer.from(expectedKey, 'utf8');

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
