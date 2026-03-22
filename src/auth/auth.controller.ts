import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
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

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @SkipApiKey()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorized()
  @ApiBadRequest()
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const { accessToken, refreshToken } = await this.authService.login(
      dto.username,
      dto.password,
      req.ip,
    );
    this.setTokenCookies(reply, accessToken, refreshToken);
    return reply.send({ message: 'Login successful' });
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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
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
    const isProduction = process.env.NODE_ENV === 'production';

    reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    reply.setCookie(SESSION_TIMEOUT_COOKIE, String(Date.now() + SESSION_TIMEOUT * 1000), {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: SESSION_TIMEOUT,
    });
  }

  private clearTokenCookies(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });
    reply.clearCookie(SESSION_TIMEOUT_COOKIE, { path: '/' });
  }
}
