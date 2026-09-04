import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_LOCALE, LOCALE_CACHE_TTL_MS } from '../portfolio.constants';

/**
 * `?locale=` 값이 portfolio.locales에 등록된 코드인지 검사한다.
 *
 * 캐시 정책 — 두 가지를 함께 지켜야 한다:
 *
 *  (1) **빈 결과는 캐싱하지 않는다.** 이전 구현은 `if (!this.validCodes)`로 판정해서
 *      조회 결과가 0건이면 빈 Set이 그대로 굳었다. 빈 Set은 falsy가 아니므로 재조회가
 *      영구히 일어나지 않고, 그 뒤 DB에 locale이 들어와도 프로세스 재시작 전까지
 *      모든 locale 요청이 400이 됐다. locale 테이블을 비웠다가 채우는 경로
 *      (마이그레이션, 시드, DELETE 후 재등록)에서 포트폴리오 라우트 5개가 전멸한다.
 *
 *  (2) **TTL로 자동 수렴시킨다.** `invalidateCache()` 호출부(createLocale/deleteLocale)만
 *      믿으면 그 경로를 거치지 않는 변경은 전부 빠진다 — DB 직접 삽입, 마이그레이션 시드,
 *      다중 인스턴스에서 다른 인스턴스가 한 변경. 유효 locale은 3건짜리 테이블이라
 *      짧은 TTL로 다시 읽어도 부담이 없다.
 *
 * 즉시 반영이 필요한 경로는 여전히 `invalidateCache()`를 부른다. TTL은 그것을 대체하는
 * 게 아니라, 그 호출이 없는 경로를 위한 안전망이다.
 */
@Injectable()
export class ValidateLocalePipe implements PipeTransform {
  private validCodes: Set<string> | null = null;
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async transform(value: { locale?: string }, _metadata: ArgumentMetadata) {
    const locale = value?.locale ?? DEFAULT_LOCALE;
    const validCodes = await this.getValidCodes();

    if (!validCodes.has(locale)) {
      throw new BadRequestException(`Unsupported locale: ${locale}`);
    }

    return { ...value, locale };
  }

  private async getValidCodes(): Promise<Set<string>> {
    if (this.validCodes && Date.now() - this.loadedAt < LOCALE_CACHE_TTL_MS) {
      return this.validCodes;
    }

    const locales = await this.prisma.locale.findMany({ select: { code: true } });
    const codes = new Set(locales.map(l => l.code));

    // 0건은 "아직 준비되지 않은 상태"로 보고 캐싱하지 않는다. 다음 요청이 다시 조회한다.
    if (codes.size === 0) {
      this.validCodes = null;
      return codes;
    }

    this.validCodes = codes;
    this.loadedAt = Date.now();
    return codes;
  }

  invalidateCache(): void {
    this.validCodes = null;
    this.loadedAt = 0;
  }
}
