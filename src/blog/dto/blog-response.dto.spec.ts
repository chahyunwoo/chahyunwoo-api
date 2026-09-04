import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 커밋된 `openapi.json`의 blog 응답 스키마가 실제 서비스 반환 shape과 맞는지 본다.
 *
 * **왜 이 테스트가 필요한가.** DTO는 손으로 쓴 것이라 서비스가 필드를 추가하거나
 * 이름을 바꾸면 조용히 어긋난다. 어긋난 DTO는 타입이 없는 것보다 나쁘다 —
 * 프론트가 그 타입을 믿고 코드를 짜기 때문이다.
 *
 * 여기서는 DB 없이 검사할 수 있는 것만 본다: **스키마가 존재하는지**와
 * **`formatPost`가 만드는 필드 집합과 일치하는지**. 실제 HTTP 응답과의 대조는
 * 통합 테스트의 몫이고, 지금은 수동으로 확인했다(커밋 메시지에 기록).
 */
describe('blog 응답 스키마', () => {
  const spec = JSON.parse(readFileSync(join(__dirname, '../../../openapi.json'), 'utf8'));

  /** $ref를 풀고 allOf(상속)를 합쳐 실제 프로퍼티 집합을 만든다. */
  type Schema = {
    $ref?: string;
    type?: string;
    items?: Schema;
    properties?: Record<string, unknown>;
    allOf?: Schema[];
  };

  function propsOf(schema: Schema): Set<string> {
    let s = schema;
    if (s.$ref) s = spec.components.schemas[s.$ref.split('/').pop() as string];
    if (s.type === 'array' && s.items) return propsOf(s.items);
    const props: Record<string, unknown> = { ...(s.properties ?? {}) };
    for (const sub of s.allOf ?? []) {
      const parent: Schema = sub.$ref
        ? spec.components.schemas[sub.$ref.split('/').pop() as string]
        : sub;
      Object.assign(props, parent.properties ?? {}, s.properties ?? {});
    }
    return new Set(Object.keys(props));
  }

  function successSchema(path: string, method: string) {
    const op = spec.paths?.[path]?.[method];
    const res = op?.responses ?? {};
    return (
      res['200']?.content?.['application/json']?.schema ??
      res['201']?.content?.['application/json']?.schema
    );
  }

  /**
   * `formatPost()`가 만드는 필드 — Post의 content를 뺀 전 스칼라 + tags.
   * prisma/schema.prisma의 model Post와 1:1이다.
   */
  const POST_SUMMARY_FIELDS = [
    'id',
    'title',
    'slug',
    'description',
    'thumbnailUrl',
    'category',
    'published',
    'publishedAt',
    'readingTime',
    'viewCount',
    'createdAt',
    'updatedAt',
    'tags',
  ];

  describe('스키마가 선언되어 있다', () => {
    it.each([
      ['/api/blog/posts', 'get'],
      ['/api/blog/posts/{slug}', 'get'],
      ['/api/blog/posts/{slug}/preview', 'get'],
      ['/api/blog/posts/{slug}/related', 'get'],
      ['/api/blog/posts/recent', 'get'],
      ['/api/blog/posts/search', 'get'],
      ['/api/blog/categories', 'get'],
      ['/api/blog/tags', 'get'],
      ['/api/blog/posts', 'post'],
      ['/api/blog/posts/{slug}', 'put'],
      ['/api/blog/categories', 'post'],
      ['/api/blog/categories/{id}', 'put'],
      ['/api/blog/images', 'post'],
    ])('%s %s', (path, method) => {
      expect(successSchema(path, method)).toBeDefined();
    });
  });

  /**
   * 본문이 없는 라우트는 204를 선언해야 한다. 에러 데코레이터(@ApiUnauthorized 등)를
   * 붙이면 NestJS Swagger가 성공 응답 자동 추론을 멈추므로, @ApiNoContent()를
   * 명시하지 않으면 "성공하면 무엇이 오는지 알 수 없는" 스펙이 된다.
   */
  describe('204 라우트는 204를 선언한다', () => {
    it.each([
      ['/api/blog/posts/{slug}', 'delete'],
      ['/api/blog/categories/{id}', 'delete'],
    ])('%s %s', (path, method) => {
      expect(spec.paths?.[path]?.[method]?.responses?.['204']).toBeDefined();
    });
  });

  describe('필드가 formatPost 결과와 맞는다', () => {
    it('목록의 posts 요소는 content를 뺀 Post 전 필드를 갖는다', () => {
      const schema = successSchema('/api/blog/posts', 'get');
      const listProps = propsOf(schema);
      expect(listProps).toEqual(new Set(['posts', 'total', 'page', 'limit', 'totalPages']));

      const itemProps = propsOf(spec.components.schemas.PostSummaryDto);
      expect([...itemProps].sort()).toEqual([...POST_SUMMARY_FIELDS].sort());
      expect(itemProps.has('content')).toBe(false);
    });

    it('상세는 목록 필드에 content가 더해진 것이다', () => {
      const detail = propsOf(spec.components.schemas.PostDetailDto);
      expect([...detail].sort()).toEqual([...POST_SUMMARY_FIELDS, 'content'].sort());
    });

    it.each([
      ['PostSearchResponseDto', ['posts', 'total', 'query', 'grouped']],
      ['RelatedPostsResponseDto', ['related', 'recommended']],
      ['TagListResponseDto', ['tags', 'total']],
      ['CategoryWithTagsDto', ['category', 'icon', 'count', 'recent', 'tags']],
      ['CategoryDto', ['id', 'name', 'icon', 'sortOrder']],
      ['UploadImageResponseDto', ['url']],
      ['TagCountDto', ['name', 'slug', 'count']],
    ])('%s', (name, fields) => {
      expect([...propsOf(spec.components.schemas[name])].sort()).toEqual([...fields].sort());
    });
  });
});
