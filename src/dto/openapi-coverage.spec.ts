import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 커밋된 `openapi.json`의 **응답 스키마 커버리지**를 고정한다.
 *
 * 프론트(`hyunwoo-dev`)는 이 파일에서 타입을 생성하고, `ApiOkJson<P, M>` 헬퍼는
 * 스키마가 없는 라우트에 `MissingResponseSchema`를 돌려줘 컴파일을 터뜨린다.
 * 즉 여기 구멍이 하나 생기면 프론트가 그 라우트를 타입 안전하게 쓸 수 없다.
 *
 * 개별 도메인의 필드 검증은 각 도메인의 `*-response.dto.spec.ts`에 있다.
 * 이 파일은 "빠진 라우트가 없는가" 하나만 본다.
 */
describe('OpenAPI 응답 스키마 커버리지', () => {
  const spec = JSON.parse(readFileSync(join(__dirname, '../../openapi.json'), 'utf8'));

  type MediaType = { schema?: Record<string, unknown> };
  type Operation = {
    responses?: Record<string, { content?: Record<string, MediaType> }>;
  };

  const operations: Array<{ path: string; method: string; op: Operation }> = [];
  for (const [path, item] of Object.entries(
    spec.paths as Record<string, Record<string, Operation>>,
  )) {
    for (const [method, op] of Object.entries(item)) {
      operations.push({ path, method, op });
    }
  }

  /**
   * 성공 응답에 **비어 있지 않은 스키마**가 있는지 본다.
   *
   * `application/json` 키의 존재만 보면 안 된다. `content: { 'application/json': {} }`
   * 처럼 스키마가 빈 상태도 통과하는데, 프론트의 `ApiOkJson` 헬퍼는 그때
   * `MissingResponseSchema`를 돌려줘 **컴파일이 터진다**. 즉 이 파일이 막겠다고
   * 선언한 바로 그 상태가 초록으로 지나가고 있었다(뮤테이션으로 확인).
   */
  function hasSuccessBody(op: Operation) {
    const r = op.responses ?? {};
    const media =
      r['200']?.content?.['application/json'] ?? r['201']?.content?.['application/json'];
    if (!media) return false;
    const schema = media.schema;
    return Boolean(schema && Object.keys(schema).length > 0);
  }
  const hasNoContent = (op: Operation) => Boolean(op.responses?.['204']);

  /**
   * 오퍼레이션 **총 개수**를 고정한다.
   *
   * `> 0`만 보면 라우트를 통째로 지웠을 때 순회 대상에서 빠져 아무 검사도
   * 걸리지 않는다(뮤테이션으로 확인: 72→71이어도 전부 통과했다).
   * 라우트를 의도적으로 추가/삭제했다면 이 숫자를 함께 고친다 —
   * 그 순간이 "스펙이 실제로 바뀌었다"를 리뷰에서 드러내는 지점이다.
   */
  const EXPECTED_OPERATION_COUNT = 72;

  it(`스펙에 오퍼레이션이 정확히 ${EXPECTED_OPERATION_COUNT}개 있다`, () => {
    expect(operations).toHaveLength(EXPECTED_OPERATION_COUNT);
  });

  /**
   * 이 프로젝트의 핵심 불변식. 모든 오퍼레이션은 둘 중 하나여야 한다:
   *   - 200/201에 application/json 스키마가 있다
   *   - 204를 선언했다 (본문이 없는 라우트)
   *
   * 어느 쪽도 아니면 "성공하면 무엇이 오는지 알 수 없는" 라우트다.
   * 실제로 그런 라우트가 67건 있었고(#103 착수 시점), 그중 8건은 204인데
   * 에러 데코레이터 때문에 성공 응답이 스펙에서 사라진 경우였다.
   */
  it('모든 오퍼레이션이 성공 응답을 선언한다', () => {
    const missing = operations
      .filter(({ op }) => !hasSuccessBody(op) && !hasNoContent(op))
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`);

    expect(missing).toEqual([]);
  });

  it('204 라우트는 본문 스키마를 갖지 않는다', () => {
    const both = operations
      .filter(({ op }) => hasNoContent(op) && hasSuccessBody(op))
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`);

    expect(both).toEqual([]);
  });
});
