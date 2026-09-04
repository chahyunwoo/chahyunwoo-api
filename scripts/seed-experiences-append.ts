/**
 * Experience 신규 추가 전용 시드 — 기존 데이터를 건드리지 않는다.
 *
 * seed-works-append.ts 와 같은 원칙이다: 추가만 하고, 지우지 않는다.
 * 중복 판정은 ko 번역의 title 로 한다(experiences 에는 자연키가 없다).
 *
 * sortOrder 주의:
 *   조회는 `orderBy: { sortOrder: 'asc' }` 다(portfolio.service.ts).
 *   기존 행이 1..6 을 쓰고 있으므로 맨 위에 두려면 0 을 준다 —
 *   입력 JSON 의 sortOrder 를 그대로 쓰고, 기존 행은 재정렬하지 않는다.
 *   (기존 행을 UPDATE 하지 않는 것이 이 스크립트의 요지다)
 *
 * Usage:
 *   npx tsx scripts/seed-experiences-append.ts            # dry-run
 *   npx tsx scripts/seed-experiences-append.ts --commit
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const REQUIRED_LOCALES = ['ko', 'en', 'jp'] as const;

interface ExperienceTranslationJson {
  locale: string;
  title: string;
  role: string;
  responsibilities: string[];
}

interface ExperienceJson {
  sortOrder: number;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  translations: ExperienceTranslationJson[];
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
}

function validate(items: ExperienceJson[]): string[] {
  const errors: string[] = [];
  items.forEach((e, i) => {
    const at = `experiences[${i}]`;
    if (!e.startDate?.trim()) errors.push(`${at}.startDate 가 비었다`);
    if (e.isCurrent && e.endDate) {
      errors.push(`${at}: isCurrent 인데 endDate 가 있다`);
    }
    const locales = e.translations.map(t => t.locale);
    for (const need of REQUIRED_LOCALES) {
      if (!locales.includes(need)) errors.push(`${at} 에 locale '${need}' 이 없다`);
    }
    if (new Set(locales).size !== locales.length) {
      errors.push(`${at} 에 중복 locale 이 있다`);
    }
    for (const t of e.translations) {
      if (!t.title?.trim()) errors.push(`${at}[${t.locale}].title 이 비었다`);
      if (!t.role?.trim()) errors.push(`${at}[${t.locale}].role 이 비었다`);
      if (t.title.length > 300) errors.push(`${at}[${t.locale}].title 이 300자를 넘는다`);
      if (t.role.length > 300) errors.push(`${at}[${t.locale}].role 이 300자를 넘는다`);
      if (!Array.isArray(t.responsibilities) || t.responsibilities.length === 0) {
        errors.push(`${at}[${t.locale}].responsibilities 가 비었다`);
      }
    }
    // 세 locale 의 responsibilities 개수가 다르면 번역 누락이다.
    const counts = new Set(e.translations.map(t => t.responsibilities.length));
    if (counts.size > 1) {
      errors.push(
        `${at}: locale 별 responsibilities 개수가 다르다 (` +
          e.translations.map(t => `${t.locale}=${t.responsibilities.length}`).join(', ') +
          ')',
      );
    }
  });
  return errors;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const filePath = path.resolve(
    __dirname,
    '..',
    process.env.EXPERIENCE_JSON ?? 'temp/experience-append.json',
  );

  if (!fs.existsSync(filePath)) {
    console.error(`입력 파일이 없다: ${filePath}`);
    process.exit(1);
  }

  const items: ExperienceJson[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(items) || items.length === 0) {
    console.error('입력이 비어 있거나 배열이 아니다');
    process.exit(1);
  }

  const errors = validate(items);
  if (errors.length > 0) {
    console.error('입력 검증 실패:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    const existing = await prisma.experienceTranslation.findMany({
      where: { locale: 'ko' },
      select: { title: true },
    });
    const existingTitles = new Set(existing.map(t => t.title));

    const toAdd = items.filter(e => {
      const ko = e.translations.find(t => t.locale === 'ko');
      return ko ? !existingTitles.has(ko.title) : false;
    });
    const skipped = items.filter(e => !toAdd.includes(e));

    console.log(`\n기존 experiences(ko 기준): ${existingTitles.size}건`);
    console.log(`입력 ${items.length}건 → 추가 ${toAdd.length} / 건너뜀 ${skipped.length}\n`);

    for (const e of skipped) {
      console.log(`  건너뜀: ${e.translations.find(t => t.locale === 'ko')?.title}`);
    }
    for (const e of toAdd) {
      const ko = e.translations.find(t => t.locale === 'ko');
      console.log(
        `  + sortOrder=${e.sortOrder} ${ko?.title}\n` +
          `      ${e.startDate}~${e.endDate ?? '현재'} isCurrent=${e.isCurrent} ` +
          `responsibilities=${ko?.responsibilities.length}개`,
      );
    }
    console.log('');

    // 새로 넣을 sortOrder 가 기존과 충돌하는지 알려 준다(정렬이 불안정해진다).
    if (toAdd.length > 0) {
      const clashes = await prisma.experience.findMany({
        where: { sortOrder: { in: toAdd.map(e => e.sortOrder) } },
        select: { id: true, sortOrder: true },
      });
      if (clashes.length > 0) {
        console.log('⚠ sortOrder 충돌 — 같은 값을 쓰는 기존 행이 있다:');
        for (const c of clashes) console.log(`    experience#${c.id} sortOrder=${c.sortOrder}`);
        console.log('  같은 값이면 표시 순서가 보장되지 않는다.\n');
      }
    }

    if (!commit) {
      console.log('※ dry-run 이다. 실제로 반영하려면 --commit 을 붙인다.');
      return;
    }
    if (toAdd.length === 0) {
      console.log('추가할 것이 없다.');
      return;
    }

    for (const e of toAdd) {
      const created = await prisma.experience.create({
        data: {
          sortOrder: e.sortOrder,
          startDate: e.startDate,
          endDate: e.endDate,
          isCurrent: e.isCurrent,
          translations: {
            create: e.translations.map(t => ({
              locale: t.locale,
              title: t.title,
              role: t.role,
              responsibilities: t.responsibilities,
            })),
          },
        },
        select: { id: true },
      });
      console.log(
        `  created experience#${created.id} ` +
          `${e.translations.find(t => t.locale === 'ko')?.title}`,
      );
    }

    console.log(`\n완료: ${toAdd.length}건 추가`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
