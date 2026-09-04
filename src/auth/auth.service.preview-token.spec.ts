// otplib 은 ESM 전용 의존성(@scure/base)을 끌어와 ts-jest 의 CJS 변환에서 깨진다.
// 프리뷰 토큰 경로는 TOTP 를 전혀 쓰지 않으므로 모듈만 대체한다.
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verifySync: jest.fn(),
}));

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

/**
 * 프리뷰 토큰이 발급 대상 slug 에 묶여 있는지 검사한다 (#125).
 *
 * 고친 버그: `previewTokens` 가 `Map<string, number>`(만료시각만) 이라
 * 토큰 하나로 **모든** 비공개 글을 열 수 있었다. 어드민 프리뷰 링크가
 * 한 번 새면 미발행 글 전체가 노출된다.
 */
describe('AuthService 프리뷰 토큰 slug 바인딩', () => {
  function createService(): AuthService {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret-for-preview-token-spec';
        throw new Error(`unexpected config key: ${key}`);
      },
    } as unknown as ConfigService;

    return new AuthService(config, {} as JwtService, {} as PrismaService);
  }

  it('발급받은 slug 에 대해서는 통과한다', () => {
    const service = createService();
    const { token } = service.createPreviewToken('my-post');

    expect(service.verifyPreviewToken(token, 'my-post')).toBe(true);
  });

  it('다른 글의 slug 로는 거부한다 — 이것이 #125 의 본체다', () => {
    const service = createService();
    const { token } = service.createPreviewToken('my-post');

    expect(service.verifyPreviewToken(token, 'secret-unpublished-post')).toBe(false);
  });

  it('서로 다른 slug 로 발급한 토큰은 서로의 글을 열지 못한다', () => {
    const service = createService();
    const a = service.createPreviewToken('post-a');
    const b = service.createPreviewToken('post-b');

    expect(service.verifyPreviewToken(a.token, 'post-a')).toBe(true);
    expect(service.verifyPreviewToken(a.token, 'post-b')).toBe(false);
    expect(service.verifyPreviewToken(b.token, 'post-b')).toBe(true);
    expect(service.verifyPreviewToken(b.token, 'post-a')).toBe(false);
  });

  it('존재하지 않는 토큰은 거부한다', () => {
    const service = createService();
    service.createPreviewToken('my-post');

    expect(service.verifyPreviewToken('deadbeef', 'my-post')).toBe(false);
  });

  it('만료된 토큰은 slug 가 맞아도 거부한다', () => {
    const service = createService();
    const { token } = service.createPreviewToken('my-post');

    // TTL 은 30분이다. 그 너머로 시계를 옮긴다.
    const realNow = Date.now;
    Date.now = () => realNow() + 31 * 60 * 1000;
    try {
      expect(service.verifyPreviewToken(token, 'my-post')).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  it('slug 를 넘기지 않으면 유효성만 본다 (어드민 상태 확인용 경로)', () => {
    const service = createService();
    const { token } = service.createPreviewToken('my-post');

    expect(service.verifyPreviewToken(token)).toBe(true);
    expect(service.verifyPreviewToken('deadbeef')).toBe(false);
  });
});
