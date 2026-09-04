import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdminLogService } from '../analytics/admin-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { BlogService } from './blog.service';

/**
 * 태그 슬러그 생성과 중복 처리를 검사한다.
 *
 * 관측 대상은 `prisma.tag.upsert`에 전달된 `where.slug`와 호출 횟수다.
 * 슬러그 함수는 private이므로 소스를 들여다보지 않고 **실제 전달된 값**을 본다.
 *
 * 배경: `[^\w-]`로 지우던 시절에는 "C++"와 "C#"가 둘 다 "c"가 되어 서로 다른
 * 태그가 같은 행에 연결됐고, 한글 태그는 전부 빈 슬러그로 합쳐졌다.
 */
describe('BlogService 태그 슬러그', () => {
  function build() {
    const upsertArgs: Array<{ slug: string; name: string }> = [];
    let nextId = 1;
    const idBySlug = new Map<string, number>();

    const stored = {
      id: 1,
      slug: 'post-slug',
      title: '제목',
      content: '본문',
      thumbnailUrl: null as string | null,
      postTags: [],
    };

    const prisma = {
      post: {
        create: jest.fn(async () => stored),
        update: jest.fn(async () => stored),
        delete: jest.fn(async () => stored),
        findUnique: jest.fn(async () => stored),
      },
      postTag: { findMany: jest.fn(async () => []) },
      tag: {
        upsert: jest.fn(
          async ({
            where,
            create,
          }: {
            where: { slug: string };
            create: { name: string; slug: string };
          }) => {
            upsertArgs.push({ slug: where.slug, name: create.name });
            let id = idBySlug.get(where.slug);
            if (id === undefined) {
              id = nextId++;
              idBySlug.set(where.slug, id);
            }
            return { id, name: create.name, slug: where.slug };
          },
        ),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };

    const storage = {
      getPublicUrl: () => 'https://assets.example.test',
      move: jest.fn(async (_u: string, k: string) => `https://assets.example.test/${k}`),
      upload: jest.fn(),
      delete: jest.fn(async () => undefined),
      deleteByKey: jest.fn(async () => undefined),
    };

    return { prisma, storage, upsertArgs };
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

  async function createWithTags(tags: string[]) {
    const deps = build();
    const service = await makeService(deps);
    await service.create({ title: '제목', content: '본문', tags } as Parameters<
      typeof service.create
    >[0]);
    return deps.upsertArgs;
  }

  it('C++와 C#이 서로 다른 슬러그를 갖는다 — 같으면 두 태그가 한 행으로 합쳐진다', async () => {
    const args = await createWithTags(['C++', 'C#']);

    const slugs = args.map(a => a.slug);
    expect(new Set(slugs).size).toBe(2);
    expect(slugs).not.toContain('');
  });

  it('한글 태그가 빈 슬러그가 되지 않는다', async () => {
    const args = await createWithTags(['노드', '리액트']);

    expect(args.map(a => a.slug)).not.toContain('');
    expect(new Set(args.map(a => a.slug)).size).toBe(2);
  });

  it('ASCII 태그의 슬러그는 기존과 동일하다 — 기존 75개 태그가 고아가 되면 안 된다', async () => {
    const args = await createWithTags(['React', 'HTTP Client', 'TypeScript']);

    expect(args.map(a => a.slug)).toEqual(['react', 'http-client', 'typescript']);
  });

  it('대소문자만 다른 중복은 한 번만 upsert한다 — 안 그러면 복합 PK 중복으로 409가 난다', async () => {
    const args = await createWithTags(['React', 'react', 'REACT']);

    expect(args).toHaveLength(1);
    expect(args[0].slug).toBe('react');
  });

  it('기호뿐인 이름은 태그로 만들지 않는다 — 빈 슬러그는 서로 다른 태그를 한 행으로 만든다', async () => {
    const args = await createWithTags(['!!!', '???', 'React']);

    expect(args.map(a => a.slug)).toEqual(['react']);
  });
});
