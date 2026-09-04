import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';
import { SkipApiKey } from './common/decorators/skip-api-key.decorator';
import { HealthResponseDto } from './dto/health-response.dto';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * deploy.yml이 배포 직후 이 엔드포인트를 20회 폴링해 성공하면 배포 완료로 본다.
   *
   * 정적 객체를 돌려주던 때에는 그 검사가 "프로세스가 떠 있다"까지만 확인했다.
   * DB에 못 붙는 상태로 올라와도 200이 나가서 배포가 초록으로 끝났다.
   * 실제 쿼리를 한 번 던져 DB까지 확인한다.
   */
  @Public()
  @SkipApiKey()
  @Get('health')
  @ApiOkResponse({ type: HealthResponseDto })
  async check(): Promise<HealthResponseDto> {
    const timestamp = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok', timestamp };
    } catch (error) {
      // 200에 status:'error'를 실어 보내면 안 된다 — deploy.yml은 `curl -sf`로
      // **HTTP 상태만** 보므로 본문이 무엇이든 배포가 초록으로 끝난다.
      // 503을 내야 헬스체크 루프가 실제로 실패하고 배포가 멈춘다.
      this.logger.error('Health check failed: database unreachable', error);
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'error',
        timestamp,
      });
    }
  }
}
