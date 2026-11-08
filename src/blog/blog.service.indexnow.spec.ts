import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdminLogService } from '../analytics/admin-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { BlogService } from './blog.service';

describe('BlogService IndexNow 통보', () => {
  async function setup(stored: { published: boolean }) {
    const row = {
      id: 1,
      slug: 'post-slug',
      title: '제목',
      content: '본문',
      thumbnailUrl: null as string | null,
      postTags: [],
      ...stored,
    };
    const prisma = {
      post: {
        create: jest.fn(async ({ data }: { data: { slug: string; published: boolean } }) => {
          row.slug = data.slug;
          row.published = data.published;
          return { ...row };
        }),
        update: jest.fn(async ({ data }: { data: { published?: boolean } }) => {
          if (data.published !== undefined) row.published = data.published;
          return { ...row };
        }),
        findUnique: jest.fn(async () => ({ ...row })),
      },
      postTag: { findMany: jest.fn(async () => []) },
      tag: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    };
    const revalidation = {
      trigger: jest.fn(async () => undefined),
      notifyIndexNow: jest.fn(async () => undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StorageService,
          useValue: {
            getPublicUrl: () => 'https://assets.example.test',
            move: jest.fn(),
            delete: jest.fn(async () => undefined),
            deleteByKey: jest.fn(async () => undefined),
          },
        },
        { provide: RevalidationService, useValue: revalidation },
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
    return { service: moduleRef.get(BlogService), revalidation };
  }

  type CreateDto = Parameters<BlogService['create']>[0];
  type UpdateDto = Parameters<BlogService['update']>[1];

  it('공개 상태로 생성하면 그 slug 로 1회 통보한다', async () => {
    const { service, revalidation } = await setup({ published: false });
    const post = await service.create({
      title: '제목',
      content: '본문',
      published: true,
    } as CreateDto);

    expect(revalidation.notifyIndexNow).toHaveBeenCalledTimes(1);
    expect(revalidation.notifyIndexNow).toHaveBeenCalledWith(post.slug);
  });

  it('비공개로 생성하면 통보하지 않는다', async () => {
    const { service, revalidation } = await setup({ published: false });
    await service.create({ title: '제목', content: '본문' } as CreateDto);

    expect(revalidation.notifyIndexNow).not.toHaveBeenCalled();
  });

  it('비공개 글을 공개로 바꾸면 1회 통보한다', async () => {
    const { service, revalidation } = await setup({ published: false });
    await service.update('post-slug', { published: true } as UpdateDto);

    expect(revalidation.notifyIndexNow).toHaveBeenCalledTimes(1);
    expect(revalidation.notifyIndexNow).toHaveBeenCalledWith('post-slug');
  });

  it('이미 공개된 글을 수정하면 통보하지 않는다', async () => {
    const { service, revalidation } = await setup({ published: true });
    await service.update('post-slug', { published: true, title: '새 제목' } as UpdateDto);
    await service.update('post-slug', { title: '또 수정' } as UpdateDto);

    expect(revalidation.notifyIndexNow).not.toHaveBeenCalled();
  });

  it('통보가 실패해도 발행은 성공한다', async () => {
    const { service, revalidation } = await setup({ published: false });
    revalidation.notifyIndexNow.mockRejectedValueOnce(new Error('network'));

    await expect(
      service.update('post-slug', { published: true } as UpdateDto),
    ).resolves.toBeDefined();
  });
});

describe('RevalidationService.notifyIndexNow', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function make(url: string | undefined) {
    return new RevalidationService({ get: jest.fn(() => url) } as unknown as ConfigService);
  }

  it('블로그 host·키·글 URL 을 IndexNow 에 보낸다', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true }) as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await make('https://chahyunwoo.dev').notifyIndexNow('abc');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.indexnow.org/indexnow');
    const body = JSON.parse(init.body as string);
    expect(body.host).toBe('chahyunwoo.dev');
    expect(body.keyLocation).toBe(`https://chahyunwoo.dev/${body.key}.txt`);
    expect(body.urlList).toEqual(['https://chahyunwoo.dev/blog/abc']);
  });

  it('블로그 URL 이 없으면 요청하지 않는다', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await make(undefined).notifyIndexNow('abc');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('요청이 실패해도 예외를 던지지 않는다', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    await expect(make('https://chahyunwoo.dev').notifyIndexNow('abc')).resolves.toBeUndefined();
  });
});
