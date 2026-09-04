import { ApiProperty } from '@nestjs/swagger';

/** `GET /health` — 배포 파이프라인(deploy.yml)의 헬스체크가 이 200을 본다. */
export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp: string;
}
