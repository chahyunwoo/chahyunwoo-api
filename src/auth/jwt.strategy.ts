import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
}

function extractFromCookieOrHeader(req: FastifyRequest): string | null {
  const cookieToken = (req as FastifyRequest & { cookies: Record<string, string> }).cookies
    ?.access_token;
  if (cookieToken) return cookieToken;

  return ExtractJwt.fromAuthHeaderAsBearerToken()(req as never);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): { username: string } {
    if (!payload.sub) throw new UnauthorizedException();
    return { username: payload.sub };
  }
}
