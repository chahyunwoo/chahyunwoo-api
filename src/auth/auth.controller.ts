import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { SkipApiKey } from '../common/decorators/skip-api-key.decorator';
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
  @ApiOkResponse({ schema: { properties: { accessToken: { type: 'string' } } } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }
}
