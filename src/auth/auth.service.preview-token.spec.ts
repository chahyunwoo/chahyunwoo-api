// otplib 은 ESM 전용 의존성(@scure/base)을 끌어와 ts-jest 의 CJS 변환에서 깨진다.
// 프리뷰 토큰 경로는 TOTP 를 전혀 쓰지 않으므로 모듈만 대체한다.
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verifySync: jest.fn(),
}));

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

/**
 * 프리뷰 토큰이 발급 대상 slug 에 묶여 있는지 검사한다 (#125).
 *
 * 고친 버그: `previewTokens` 가 `Map<string, number>`(만료시각만) 이라
 * 토큰 하나로 **모든** 비공개 글을 열 수 있었다. 어드민 프리뷰 링크가
 * 한 번 새면 미발행 글 전체가 노출된다.
 *
 * #140 에서 저장소가 인메모리 Map → DB 로 바뀌었다(배포마다 토큰이 전부
 * 사라져 승인 흐름이 깨졌기 때문). 저장소가 바뀌어도 **slug 바인딩은 그대로
 * 지켜져야 하므로** 이 스펙은 남는다. 아래 fake 는 Prisma 대신 Map 을 쓰지만,
 * 검사 대상은 여전히 AuthService 의 판정 로직이다.
 */
describe('AuthService 프리뷰 토큰 slug 바인딩', () => {
  type Row = { token: string; slug: string; expiresAt: Date };

  /** previewToken 델리게이트만 흉내내는 최소 fake */
  function createFakePrisma() {
    const rows = new Map<string, Row>();
    return {
      rows,
      previewToken: {
        create: async ({ data }: { data: Row }) => {
          rows.set(data.token, data);
          return data;
        },
        findUnique: async ({ where }: { where: { token: string } }) =>
          rows.get(where.token) ?? null,
        delete: async ({ where }: { where: { token: string } }) => {
          const row = rows.get(where.token);
          if (!row) throw new Error('not found');
          rows.delete(where.token);
          return row;
        },
        deleteMany: async ({ where }: { where: { expiresAt: { lt: Date } } }) => {
          let count = 0;
          for (const [token, row] of rows) {
            if (row.expiresAt < where.expiresAt.lt) {
              rows.delete(token);
              count++;
            }
          }
          return { count };
        },
      },
    };
  }

  function createService(): AuthService {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret-for-preview-token-spec';
        throw new Error(`unexpected config key: ${key}`);
      },
    } as unknown as ConfigService;

    const prisma = createFakePrisma() as unknown as PrismaService;
    return new AuthService(config, {} as JwtService, prisma);
  }

  it('발급받은 slug 에 대해서는 통과한다', async () => {
    const service = createService();
    const { token } = await service.createPreviewToken('my-post');

    await expect(service.verifyPreviewToken(token, 'my-post')).resolves.toBe(true);
  });

  it('다른 글의 slug 로는 거부한다 — 이것이 #125 의 본체다', async () => {
    const service = createService();
    const { token } = await service.createPreviewToken('my-post');

    await expect(service.verifyPreviewToken(token, 'secret-unpublished-post')).resolves.toBe(false);
  });

  it('서로 다른 slug 로 발급한 토큰은 서로의 글을 열지 못한다', async () => {
    const service = createService();
    const a = await service.createPreviewToken('post-a');
    const b = await service.createPreviewToken('post-b');

    await expect(service.verifyPreviewToken(a.token, 'post-a')).resolves.toBe(true);
    await expect(service.verifyPreviewToken(a.token, 'post-b')).resolves.toBe(false);
    await expect(service.verifyPreviewToken(b.token, 'post-b')).resolves.toBe(true);
    await expect(service.verifyPreviewToken(b.token, 'post-a')).resolves.toBe(false);
  });

  it('존재하지 않는 토큰은 거부한다', async () => {
    const service = createService();
    await service.createPreviewToken('my-post');

    await expect(service.verifyPreviewToken('deadbeef', 'my-post')).resolves.toBe(false);
  });

  it('만료된 토큰은 slug 가 맞아도 거부한다', async () => {
    const service = createService();
    const { token } = await service.createPreviewToken('my-post');

    // TTL 은 24시간이다(#140 이전에는 30분). 그 너머로 시계를 옮긴다.
    const realNow = Date.now;
    Date.now = () => realNow() + 25 * 60 * 60 * 1000;
    try {
      await expect(service.verifyPreviewToken(token, 'my-post')).resolves.toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  it('slug 를 넘기지 않으면 유효성만 본다 (어드민 상태 확인용 경로)', async () => {
    const service = createService();
    const { token } = await service.createPreviewToken('my-post');

    await expect(service.verifyPreviewToken(token)).resolves.toBe(true);
    await expect(service.verifyPreviewToken('deadbeef')).resolves.toBe(false);
  });

  /**
   * #140 에서 TTL 을 30분 → 24시간으로 늘렸다. 예전에는 `expiresIn: 1800` 이
   * 하드코딩돼 있어 상수를 고쳐도 응답은 30분 그대로였다 — 파이프라인이 그 값으로
   * 디스코드에 만료 시각을 안내하면 거짓말이 된다.
   *
   * 그래서 "응답값이 실제 만료와 같은가"를 본다. 상수를 직접 읽어 비교하면
   * 하드코딩 회귀를 못 잡으므로, 저장된 expiresAt 과 대조한다.
   */
  it('expiresIn 이 실제 저장된 만료 시각과 일치한다', async () => {
    const service = createService();
    const fake = createFakePrisma();
    Object.assign(service, { prisma: fake });

    const before = Date.now();
    const { token, expiresIn } = await service.createPreviewToken('my-post');
    const row = fake.rows.get(token);

    if (!row) throw new Error('토큰이 저장되지 않았다');
    const actualSeconds = Math.round((row.expiresAt.getTime() - before) / 1000);
    expect(expiresIn).toBe(actualSeconds);
    expect(expiresIn).toBe(24 * 60 * 60);
  });
});
