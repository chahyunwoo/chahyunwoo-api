import { CACHE_MANAGER } from '@nestjs/cache-manager';
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
 * 같은 이미지를 본문에서 **두 번 참조한** 글이 저장되는지 검사한다.
 *
 * 기존 `blog.service.images.spec.ts`가 이 버그를 못 잡았던 이유가 핵심이다 —
 * 그 스펙의 `move` 스텁은 **상태가 없어서** 같은 원본을 두 번 옮겨도 성공을
 * 돌려줬다. 실제 R2의 `move`는 Copy → Head → **Delete(원본)** 이라
 * 두 번째 호출은 원본이 없어 NoSuchKey로 터진다.
 *
 * 그래서 여기서는 스텁이 실제 시맨틱을 흉내낸다(옮긴 원본을 장부에서 지운다).
 * 이 스텁이 없으면 dedupe를 되돌려도 테스트가 초록으로 남는다.
 */
describe('BlogService 본문 내 이미지 중복 참조', () => {
  function build() {
    const updates: Array<Record<string, unknown>> = [];
    const deletedKeys: string[] = [];
    const moveCalls: string[] = [];

    // R2에 존재하는 오브젝트 장부. move가 원본을 실제로 지운다.
    const existing = new Set<string>(['blog/temp/dup.png', 'blog/temp/other.png']);

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
          const { postTags: _ignored, ...scalar } = data as Record<string, unknown>;
          stored = { ...stored, ...scalar } as typeof stored;
          return stored;
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          // postTags는 include로 따라오는 관계 필드다. data를 그대로 덮으면
          // undefined가 되어 formatPost가 터진다(제품 버그가 아니라 스텁 문제).
          const { postTags: _ignored, ...scalar } = data as Record<string, unknown>;
          stored = { ...stored, ...scalar } as typeof stored;
          return stored;
        }),
        delete: jest.fn(async () => stored),
        findUnique: jest.fn(async () => stored),
      },
      postTag: { findMany: jest.fn(async () => []) },
      tag: { upsert: jest.fn(async () => ({ id: 1 })), deleteMany: jest.fn(async () => ({})) },
    };

    const storage = {
      getPublicUrl: () => PUBLIC_URL,
      move: jest.fn(async (sourceUrl: string, destKey: string) => {
        moveCalls.push(sourceUrl);
        const sourceKey = sourceUrl.replace(`${PUBLIC_URL}/`, '');
        // 실제 move의 Copy 단계. 원본이 없으면 여기서 터진다.
        if (!existing.has(sourceKey)) {
          throw new Error(`NoSuchKey: ${sourceKey}`);
        }
        existing.delete(sourceKey); // Delete(원본)
        existing.add(destKey);
        return `${PUBLIC_URL}/${destKey}`;
      }),
      upload: jest.fn(),
      delete: jest.fn(async () => undefined),
      deleteByKey: jest.fn(async (key: string) => {
        deletedKeys.push(key);
      }),
    };

    return { prisma, storage, updates, deletedKeys, moveCalls, getStored: () => stored };
  }

  async function makeService(deps: ReturnType<typeof build>) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: PrismaService, useValue: deps.prisma },
        { provide: StorageService, useValue: deps.storage },
        { provide: RevalidationService, useValue: { trigger: jest.fn(async () => undefined) } },
        { provide: AdminLogService, useValue: { log: jest.fn(async () => undefined) } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'admin'), getOrThrow: jest.fn(() => 'admin') },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(async () => undefined),
            set: jest.fn(async () => undefined),
            del: jest.fn(async () => undefined),
            keys: jest.fn(async () => []),
          },
        },
      ],
    }).compile();
    return moduleRef.get(BlogService);
  }

  it('같은 이미지를 두 번 참조해도 저장에 성공한다', async () => {
    const deps = build();
    const service = await makeService(deps);

    await expect(
      service.create({
        title: '제목',
        content: `![a](${TEMP}/dup.png) 중간 문단 ![again](${TEMP}/dup.png)`,
      } as Parameters<typeof service.create>[0]),
    ).resolves.toBeDefined();
  });

  it('중복 URL에 move를 한 번만 호출한다 — 두 번 부르면 원본이 이미 지워져 터진다', async () => {
    const deps = build();
    const service = await makeService(deps);

    await service.create({
      title: '제목',
      content: `![a](${TEMP}/dup.png) 그리고 ![b](${TEMP}/dup.png)`,
    } as Parameters<typeof service.create>[0]);

    expect(deps.moveCalls.filter(u => u.endsWith('dup.png'))).toHaveLength(1);
  });

  it('본문의 중복 참조가 모두 확정 URL로 치환된다 — 하나라도 temp가 남으면 다음날 깨진다', async () => {
    const deps = build();
    const service = await makeService(deps);

    await service.create({
      title: '제목',
      content: `![a](${TEMP}/dup.png) 중간 ![b](${TEMP}/dup.png)`,
    } as Parameters<typeof service.create>[0]);

    // create()는 슬러그를 무작위 생성하므로 슬러그를 고정해 비교하지 않는다.
    expect(deps.getStored().content).not.toContain('/blog/temp/');
    expect(deps.getStored().content.match(/\/blog\/posts\/[^/]+\/dup\.png/g)).toHaveLength(2);
  });

  it('서로 다른 이미지는 각각 옮긴다', async () => {
    const deps = build();
    const service = await makeService(deps);

    await service.create({
      title: '제목',
      content: `![a](${TEMP}/dup.png) ![b](${TEMP}/other.png)`,
    } as Parameters<typeof service.create>[0]);

    expect(deps.moveCalls).toHaveLength(2);
    expect(deps.getStored().content).not.toContain('/blog/temp/');
  });

  it('롤백은 이번에 옮긴 것만 지운다 — 아직 못 옮긴 temp 원본까지 지우면 재시도가 영구 실패한다', async () => {
    const deps = build();
    // other.png를 R2에서 미리 없애 두 번째 이미지의 move가 실패하게 만든다.
    deps.storage.move = jest.fn(async (sourceUrl: string, destKey: string) => {
      deps.moveCalls.push(sourceUrl);
      if (sourceUrl.includes('other.png')) throw new Error('R2 move failed');
      return `${PUBLIC_URL}/${destKey}`;
    });
    const service = await makeService(deps);

    await expect(
      service.create({
        title: '제목',
        content: `![a](${TEMP}/dup.png) ![b](${TEMP}/other.png)`,
      } as Parameters<typeof service.create>[0]),
    ).rejects.toThrow();

    // 성공한 dup.png의 목적지만 정리 대상이다.
    expect(deps.deletedKeys).toHaveLength(1);
    expect(deps.deletedKeys[0]).toMatch(/^blog\/posts\/[^/]+\/dup\.png$/);
    // 실패한 other.png의 temp 원본은 건드리지 않는다 — 재시도에 필요하다.
    expect(deps.deletedKeys.some(k => k.includes('temp'))).toBe(false);
  });
});
