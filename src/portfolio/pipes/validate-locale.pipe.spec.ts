import type { ArgumentMetadata } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { LOCALE_CACHE_TTL_MS } from '../portfolio.constants';
import { ValidateLocalePipe } from './validate-locale.pipe';

const META = {} as ArgumentMetadata;

/**
 * findMany가 무엇을 돌려줄지 테스트가 바꿀 수 있게 하고, 호출 횟수를 센다.
 * 캐시 동작 검증에는 "몇 번 조회했는가"가 핵심 관측값이다.
 */
function makePrisma(initial: string[]) {
  const state = { codes: initial, calls: 0 };
  const prisma = {
    locale: {
      findMany: jest.fn(async () => {
        state.calls++;
        return state.codes.map(code => ({ code }));
      }),
    },
  } as unknown as PrismaService;
  return { prisma, state };
}

describe('ValidateLocalePipe', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('등록된 locale은 통과시키고 값을 채워 돌려준다', async () => {
    const { prisma } = makePrisma(['ko', 'en']);
    const pipe = new ValidateLocalePipe(prisma);

    await expect(pipe.transform({ locale: 'en' }, META)).resolves.toEqual({ locale: 'en' });
  });

  it('locale이 없으면 기본값(ko)을 넣는다', async () => {
    const { prisma } = makePrisma(['ko']);
    const pipe = new ValidateLocalePipe(prisma);

    await expect(pipe.transform({}, META)).resolves.toEqual({ locale: 'ko' });
  });

  it('등록되지 않은 locale은 400으로 거부한다', async () => {
    const { prisma } = makePrisma(['ko']);
    const pipe = new ValidateLocalePipe(prisma);

    await expect(pipe.transform({ locale: 'xx' }, META)).rejects.toThrow(BadRequestException);
  });

  it('TTL 안에서는 DB를 다시 읽지 않는다', async () => {
    const { prisma, state } = makePrisma(['ko']);
    const pipe = new ValidateLocalePipe(prisma);

    await pipe.transform({ locale: 'ko' }, META);
    await pipe.transform({ locale: 'ko' }, META);
    await pipe.transform({ locale: 'ko' }, META);

    expect(state.calls).toBe(1);
  });

  /**
   * 이 이슈(#108)의 핵심 회귀. 이전 구현은 조회 결과가 0건일 때 빈 Set을 캐시에
   * 굳혀버려(빈 Set은 falsy가 아니다) 그 뒤 locale이 추가돼도 프로세스 재시작
   * 전까지 계속 400을 냈다.
   */
  it('조회 결과가 0건이면 캐싱하지 않고, 이후 추가된 locale이 즉시 반영된다', async () => {
    const { prisma, state } = makePrisma([]);
    const pipe = new ValidateLocalePipe(prisma);

    // locale 0건 상태에서 요청 → 거부되는 것 자체는 맞다
    await expect(pipe.transform({ locale: 'ko' }, META)).rejects.toThrow(BadRequestException);
    expect(state.calls).toBe(1);

    // DB에 locale이 들어왔다 (invalidateCache를 부르지 않는 경로: 마이그레이션/시드/직접삽입)
    state.codes = ['ko', 'en'];

    // 재시작 없이 다음 요청에서 반영되어야 한다
    await expect(pipe.transform({ locale: 'ko' }, META)).resolves.toEqual({ locale: 'ko' });
    expect(state.calls).toBe(2);
  });

  /**
   * invalidateCache()를 부르지 않는 경로(DB 직접 변경, 다른 인스턴스의 변경)를 위한 안전망.
   * TTL이 지나면 다시 읽어야 한다.
   */
  it('TTL이 지나면 DB를 다시 읽어 변경을 반영한다', async () => {
    jest.useFakeTimers();
    const { prisma, state } = makePrisma(['ko']);
    const pipe = new ValidateLocalePipe(prisma);

    await pipe.transform({ locale: 'ko' }, META);
    expect(state.calls).toBe(1);

    // 아직 TTL 안 — 새 locale은 안 보인다
    state.codes = ['ko', 'jp'];
    await expect(pipe.transform({ locale: 'jp' }, META)).rejects.toThrow(BadRequestException);
    expect(state.calls).toBe(1);

    jest.advanceTimersByTime(LOCALE_CACHE_TTL_MS + 1);

    await expect(pipe.transform({ locale: 'jp' }, META)).resolves.toEqual({ locale: 'jp' });
    expect(state.calls).toBe(2);
  });

  it('invalidateCache()를 부르면 TTL 전이라도 다시 읽는다', async () => {
    const { prisma, state } = makePrisma(['ko']);
    const pipe = new ValidateLocalePipe(prisma);

    await pipe.transform({ locale: 'ko' }, META);
    expect(state.calls).toBe(1);

    state.codes = ['ko', 'en'];
    pipe.invalidateCache();

    await expect(pipe.transform({ locale: 'en' }, META)).resolves.toEqual({ locale: 'en' });
    expect(state.calls).toBe(2);
  });
});
