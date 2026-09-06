import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

const MACHINE_KEY_VALUE = 'm'.repeat(64);
const OTHER_KEY = 'x'.repeat(64);

/**
 * 무인 발행용 머신 키 경로를 검사한다.
 *
 * 이 가드는 **인증 수단을 하나 더 허용**할 뿐이므로, 다음 둘을 다 봐야 한다.
 *   ① 유효한 머신 키는 JWT 없이 통과한다 (그래야 스케줄러가 돈다)
 *   ② 그 외 모든 경우는 JWT 검사로 떨어진다 (통과시켜 버리면 인증이 뚫린다)
 *
 * ②를 확인하려고 super.canActivate 를 가로채 '떨어졌다'를 관측한다 —
 * true/false 반환만 보면 "머신 키로 통과"와 "JWT 로 통과"가 구별되지 않는다.
 */
describe('JwtAuthGuard 머신 키', () => {
  function makeContext(headers: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  /** @returns [가드, JWT 검사로 떨어졌는지 알려주는 함수] */
  function makeGuard(opts: { isPublic?: boolean; isMachine?: boolean; configured?: boolean }) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === 'isPublic' ? !!opts.isPublic : !!opts.isMachine,
      ),
    } as unknown as Reflector;
    const config = {
      get: jest.fn(() => (opts.configured === false ? '' : MACHINE_KEY_VALUE)),
    } as unknown as ConfigService;

    const guard = new JwtAuthGuard(reflector, config);
    let fellThrough = false;
    // passport 의 실제 JWT 검증 대신, 여기까지 왔다는 사실만 기록한다.
    Object.getPrototypeOf(Object.getPrototypeOf(guard)).canActivate = () => {
      fellThrough = true;
      return false;
    };
    return { guard, fellThrough: () => fellThrough };
  }

  it('유효한 머신 키는 JWT 없이 통과한다', () => {
    const { guard, fellThrough } = makeGuard({ isMachine: true });
    expect(guard.canActivate(makeContext({ 'x-machine-key': MACHINE_KEY_VALUE }))).toBe(true);
    expect(fellThrough()).toBe(false);
  });

  it('머신 라우트가 아니면 키가 맞아도 JWT 검사로 간다', () => {
    const { guard, fellThrough } = makeGuard({ isMachine: false });
    guard.canActivate(makeContext({ 'x-machine-key': MACHINE_KEY_VALUE }));
    expect(fellThrough()).toBe(true);
  });

  it('틀린 머신 키는 JWT 검사로 간다', () => {
    const { guard, fellThrough } = makeGuard({ isMachine: true });
    guard.canActivate(makeContext({ 'x-machine-key': OTHER_KEY }));
    expect(fellThrough()).toBe(true);
  });

  it('머신 키 헤더가 없으면 JWT 검사로 간다', () => {
    const { guard, fellThrough } = makeGuard({ isMachine: true });
    guard.canActivate(makeContext({}));
    expect(fellThrough()).toBe(true);
  });

  it('BLOG_MACHINE_KEY 가 비어 있으면 빈 헤더로도 뚫리지 않는다', () => {
    const { guard, fellThrough } = makeGuard({ isMachine: true, configured: false });
    guard.canActivate(makeContext({ 'x-machine-key': '' }));
    expect(fellThrough()).toBe(true);
  });

  it('길이가 다른 멀티바이트 키에도 500 이 아니라 JWT 검사로 간다', () => {
    // 문자 수는 같아도 바이트 수가 다르면 timingSafeEqual 이 RangeError 를
    // 던진다. 바이트로 먼저 걸러야 한다(api-key.guard 에서 실제로 겪었다).
    const { guard, fellThrough } = makeGuard({ isMachine: true });
    const sameCharsDifferentBytes = `${'m'.repeat(63)}가`;
    expect(() =>
      guard.canActivate(makeContext({ 'x-machine-key': sameCharsDifferentBytes })),
    ).not.toThrow();
    expect(fellThrough()).toBe(true);
  });

  it('공개 라우트는 그대로 통과한다', () => {
    const { guard, fellThrough } = makeGuard({ isPublic: true });
    expect(guard.canActivate(makeContext({}))).toBe(true);
    expect(fellThrough()).toBe(false);
  });
});
