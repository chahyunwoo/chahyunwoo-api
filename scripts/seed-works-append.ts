/**
 * Work 신규 추가 전용 시드 — 기존 데이터를 건드리지 않는다.
 *
 * 왜 seed-works.ts 를 쓰지 않는가:
 *   scripts/seed-works.ts 는 `prisma.work.deleteMany()` 로 **전체를 지우고** 다시 넣는다.
 *   초기 시드에는 맞지만 운영 DB 에 돌리면 기존 항목과 그 번역이 전부 사라진다.
 *   이 스크립트는 추가만 한다 — 이미 있는 title(ko) 은 건너뛰고, 없는 것만 create 한다.
 *
 * 안전장치:
 *   - 기본은 dry-run 이다. 실제로 쓰려면 `--commit` 을 붙인다.
 *   - 무엇을 추가하고 무엇을 건너뛰는지 먼저 출력한다.
 *   - 한 건씩 트랜잭션으로 넣어, 중간에 실패해도 반쯤 들어간 work 가 남지 않는다.
 *
 * Usage:
 *   npx tsx scripts/seed-works-append.ts              # dry-run (기본)
 *   npx tsx scripts/seed-works-append.ts --commit     # 실제 반영
 *   WORK_JSON=temp/work-append.json npx tsx scripts/seed-works-append.ts --commit
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const REQUIRED_LOCALES = ['ko', 'en', 'jp'] as const;

interface WorkTranslationJson {
  locale: string;
  title: string;
  role: string | null;
  summary: string;
  content: string;
  highlights: string[];
}

interface WorkJson {
  type: string;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  techStack: string[];
  demoUrl: string | null;
  repoUrl: string | null;
  featured: boolean;
  translations: WorkTranslationJson[];
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
}

/** 넣기 전에 형태를 검사한다. 잘못된 데이터가 운영 DB 에 들어간 뒤에 아는 것보다 낫다. */
function validate(works: WorkJson[]): string[] {
  const errors: string[] = [];
  works.forEach((w, i) => {
    const at = `works[${i}]`;
    if (!['business', 'personal'].includes(w.type)) {
      errors.push(`${at}.type 이 business|personal 이 아니다: ${w.type}`);
    }
    if (!Array.isArray(w.techStack)) errors.push(`${at}.techStack 이 배열이 아니다`);

    const locales = w.translations.map(t => t.locale);
    for (const need of REQUIRED_LOCALES) {
      if (!locales.includes(need)) errors.push(`${at} 에 locale '${need}' 이 없다`);
    }
    if (new Set(locales).size !== locales.length) {
      errors.push(`${at} 에 중복 locale 이 있다: ${locales.join(',')}`);
    }
    for (const t of w.translations) {
      if (!t.title?.trim()) errors.push(`${at}[${t.locale}].title 이 비었다`);
      if (!t.summary?.trim()) errors.push(`${at}[${t.locale}].summary 가 비었다`);
      if (!t.content?.trim()) errors.push(`${at}[${t.locale}].content 가 비었다`);
      if (t.title.length > 500) errors.push(`${at}[${t.locale}].title 이 500자를 넘는다`);
      if (t.role && t.role.length > 300) errors.push(`${at}[${t.locale}].role 이 300자를 넘는다`);
    }
  });
  return errors;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const workPath = path.resolve(__dirname, '..', process.env.WORK_JSON ?? 'temp/work-append.json');

  if (!fs.existsSync(workPath)) {
    console.error(`입력 파일이 없다: ${workPath}`);
    process.exit(1);
  }

  const works: WorkJson[] = JSON.parse(fs.readFileSync(workPath, 'utf8'));
  if (!Array.isArray(works) || works.length === 0) {
    console.error('입력이 비어 있거나 배열이 아니다');
    process.exit(1);
  }

  const errors = validate(works);
  if (errors.length > 0) {
    console.error('입력 검증 실패:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    // 기존 ko 제목으로 중복을 판정한다. (works 에는 자연키가 없다)
    const existing = await prisma.workTranslation.findMany({
      where: { locale: 'ko' },
      select: { title: true },
    });
    const existingTitles = new Set(existing.map(t => t.title));

    const toAdd = works.filter(w => {
      const ko = w.translations.find(t => t.locale === 'ko');
      return ko ? !existingTitles.has(ko.title) : false;
    });
    const skipped = works.filter(w => !toAdd.includes(w));

    console.log(`\n기존 works(ko 번역 기준): ${existingTitles.size}건`);
    console.log(`입력: ${works.length}건 → 추가 ${toAdd.length} / 건너뜀 ${skipped.length}\n`);

    if (skipped.length > 0) {
      console.log('건너뜀 (이미 있음):');
      for (const w of skipped) {
        console.log(`  - ${w.translations.find(t => t.locale === 'ko')?.title}`);
      }
      console.log('');
    }

    if (toAdd.length > 0) {
      console.log('추가 대상:');
      for (const w of toAdd) {
        const ko = w.translations.find(t => t.locale === 'ko');
        const locales = w.translations.map(t => t.locale).join('/');
        console.log(
          `  + [${w.type}] ${ko?.title}\n` +
            `      기간=${w.startDate ?? '-'}~${w.endDate ?? '-'} ` +
            `featured=${w.featured} locales=${locales} ` +
            `content=${w.translations.map(t => t.content.length).join('/')}자`,
        );
      }
      console.log('');
    }

    if (!commit) {
      console.log('※ dry-run 이다. 실제로 반영하려면 --commit 을 붙인다.');
      return;
    }

    if (toAdd.length === 0) {
      console.log('추가할 것이 없다.');
      return;
    }

    // sortOrder 는 type 별 기존 최대값 뒤에 이어 붙인다 (기존 정렬을 흔들지 않는다).
    const nextOrder = new Map<string, number>();
    for (const type of new Set(toAdd.map(w => w.type))) {
      const max = await prisma.work.aggregate({
        where: { type },
        _max: { sortOrder: true },
      });
      nextOrder.set(type, (max._max.sortOrder ?? -1) + 1);
    }

    let created = 0;
    for (const w of toAdd) {
      const order = nextOrder.get(w.type) ?? 0;
      nextOrder.set(w.type, order + 1);

      const result = await prisma.work.create({
        data: {
          type: w.type,
          sortOrder: order,
          startDate: w.startDate,
          endDate: w.endDate,
          isCurrent: w.isCurrent,
          techStack: w.techStack,
          demoUrl: w.demoUrl,
          repoUrl: w.repoUrl,
          featured: w.featured,
          translations: {
            create: w.translations.map(t => ({
              locale: t.locale,
              title: t.title,
              role: t.role,
              summary: t.summary,
              content: t.content,
              highlights: t.highlights,
            })),
          },
        },
        select: { id: true },
      });
      created += 1;
      console.log(
        `  created work#${result.id} sortOrder=${order} ` +
          `${w.translations.find(t => t.locale === 'ko')?.title}`,
      );
    }

    console.log(`\n완료: ${created}건 추가`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
