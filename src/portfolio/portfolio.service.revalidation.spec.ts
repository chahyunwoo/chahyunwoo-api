import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test } from '@nestjs/testing';
import { MailService } from '../common/mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { ValidateLocalePipe } from './pipes/validate-locale.pipe';
import { PORTFOLIO_REVALIDATION_TARGETS } from './portfolio.constants';
import { PortfolioService } from './portfolio.service';

/**
 * 포트폴리오 뮤테이션이 **블로그 앱에도** revalidate를 통보하는지 검사한다.
 *
 * 왜 헬퍼가 아니라 서비스 메서드를 부르는가:
 *   헬퍼(`triggerPortfolioSideEffects`)만 직접 호출해 검사하면 "헬퍼는 옳지만
 *   호출부가 안 부른다"는 상태를 못 본다. 실제로 이 버그가 그 형태였다 —
 *   블로그 앱의 revalidate 라우트에 처리 로직이 **이미 다 있었는데**
 *   부르는 쪽이 없어서 `/about/*`이 영구 stale이었다.
 *   그래서 공개 메서드를 실제로 실행하고, RevalidationService가 받은 인자를 관측한다.
 *
 * 기대값은 상수가 아니라 **리터럴**로 고정한다 — 이유는 `expectNotifiesBothApps`
 * 주석에 적었다(상수에서 기대값을 끌어오면 상수를 망가뜨리는 뮤테이션을 못 잡는다).
 */
describe('PortfolioService revalidation 배선', () => {
  function build() {
    const triggered: string[] = [];

    const profile = {
      id: 1,
      name: '이름',
      location: '서울',
      imageUrl: null,
      iconUrl: null,
      socialLinks: [],
      translations: [{ locale: 'ko', jobTitle: '직함', introduction: ['소개'] }],
    };

    const prisma = {
      profile: {
        findFirst: jest.fn(async () => profile),
        update: jest.fn(async () => profile),
        create: jest.fn(async () => profile),
      },
      profileTranslation: { upsert: jest.fn(async () => ({})) },
      experience: {
        create: jest.fn(async () => ({ id: 1, translations: [] })),
        update: jest.fn(async () => ({ id: 1, translations: [] })),
        delete: jest.fn(async () => ({ id: 1 })),
        findUnique: jest.fn(async () => ({ id: 1, translations: [] })),
      },
      locale: {
        create: jest.fn(async () => ({ id: 1, code: 'en', label: 'English' })),
        delete: jest.fn(async () => ({ id: 1 })),
      },
      experienceTranslation: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    };

    const revalidation = {
      trigger: jest.fn(async (type: string) => {
        triggered.push(type);
      }),
    };

    // cache-manager 인터페이스. NamespacedCache가 감싸므로 store 동작만 흉내낸다.
    const cache = {
      get: jest.fn(async () => undefined),
      set: jest.fn(async () => undefined),
      del: jest.fn(async () => undefined),
      keys: jest.fn(async () => []),
    };

    return { prisma, revalidation, cache, triggered };
  }

  async function makeService(deps: ReturnType<typeof build>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioService,
        { provide: PrismaService, useValue: deps.prisma },
        { provide: RevalidationService, useValue: deps.revalidation },
        { provide: StorageService, useValue: { delete: jest.fn(), upload: jest.fn() } },
        { provide: MailService, useValue: { sendContactNotification: jest.fn() } },
        { provide: ValidateLocalePipe, useValue: { invalidateCache: jest.fn() } },
        { provide: CACHE_MANAGER, useValue: deps.cache },
      ],
    }).compile();

    return moduleRef.get(PortfolioService);
  }

  /**
   * 기대값을 상수에서 끌어오지 않고 **리터럴로 고정**한다.
   *
   * 처음엔 `toEqual([...PORTFOLIO_REVALIDATION_TARGETS])`로 썼는데,
   * 상수에서 'blog'를 지우는 뮤테이션에 6건 중 1건만 빨개졌다 —
   * 기대값이 상수를 따라 같이 움직여서 검사가 무력해진 것이다.
   * "블로그에도 통보한다"는 건 상수가 마음대로 바꿀 수 있는 값이 아니라
   * 이 시스템이 지켜야 할 사실이므로, 여기서 직접 못박는다.
   */
  function expectNotifiesBothApps(triggered: string[]) {
    expect(triggered).toEqual(['portfolio', 'blog']);
  }

  it('상수에 blog가 들어 있다 — 빠지면 블로그 /about/*이 영구 stale이 된다', () => {
    expect(PORTFOLIO_REVALIDATION_TARGETS).toContain('blog');
    expect(PORTFOLIO_REVALIDATION_TARGETS).toContain('portfolio');
  });

  it('updateProfile이 두 앱 모두에 통보한다', async () => {
    const deps = build();
    const service = await makeService(deps);

    await service.updateProfile({ name: '새 이름' });

    expectNotifiesBothApps(deps.triggered);
  });

  it('createExperience가 두 앱 모두에 통보한다', async () => {
    const deps = build();
    const service = await makeService(deps);

    await service.createExperience({
      startDate: '2020-01',
      translations: [{ locale: 'ko', title: 'T', role: 'R', responsibilities: [] }],
    } as Parameters<typeof service.createExperience>[0]);

    expectNotifiesBothApps(deps.triggered);
  });

  it('deleteExperience가 두 앱 모두에 통보한다', async () => {
    const deps = build();
    const service = await makeService(deps);

    await service.deleteExperience(1);

    expectNotifiesBothApps(deps.triggered);
  });

  it('로케일 추가/삭제도 통보한다 — 서버 파이프 캐시만 비우면 프론트에 안 나타난다', async () => {
    const deps = build();
    const service = await makeService(deps);

    await service.createLocale({ code: 'en', label: 'English' });
    expectNotifiesBothApps(deps.triggered);

    deps.triggered.length = 0;
    await service.deleteLocale(1);
    expectNotifiesBothApps(deps.triggered);
  });

  it('revalidation이 실패해도 뮤테이션 자체는 성공한다', async () => {
    const deps = build();
    deps.revalidation.trigger = jest.fn(async (_type: string) => {
      throw new Error('Vercel down');
    });
    const service = await makeService(deps);

    // fire-and-forget이므로 예외가 호출자에게 올라오면 안 된다.
    await expect(service.updateProfile({ name: '새 이름' })).resolves.toBeDefined();
  });
});
