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
    host = referrer.split(/[/:]/)[0];
  }
  host = host.toLowerCase();
  return REFERRER_SPAM_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

type ReferrerMatch =
  | { equals: string }
  | { startsWith: string }
  | { endsWith: string }
  | { contains: string };

// isSpamReferrer 와 같은 호스트 경계(정확히 일치 또는 서브도메인)를 DB 조회용 패턴으로 옮긴 것.
function spamReferrerMatches(domain: string): ReferrerMatch[] {
  return [
    { equals: domain },
    { startsWith: `${domain}/` },
    { startsWith: `${domain}:` },
    { endsWith: `://${domain}` },
    { contains: `://${domain}/` },
    { contains: `://${domain}:` },
    { endsWith: `.${domain}` },
    { contains: `.${domain}/` },
    { contains: `.${domain}:` },
  ];
}

function toLikePattern(match: ReferrerMatch): string {
  const escapeLike = (v: string) => v.replace(/[\\%_]/g, c => `\\${c}`);
  if ('equals' in match) return escapeLike(match.equals);
  if ('startsWith' in match) return `${escapeLike(match.startsWith)}%`;
  if ('endsWith' in match) return `%${escapeLike(match.endsWith)}`;
  return `%${escapeLike(match.contains)}%`;
}

const spamMatches = REFERRER_SPAM_DOMAINS.flatMap(spamReferrerMatches);

// NOT(referrer LIKE ..) 는 referrer 가 NULL 인 직접 유입까지 걸러내므로 NULL 을 따로 살린다.
export const referrerSpamFilter: Prisma.PageViewWhereInput = {
  OR: [
    { referrer: null },
    {
      NOT: {
        OR: spamMatches.map(match => ({ referrer: { ...match, mode: 'insensitive' as const } })),
      },
    },
  ],
};

export const referrerSpamSql: Prisma.Sql = Prisma.sql`(pv.referrer IS NULL OR NOT (${Prisma.join(
  spamMatches.map(match => Prisma.sql`pv.referrer ILIKE ${toLikePattern(match)}`),
  ' OR ',
)}))`;
