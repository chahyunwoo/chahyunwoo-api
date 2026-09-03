import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdminLogService } from '../analytics/admin-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { BlogService } from './blog.service';

const PUBLIC_URL = 'https://assets.example.test';
const TEMP = `${PUBLIC_URL}/blog/temp`;

/**
 * 이미지 확정(temp → 확정 경로) 실패를 다루는 방식만 검사한다.
 *
 * 관측 대상은 두 가지다:
 *  - 호출부가 예외를 삼키는가 (삼키면 temp URL이 남은 채 200이 나가고, 그 파일은
 *    다음 날 StorageCleanupTask가 지워 이미지가 깨진다)
 *  - 실패 시점까지 옮겨진 이미지의 새 위치가 DB에 반영되는가 (반영하지 않으면
 *    파일은 옮겨졌는데 DB는 옛 temp를 가리켜 즉시 깨진다)
 *
 * 소스 문자열을 매칭하지 않고 `prisma.post.update`에 실제로 전달된 값을 본다.
 */
describe('BlogService 이미지 확정 실패 처리', () => {
  /** move가 어떤 URL에서 실패할지 테스트가 지정한다. */
  function build(failOn: (url: string) => boolean) {
    const updates: Array<Record<string, unknown>> = [];
    const deletes: string[] = [];
    let stored = {
      id: 1,
      slug: 'test-slug',
      title: '제목',
      content: '',
      thumbnailUrl: null as string | null,
      postTags: [],
    };

    const prisma = {
      post: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored = { ...stored, ...(data as object) } as typeof stored;
          return stored;
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          stored = { ...stored, ...(data as object) } as typeof stored;
          return stored;
        }),
        delete: jest.fn(async ({ where }: { where: { slug: string } }) => {
          deletes.push(where.slug);
          return stored;
        }),
        findUnique: jest.fn(async () => stored),
      },
      tag: { upsert: jest.fn(async () => ({ id: 1 })) },
    };

    const storage = {
      getPublicUrl: () => PUBLIC_URL,
      move: jest.fn(async (sourceUrl: string, destKey: string) => {
        if (failOn(sourceUrl)) throw new Error(`R2 move failed: ${sourceUrl}`);
        return `${PUBLIC_URL}/${destKey}`;
      }),
      upload: jest.fn(),
      delete: jest.fn(async () => undefined),
    };

    return { prisma, storage, updates, deletes, getStored: () => stored };
  }

  async function makeService(deps: ReturnType<typeof build>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: PrismaService, useValue: deps.prisma },
        { provide: StorageService, useValue: deps.storage },
        { provide: RevalidationService, useValue: { trigger: jest.fn(async () => undefined) } },
        { provide: AdminLogService, useValue: { log: jest.fn(async () => undefined) } },
        { provide: ConfigService, useValue: { getOrThrow: () => 'admin' } },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(async () => undefined),
            set: jest.fn(async () => undefined),
            del: jest.fn(async () => undefined),
            clear: jest.fn(async () => undefined),
          },
        },
      ],
    }).compile();

    return moduleRef.get(BlogService);
  }

  describe('update — 확정 실패를 삼키지 않는다', () => {
    it('move가 실패하면 성공 응답이 아니라 예외가 난다', async () => {
      const deps = build(() => true);
      const service = await makeService(deps);
      deps.prisma.post.update.mockClear();

      await expect(
        service.update('test-slug', { content: `![a](${TEMP}/a.png)` } as never),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('3개 중 3번째가 실패해도 앞 2개의 새 위치가 DB에 반영된다', async () => {
      const deps = build(url => url.endsWith('c.png'));
      const service = await makeService(deps);

      const content = `![a](${TEMP}/a.png) ![b](${TEMP}/b.png) ![c](${TEMP}/c.png)`;

      await expect(service.update('test-slug', { content } as never)).rejects.toThrow(
        InternalServerErrorException,
      );

      // 확정 단계에서 넘긴 content를 찾는다 (1차 update는 dto 저장, 2차가 확정 반영)
      const finalizeUpdate = deps.updates.find(
        u => typeof u.content === 'string' && 'thumbnailUrl' in u,
      );
      expect(finalizeUpdate).toBeDefined();
      const saved = finalizeUpdate?.content as string;

      // a, b는 확정 경로로 치환됐다
      expect(saved).toContain('/blog/posts/test-slug/a.png');
      expect(saved).toContain('/blog/posts/test-slug/b.png');
      // c만 temp에 남는다 — 그 파일은 실제로 아직 temp에 있다
      expect(saved).toContain(`${TEMP}/c.png`);
    });
  });

  describe('update — 빈 문자열 content', () => {
    /**
     * `dto.content || dto.thumbnailUrl` 판정은 빈 문자열을 falsy로 봐서
     * 확정 단계를 건너뛴다. `!== undefined`여야 한다.
     */
    it('content가 빈 문자열이어도 확정 단계가 실행된다', async () => {
      const deps = build(() => false);
      const service = await makeService(deps);
      deps.storage.move.mockClear();

      await service.update('test-slug', { content: '' } as never);

      // 확정 단계가 돌았다면 2차 update(content+thumbnailUrl 동시 지정)가 있다
      const finalizeUpdate = deps.updates.find(u => 'content' in u && 'thumbnailUrl' in u);
      expect(finalizeUpdate).toBeDefined();
    });
  });

  describe('create — 롤백 순서', () => {
    it('확정 실패 시 예외를 올리고 글을 되돌린다', async () => {
      const deps = build(() => true);
      const service = await makeService(deps);

      await expect(
        service.create({
          title: '제목',
          content: `![a](${TEMP}/a.png)`,
          category: 'Frontend',
        } as never),
      ).rejects.toThrow(/R2 move failed/);

      expect(deps.deletes.length).toBeGreaterThan(0);
    });
  });
});
