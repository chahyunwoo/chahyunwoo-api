import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

/**
 * 만료된 리프레시 토큰을 주기적으로 지운다.
 *
 * `AuthService.cleanupExpiredTokens()`는 구현돼 있었지만 **호출부가 0개**였다.
 * 그 결과 운영 DB의 `auth.refresh_tokens` 25건이 전부 만료 상태로 쌓여 있었다
 * (2026-09-04 실측: total 25 / expired 25).
 *
 * `refresh()`가 만료 토큰도 조회 즉시 삭제하므로 기능은 정상이지만,
 * 로그인만 하고 갱신하지 않은 세션의 토큰은 아무도 지우지 않아 단조 증가한다.
 *
 * StorageCleanupTask와 같은 시각대를 피해 4시로 둔다 — 둘 다 새벽에 도는
 * 정리 작업이라 겹칠 이유가 없다.
 */
@Injectable()
export class TokenCleanupTask {
  private readonly logger = new Logger(TokenCleanupTask.name);

  constructor(private readonly auth: AuthService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleCleanup(): Promise<void> {
    try {
      const deleted = await this.auth.cleanupExpiredTokens();
      if (deleted > 0) {
        this.logger.log(`Expired refresh tokens deleted: ${deleted}`);
      }
    } catch (error) {
      // 크론이 죽으면 다음 실행까지 정리가 멈춘다. 삼키되 남긴다.
      this.logger.error('Refresh token cleanup failed', error);
    }
  }
}
