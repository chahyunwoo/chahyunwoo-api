import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { SkipApiKey } from '../common/decorators/skip-api-key.decorator';
import { ApiBadRequest, ApiUnauthorized } from '../common/swagger/error-responses';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
  login(@Body() dto: LoginDto, @Req() req: FastifyRequest) {
    return this.authService.login(dto.username, dto.password, req.ip);
  }

  @Public()
  @SkipApiKey()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiUnauthorized()
  refresh(@Body() dto: RefreshTokenDto, @Req() req: FastifyRequest) {
    return this.authService.refresh(dto.refreshToken, req.ip);
  }

  @Public()
  @SkipApiKey()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  logoutAll(@Req() req: FastifyRequest & { user: { username: string } }) {
    return this.authService.logoutAll(req.user.username);
  }
}
