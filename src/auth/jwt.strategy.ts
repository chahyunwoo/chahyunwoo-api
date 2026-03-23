import type { IncomingMessage } from 'node:http';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE } from './auth.constants';

interface JwtPayload {
  sub: string;
}

interface RequestWithCookies extends IncomingMessage {
  cookies?: Record<string, string>;
  headers: IncomingMessage['headers'] & { authorization?: string };
}

function extractFromCookieOrHeader(req: RequestWithCookies): string | null {
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (cookieToken) return cookieToken;

  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
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
