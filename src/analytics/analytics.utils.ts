import { VALID_APP_NAMES } from './analytics.constants';

export function safeInt(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function safeAppName(value?: string): string | undefined {
  if (!value) return undefined;
  return VALID_APP_NAMES.has(value) ? value : undefined;
}
