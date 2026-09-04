import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdminLogService } from '../analytics/admin-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { BlogService } from './blog.service';

/**
 * 고아 태그 정리가 **어떤 조건으로** 삭제를 요청하는지 검사한다.
 *
 * 관측 대상은 `prisma.tag.deleteMany`에 전달된 where 절이다. 실제 삭제 여부
 * (다른 글이 쓰는 태그가 살아남는지)는 `postTags: { none: {} }`라는 쿼리
 * 의미에 달려 있어 mock으로는 검증할 수 없다 — 그건 실제 DB에서 확인했고
 * 커밋 메시지에 기록했다. 여기서는 배선을 고정한다:
 *
 *  - 교체/삭제 전에 후보 tagId를 확보하는가 (끊긴 뒤에는 알 수 없다)
 *  - 후보가 없으면 삭제를 아예 요청하지 않는가
 *  - where에 "참조가 없는 것만"이라는 조건이 실제로 들어가는가
 */
describe('BlogService 고아 태그 정리', () => {
  function build(existingTagIds: number[]) {
    const deleteManyCalls: Array<Record<string, unknown>> = [];
    const tagQueryArgs: Array<Record<string, unknown>> = [];
    const post: {
      id: number;
      slug: string;
      title: string;
      content: string;
      thumbnailUrl: string | null;
      postTags: never[];
    } = {
      id: 10,
      slug: 'target',
      title: '제목',
      content: '본문',
      thumbnailUrl: null,
      postTags: [],
    };

    // update는 전달된 data를 반영해서 돌려준다. 고정값을 돌려주면 dto의 content가
    // 반영되지 않아 finalizeImages가 temp URL을 못 보고, move가 호출조차 되지 않는다
    // (앞단에 막혀 검사 대상에 닿지 못하는 형태).
    const prisma = {
      post: {
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (typeof data.content === 'string') post.content = data.content;
          return post;
        }),
        delete: jest.fn(async () => post),
        findUnique: jest.fn(async () => post),
      },
      postTag: {
        findMany: jest.fn(async () => existingTagIds.map(tagId => ({ tagId }))),
      },
      tag: {
        upsert: jest.fn(async () => ({ id: 99 })),
        deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
          deleteManyCalls.push(where);
          return { count: 0 };
        }),
        findMany: jest.fn(async (args: Record<string, unknown>) => {
          tagQueryArgs.push({ op: 'findMany', ...args });
          return [] as unknown[];
        }),
        count: jest.fn(async (args: Record<string, unknown>) => {
          tagQueryArgs.push({ op: 'count', ...args });
          return 0;
        }),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const storage = {
      getPublicUrl: () => 'https://assets.example.test',
      move: jest.fn(async (_u: string, k: string) => `https://assets.example.test/${k}`),
      delete: jest.fn(async () => undefined),
    };

    return { prisma, storage, deleteManyCalls, tagQueryArgs };
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

  describe('update', () => {
    it('태그를 교체하면 교체 전 태그를 후보로 정리를 요청한다', async () => {
      const deps = build([1, 2, 3]);
      const service = await makeService(deps);

      await service.update('target', { tags: ['newTag'] } as never);

      expect(deps.deleteManyCalls).toHaveLength(1);
      expect(deps.deleteManyCalls[0]).toMatchObject({ id: { in: [1, 2, 3] } });
    });

    /**
     * 삭제 조건이 빠지면 다른 글이 쓰는 태그까지 지워진다 — 이 프로젝트에서
     * 가장 비싼 회귀다. where에 참조 없음 조건이 있는지 고정한다.
     */
    it('참조가 없는 태그만 삭제하도록 조건을 건다', async () => {
      const deps = build([1]);
      const service = await makeService(deps);

      await service.update('target', { tags: [] } as never);

      expect(deps.deleteManyCalls[0]).toMatchObject({ postTags: { none: {} } });
    });

    it('tags를 안 보낸 수정은 태그를 건드리지 않는다', async () => {
      const deps = build([1, 2]);
      const service = await makeService(deps);

      await service.update('target', { title: '새 제목' } as never);

      expect(deps.deleteManyCalls).toHaveLength(0);
    });

    it('교체 전 태그가 없으면 삭제를 요청하지 않는다', async () => {
      const deps = build([]);
      const service = await makeService(deps);

      await service.update('target', { tags: ['a'] } as never);

      expect(deps.deleteManyCalls).toHaveLength(0);
    });

    /**
     * #109와 #110을 합칠 때 실제로 생긴 회귀를 고정한다.
     *
     * 이미지 확정 실패는 예외를 던진다(#110). 태그 정리가 그 뒤에 있으면
     * 태그를 교체하면서 이미지 확정이 실패한 경우 정리가 건너뛰어져 고아 태그가
     * 남는다. 두 정리는 서로 독립이므로 한쪽 실패가 다른 쪽을 막아선 안 된다.
     */
    it('이미지 확정이 실패해도 태그 정리는 수행된다', async () => {
      const deps = build([1, 2]);
      deps.storage.move.mockRejectedValue(new Error('R2 move failed'));
      const service = await makeService(deps);

      await expect(
        service.update('target', {
          tags: ['newTag'],
          content: '![a](https://assets.example.test/blog/temp/a.png)',
        } as never),
      ).rejects.toThrow();

      expect(deps.deleteManyCalls).toHaveLength(1);
      expect(deps.deleteManyCalls[0]).toMatchObject({
        id: { in: [1, 2] },
        postTags: { none: {} },
      });
    });
  });

  /**
   * #107이 지적한 사용자에게 보이는 영향. `tag.count()`로 전체를 세면 고아가
   * 포함되어 프론트 사이드바가 실제보다 많은 태그 수를 표시한다
   * (운영 실측: API 78 / 실사용 75 / 고아 3).
   *
   * 생성 경로를 막았어도 이미 쌓인 것과 정리 실패분이 있으므로 조회에서도 방어한다.
   */
  describe('getTags — 고아 태그를 세지 않는다', () => {
    it('목록과 총계 모두 참조가 있는 태그만 대상으로 한다', async () => {
      const deps = build([]);
      const service = await makeService(deps);

      await service.getTags({ limit: 15 } as never);

      const findMany = deps.tagQueryArgs.find(a => a.op === 'findMany');
      const count = deps.tagQueryArgs.find(a => a.op === 'count');

      expect(findMany).toMatchObject({ where: { postTags: { some: {} } } });
      expect(count).toMatchObject({ where: { postTags: { some: {} } } });
    });
  });

  describe('remove', () => {
    it('글을 지우면 그 글이 쓰던 태그를 후보로 정리를 요청한다', async () => {
      const deps = build([5, 6]);
      const service = await makeService(deps);

      await service.remove('target');

      expect(deps.deleteManyCalls).toHaveLength(1);
      expect(deps.deleteManyCalls[0]).toMatchObject({
        id: { in: [5, 6] },
        postTags: { none: {} },
      });
    });

    /**
     * post_tags는 FK CASCADE로 지워지므로, 삭제 후에 조회하면 후보가 빈 배열이 된다.
     * 삭제 전에 확보해야 한다는 순서를 고정한다.
     */
    it('태그 조회가 글 삭제보다 먼저 일어난다', async () => {
      const deps = build([7]);
      const service = await makeService(deps);
      const order: string[] = [];
      deps.prisma.postTag.findMany.mockImplementation(async () => {
        order.push('findTags');
        return [{ tagId: 7 }];
      });
      deps.prisma.post.delete.mockImplementation(async () => {
        order.push('deletePost');
        return {
          id: 10,
          slug: 'target',
          title: '제목',
          content: '본문',
          thumbnailUrl: null,
        } as never;
      });

      await service.remove('target');

      expect(order).toEqual(['findTags', 'deletePost']);
    });
  });
});
