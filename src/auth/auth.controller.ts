import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { SkipApiKey } from '../common/decorators/skip-api-key.decorator';
import { ApiBadRequest, ApiUnauthorized } from '../common/swagger/error-responses';
import type { CookieRequest } from '../types/fastify.d';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  SESSION_TIMEOUT,
  SESSION_TIMEOUT_COOKIE,
} from './auth.constants';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  private readonly isProduction: boolean;
  private readonly cookieDomain: string | undefined;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get('NODE_ENV') === 'production';
    this.cookieDomain = config.get('COOKIE_DOMAIN');
  }

  @Public()
  @SkipApiKey()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorized()
  @ApiBadRequest()
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const result = await this.authService.login(dto.username, dto.password, req.ip);

    if ('requiresTwoFactor' in result) {
      return reply.send(result);
    }

    this.setTokenCookies(reply, result.accessToken, result.refreshToken);
    return reply.send({ message: 'Login successful' });
  }

  @Public()
  @SkipApiKey()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiUnauthorized()
  @ApiBadRequest()
  async verifyTwoFactor(
    @Body() dto: Verify2faDto,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const { accessToken, refreshToken } = await this.authService.verifyTwoFactor(
      dto.twoFactorToken,
      dto.code,
      req.ip,
    );
    this.setTokenCookies(reply, accessToken, refreshToken);
    return reply.send({ message: 'Login successful' });
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorized()
  setupTwoFactor() {
    return this.authService.setupTwoFactor();
  }

  @Public()
  @SkipApiKey()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorized()
  async refresh(@Req() req: CookieRequest, @Res() reply: FastifyReply) {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      return reply.status(HttpStatus.UNAUTHORIZED).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'No refresh token',
      });
    }

    const tokens = await this.authService.refresh(refreshToken, req.ip);
    this.setTokenCookies(reply, tokens.accessToken, tokens.refreshToken);
    return reply.send({ message: 'Token refreshed' });
  }

  @Public()
  @SkipApiKey()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: CookieRequest, @Res() reply: FastifyReply) {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    this.clearTokenCookies(reply);
    return reply.status(HttpStatus.NO_CONTENT).send();
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@Req() req: CookieRequest, @Res() reply: FastifyReply) {
    await this.authService.logoutAll(req.user.username);
    this.clearTokenCookies(reply);
    return reply.status(HttpStatus.NO_CONTENT).send();
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('session/extend')
  @HttpCode(HttpStatus.OK)
  async extendSession(@Res() reply: FastifyReply) {
    reply.setCookie(SESSION_TIMEOUT_COOKIE, String(Date.now() + SESSION_TIMEOUT * 1000), {
      httpOnly: false,
      secure: this.isProduction,
      sameSite: this.isProduction ? ('none' as const) : ('strict' as const),
      ...(this.cookieDomain && { domain: this.cookieDomain }),
      path: '/',
      maxAge: SESSION_TIMEOUT,
    });
    return reply.send({ timeout: SESSION_TIMEOUT });
  }

  // ─── Preview ──────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('preview-token')
  @HttpCode(HttpStatus.OK)
  createPreviewToken() {
    return this.authService.createPreviewToken();
  }

  @Public()
  @Get('verify-preview')
  verifyPreview(@Query('token') token: string, @Res() reply: FastifyReply) {
    const valid = this.authService.verifyPreviewToken(token);
    if (!valid) {
      return reply.status(HttpStatus.UNAUTHORIZED).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or expired preview token',
      });
    }
    return reply.send({ valid: true });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private setTokenCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
    const cookieBase = {
      secure: this.isProduction,
      sameSite: this.isProduction ? ('none' as const) : ('strict' as const),
      ...(this.cookieDomain && { domain: this.cookieDomain }),
    };

    reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...cookieBase,
      httpOnly: true,
      path: '/',
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...cookieBase,
      httpOnly: true,
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    reply.setCookie(SESSION_TIMEOUT_COOKIE, String(Date.now() + SESSION_TIMEOUT * 1000), {
      ...cookieBase,
      httpOnly: false,
      path: '/',
      maxAge: SESSION_TIMEOUT,
    });
  }

  private clearTokenCookies(reply: FastifyReply): void {
    const domainOpt = this.cookieDomain ? { domain: this.cookieDomain } : {};
    reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/', ...domainOpt });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth', ...domainOpt });
    reply.clearCookie(SESSION_TIMEOUT_COOKIE, { path: '/', ...domainOpt });
  }
}
