import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';

const VALID_KEY = 'a'.repeat(32);

/**
 * API 키 검증이 **모든 실패를 401로** 처리하는지 검사한다.
 *
 * 예전 구현은 길이 비교에 `String.length`(문자 수)를 썼다. 멀티바이트 문자가
 * 섞이면 문자 수는 같은데 바이트 수가 달라져 `timingSafeEqual`이 RangeError를
 * 던졌고, 그건 HttpException이 아니라서 예외 필터에서 **500**이 됐다.
 * 즉 인증 없이 500과 에러 스택 로그를 임의 횟수 유발할 수 있었다.
 */
describe('ApiKeyGuard', () => {
  function makeContext(headerValue: unknown): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-api-key': headerValue } }),
      }),
    } as unknown as ExecutionContext;
  }

  function makeGuard(isPublic = true, skipApiKey = false) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === 'skipApiKey') return skipApiKey;
        return isPublic;
      }),
    } as unknown as Reflector;
    const config = { getOrThrow: jest.fn(() => VALID_KEY) } as never;
    return new ApiKeyGuard(reflector, config);
  }

  it('올바른 키는 통과한다', () => {
    expect(makeGuard().canActivate(makeContext(VALID_KEY))).toBe(true);
  });

  it('틀린 키는 401', () => {
    expect(() => makeGuard().canActivate(makeContext('b'.repeat(32)))).toThrow(
      UnauthorizedException,
    );
  });

  it('키가 없으면 401', () => {
    expect(() => makeGuard().canActivate(makeContext(undefined))).toThrow(UnauthorizedException);
  });

  /**
   * 핵심 회귀 테스트.
   * 'a'*31 + 'é' 는 문자 수 32(= 유효 키와 같음)이지만 바이트는 33이다.
   * 문자 수로만 거르면 timingSafeEqual까지 도달해 RangeError → 500이 된다.
   */
  it('멀티바이트가 섞여 문자 수만 같은 키도 401이어야 한다 (500이 아니라)', () => {
    const sameLengthDifferentBytes = `${'a'.repeat(31)}é`;
    expect(sameLengthDifferentBytes).toHaveLength(VALID_KEY.length);
    expect(Buffer.byteLength(sameLengthDifferentBytes)).not.toBe(Buffer.byteLength(VALID_KEY));

    expect(() => makeGuard().canActivate(makeContext(sameLengthDifferentBytes))).toThrow(
      UnauthorizedException,
    );
  });

  it('멀티바이트 키에서 RangeError가 새어 나오지 않는다', () => {
    try {
      makeGuard().canActivate(makeContext(`${'a'.repeat(31)}é`));
      throw new Error('예외가 발생해야 한다');
    } catch (e) {
      // RangeError가 그대로 올라오면 예외 필터가 500으로 처리한다.
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect(e).not.toBeInstanceOf(RangeError);
    }
  });

  it('배열 헤더처럼 문자열이 아닌 값도 401', () => {
    expect(() => makeGuard().canActivate(makeContext(['a', 'b']))).toThrow(UnauthorizedException);
  });

  it('@SkipApiKey가 붙으면 검사하지 않는다', () => {
    expect(makeGuard(true, true).canActivate(makeContext(undefined))).toBe(true);
  });

  it('비공개(JWT) 라우트는 API 키를 요구하지 않는다', () => {
    expect(makeGuard(false).canActivate(makeContext(undefined))).toBe(true);
  });
});
