import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { SkipApiKey } from './common/decorators/skip-api-key.decorator';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Controller()
export class HealthController {
  @Public()
  @SkipApiKey()
  @Get('health')
  @ApiOkResponse({ type: HealthResponseDto })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
