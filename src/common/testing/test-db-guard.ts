/**
 * 테스트가 운영 DB에 붙는 것을 물리적으로 막는다.
 *
 * 왜 텍스트 규칙이 아니라 코드인가:
 *   "테스트는 운영 DB를 쓰지 않는다"는 약속은 다음 세션, 다른 사람, 급한 상황에서
 *   조용히 깨진다. 운영 DB에 `migrate reset`이 한 번 돌면 되돌릴 수 없다.
 *   그래서 검사를 테스트 부팅 경로에 박아, 조건을 어기면 아무 테스트도 시작되지 않게 한다.
 *
 * 판정 기준은 "DB 이름이 _test로 끝나는가" 하나다. 호스트나 포트로 판정하지 않는다 —
 * 운영 컨테이너도 localhost에 포트를 노출하고 있어(5432) 호스트 기준은 구별력이 없다.
 */

const TEST_DB_SUFFIX = '_test';

/** DATABASE_URL에서 DB 이름만 꺼낸다. 실패하면 null. */
export function extractDatabaseName(url: string): string | null {
  try {
    // postgresql://user:pass@host:port/dbname?params
    const { pathname } = new URL(url);
    const name = pathname.replace(/^\//, '');
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

export function assertTestDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error(
      'DATABASE_URL이 없습니다. 통합 테스트는 전용 테스트 DB를 요구합니다. ' +
        'test/README.md의 컨테이너 기동 절차를 따르세요.',
    );
  }

  const dbName = extractDatabaseName(url);
  if (!dbName) {
    throw new Error(`DATABASE_URL에서 DB 이름을 읽을 수 없습니다: ${maskUrl(url)}`);
  }

  if (!dbName.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `테스트가 테스트 DB가 아닌 곳에 붙으려 합니다: DB 이름 "${dbName}". ` +
        `이름이 "${TEST_DB_SUFFIX}"로 끝나는 DB만 허용합니다. ` +
        '운영 DB(hyunwoo)에 테스트를 돌리면 데이터가 파괴됩니다.',
    );
  }

  return dbName;
}

/** 에러 메시지에 비밀번호를 노출하지 않는다. */
export function maskUrl(url: string): string {
  return url.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
}
