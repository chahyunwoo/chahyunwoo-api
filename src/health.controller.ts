import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from './common/decorators/public.decorator';
import { SkipApiKey } from './common/decorators/skip-api-key.decorator';

@ApiTags('health')
@Controller()
export class HealthController {
  @Public()
  @SkipApiKey()
  @Get('health')
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
