export const DEFAULT_LOCALE = 'ko';
export const PORTFOLIO_CACHE_PREFIX = 'portfolio';
export const PORTFOLIO_CACHE_TTL = 300_000; // 5 minutes

/**
 * ValidateLocalePipe가 유효 locale 코드 목록을 다시 읽는 주기.
 *
 * 짧게 잡는다 — 3건짜리 테이블이라 조회 비용이 사실상 없고, 이 캐시의 목적은
 * 성능이 아니라 "매 요청 DB를 때리지 않는다" 정도다. 길게 잡으면 locale을 추가한 뒤
 * 반영되기까지의 공백이 그대로 길어진다.
 */
export const LOCALE_CACHE_TTL_MS = 30_000; // 30 seconds
