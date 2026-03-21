export const SUPPORTED_LOCALES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'jp', label: '日本語' },
] as const;

export const LOCALE_CODES = SUPPORTED_LOCALES.map(l => l.code);
