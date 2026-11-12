import { Prisma } from '@prisma/client';
import { REFERRER_SPAM_DOMAINS, VALID_APP_NAMES } from './analytics.constants';

export function safeInt(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function safeAppName(value?: string): string | undefined {
  if (!value) return undefined;
  return VALID_APP_NAMES.has(value) ? value : undefined;
}

export function isSpamReferrer(referrer?: string | null): boolean {
  if (!referrer) return false;
  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    host = referrer;
  }
  host = host.toLowerCase();
  return REFERRER_SPAM_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

// NOT(referrer LIKE ..) 는 referrer 가 NULL 인 직접 유입까지 걸러내므로 NULL 을 따로 살린다.
export const referrerSpamFilter: Prisma.PageViewWhereInput = {
  OR: [
    { referrer: null },
    { NOT: { OR: REFERRER_SPAM_DOMAINS.map(domain => ({ referrer: { contains: domain } })) } },
  ],
};
