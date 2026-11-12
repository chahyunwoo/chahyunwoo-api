export const VALID_APP_NAMES = new Set(['blog', 'portfolio', 'admin']);

// 실방문 없이 리퍼러만 심는 스팸 도메인. 수집 시 버리고, 이미 쌓인 행은 조회에서 제외한다.
export const REFERRER_SPAM_DOMAINS = ['aocr.org'];
