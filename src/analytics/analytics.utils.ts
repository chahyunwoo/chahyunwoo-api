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
    host = referrer.split(/[/:?#]/)[0];
  }
  host = host.toLowerCase();
  return REFERRER_SPAM_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

// isSpamReferrer 와 같은 판정을 DB 에서 — 경로·쿼리에 도메인이 들어간 정상 유입을 거르지 않도록 호스트만 본다.
const referrerHostSql = Prisma.sql`lower(substring(pv.referrer from '^(?:[A-Za-z][A-Za-z0-9+.-]*://)?([^/:?#]+)'))`;

export const spamReferrerSql: Prisma.Sql = Prisma.sql`(${Prisma.join(
  REFERRER_SPAM_DOMAINS.map(
    domain =>
      Prisma.sql`${referrerHostSql} = ${domain} OR ${referrerHostSql} LIKE ${`%.${domain}`}`,
  ),
  ' OR ',
)})`;

// 직접 유입(NULL·빈 문자열)은 판정이 NULL 이 되어 NOT 으로도 걸러지므로 false 로 접는다.
export const referrerSpamSql: Prisma.Sql = Prisma.sql`(pv.referrer IS NULL OR NOT COALESCE(${spamReferrerSql}, false))`;
