import { assertTestDatabase, extractDatabaseName, maskUrl } from './test-db-guard';

const PROD_URL = 'postgresql://chwzp:pw@localhost:5432/hyunwoo?schema=public';
const TEST_URL = 'postgresql://testuser:testpass@localhost:5434/hyunwoo_test?schema=public';

describe('assertTestDatabase', () => {
  it('DB 이름이 _test로 끝나면 통과하고 그 이름을 돌려준다', () => {
    expect(assertTestDatabase(TEST_URL)).toBe('hyunwoo_test');
  });

  it('운영 DB(hyunwoo)를 거부한다', () => {
    expect(() => assertTestDatabase(PROD_URL)).toThrow(/테스트 DB가 아닌 곳/);
  });

  /**
   * 판정을 호스트나 포트로 하면 안 되는 이유를 고정한다.
   * 운영 컨테이너도 localhost:5432를 노출하므로 호스트 기준은 구별력이 없고,
   * 반대로 테스트 포트에 운영 DB명이 오는 조합도 막아야 한다.
   */
  it('테스트 포트라도 DB 이름이 운영이면 거부한다', () => {
    expect(() => assertTestDatabase('postgresql://u:p@localhost:5434/hyunwoo')).toThrow(
      /테스트 DB가 아닌 곳/,
    );
  });

  it('운영 포트라도 DB 이름이 _test면 통과한다', () => {
    expect(assertTestDatabase('postgresql://u:p@localhost:5432/hyunwoo_test')).toBe('hyunwoo_test');
  });

  it('DATABASE_URL이 없으면 거부한다', () => {
    expect(() => assertTestDatabase(undefined)).toThrow(/DATABASE_URL이 없습니다/);
  });

  it('URL 형식이 아니면 거부한다', () => {
    expect(() => assertTestDatabase('not-a-url')).toThrow(/DB 이름을 읽을 수 없습니다/);
  });

  it('DB 이름이 비어 있으면 거부한다', () => {
    expect(() => assertTestDatabase('postgresql://u:p@localhost:5432/')).toThrow(
      /DB 이름을 읽을 수 없습니다/,
    );
  });

  it('거부 메시지에 비밀번호를 노출하지 않는다', () => {
    let message = '';
    try {
      assertTestDatabase('postgresql://u:supersecret@localhost:5432/');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain('supersecret');
  });
});

describe('extractDatabaseName', () => {
  it('쿼리 파라미터를 제외한 DB 이름만 꺼낸다', () => {
    expect(extractDatabaseName('postgresql://u:p@h:5432/hyunwoo_test?schema=public')).toBe(
      'hyunwoo_test',
    );
  });

  it('읽을 수 없으면 null', () => {
    expect(extractDatabaseName('garbage')).toBeNull();
  });
});

describe('maskUrl', () => {
  it('비밀번호를 가린다', () => {
    expect(maskUrl('postgresql://user:supersecret@h:5432/db')).toBe(
      'postgresql://user:***@h:5432/db',
    );
  });
});
