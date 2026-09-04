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

  type Operation = {
    responses?: Record<string, { content?: Record<string, unknown> }>;
  };

  const operations: Array<{ path: string; method: string; op: Operation }> = [];
  for (const [path, item] of Object.entries(
    spec.paths as Record<string, Record<string, Operation>>,
  )) {
    for (const [method, op] of Object.entries(item)) {
      operations.push({ path, method, op });
    }
  }

  function hasSuccessBody(op: Operation) {
    const r = op.responses ?? {};
    return Boolean(
      r['200']?.content?.['application/json'] ?? r['201']?.content?.['application/json'],
    );
  }
  const hasNoContent = (op: Operation) => Boolean(op.responses?.['204']);

  it('스펙에 오퍼레이션이 있다', () => {
    expect(operations.length).toBeGreaterThan(0);
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
