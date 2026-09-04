import { ApiProperty } from '@nestjs/swagger';

/**
 * `GET /health` — 배포 파이프라인(deploy.yml)의 헬스체크가 이 200을 본다.
 *
 * **이 응답이 배포의 유일한 게이트다.** 그래서 정적 객체를 돌려주면 안 된다 —
 * DATABASE_URL이 틀려도 200이 나가서 "배포 성공"으로 보이고, 실제로는 모든
 * 요청이 실패하는 상태로 서비스가 올라간다. `database` 필드는 실제 DB에
 * 쿼리를 한 번 던진 결과다.
 */
export class HealthResponseDto {
  @ApiProperty({ example: 'ok', description: "DB까지 정상이면 'ok', 아니면 'error'" })
  status: string;

  @ApiProperty({ example: 'ok', description: "DB 연결 확인 결과. 'ok' | 'error'" })
  database: string;

  @ApiProperty({ type: String, format: 'date-time' })
  timestamp: string;
}
