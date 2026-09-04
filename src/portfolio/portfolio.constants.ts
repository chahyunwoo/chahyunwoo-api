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

/**
 * 포트폴리오 콘텐츠가 바뀌었을 때 revalidate를 통보할 프론트 앱 목록.
 *
 * `blog`가 들어 있는 것이 핵심이다 — 블로그 앱의 `/about/[locale]`이
 * 포트폴리오 API를 직접 소비하므로, 포트폴리오만 통보하면 블로그의 소개 페이지가
 * 영구 stale로 남는다(`DEFAULT_REVALIDATE = false`라 시간 만료가 없다).
 */
export const PORTFOLIO_REVALIDATION_TARGETS = ['portfolio', 'blog'] as const;
