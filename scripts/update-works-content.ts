/**
 * 특정 work 의 번역 본문(content / highlights / summary)만 갱신한다.
 *
 * 왜 필요한가:
 *   seed-works-append.ts 는 추가 전용이라 이미 들어간 항목을 고치지 못한다.
 *   본문 형식을 잘못 넣은 것을 바로잡으려면 UPDATE 경로가 따로 있어야 한다.
 *
 * 안전장치:
 *   - **대상을 ko 제목으로 명시적으로 지정한다.** id 를 직접 받지 않는다
 *     (id 는 환경마다 다르고, 잘못 적으면 엉뚱한 행을 덮어쓴다).
 *   - 입력에 없는 work 는 건드리지 않는다. 매칭 실패는 에러로 멈춘다.
 *   - 기본은 dry-run. `--commit` 이 있어야 쓴다.
 *   - 갱신 전 현재 값의 길이를 함께 출력해 무엇이 어떻게 바뀌는지 보이게 한다.
 *   - title / type / 기간 / techStack 등 본문 외 필드는 건드리지 않는다.
 *
 * Usage:
 *   npx tsx scripts/update-works-content.ts            # dry-run
 *   npx tsx scripts/update-works-content.ts --commit
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const REQUIRED_LOCALES = ['ko', 'en', 'jp'] as const;

interface TranslationPatch {
  locale: string;
  /** 지정하면 title 도 갱신한다. 생략하면 기존 title 을 유지한다. */
  title?: string;
  summary: string;
  content: string;
  highlights: string[];
}

interface WorkPatch {
  /** 갱신 대상을 찾는 키. ko 번역의 title 과 정확히 일치해야 한다. */
  matchKoTitle: string;
  translations: TranslationPatch[];
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
}

function validate(patches: WorkPatch[]): string[] {
  const errors: string[] = [];
  patches.forEach((p, i) => {
    const at = `patch[${i}] (${p.matchKoTitle.slice(0, 30)}…)`;
    if (!p.matchKoTitle?.trim()) errors.push(`${at}: matchKoTitle 이 비었다`);
    const locales = p.translations.map(t => t.locale);
    for (const need of REQUIRED_LOCALES) {
      if (!locales.includes(need)) errors.push(`${at}: locale '${need}' 이 없다`);
    }
    for (const t of p.translations) {
      if (!t.content?.trim()) errors.push(`${at}[${t.locale}]: content 가 비었다`);
      if (!t.summary?.trim()) errors.push(`${at}[${t.locale}]: summary 가 비었다`);
      // highlights 가 비면 PDF 이력서에 항목이 하나도 안 나온다 — 실제로 겪은 사고다.
      if (!Array.isArray(t.highlights) || t.highlights.length === 0) {
        errors.push(`${at}[${t.locale}]: highlights 가 비었다 (PDF 에 항목이 안 나온다)`);
      }
      // 기존 항목이 5~7개다. 너무 적으면 형식이 어긋난 것이다.
      if (t.highlights.length < 3) {
        errors.push(`${at}[${t.locale}]: highlights 가 ${t.highlights.length}개뿐이다 (3개 이상)`);
      }
      if (t.title !== undefined && (!t.title.trim() || t.title.length > 500)) {
        errors.push(`${at}[${t.locale}]: title 이 비었거나 500자를 넘는다`);
      }
    }
  });
  return errors;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const filePath = path.resolve(
    __dirname,
    '..',
    process.env.PATCH_JSON ?? 'temp/work-content-patch.json',
  );

  if (!fs.existsSync(filePath)) {
    console.error(`입력 파일이 없다: ${filePath}`);
    process.exit(1);
  }

  const patches: WorkPatch[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(patches) || patches.length === 0) {
    console.error('입력이 비어 있거나 배열이 아니다');
    process.exit(1);
  }

  const errors = validate(patches);
  if (errors.length > 0) {
    console.error('입력 검증 실패:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    // ko 제목 -> workId 를 먼저 확정한다. 하나라도 못 찾으면 아무것도 쓰지 않는다.
    const resolved: { workId: number; patch: WorkPatch }[] = [];
    const notFound: string[] = [];

    for (const p of patches) {
      const hit = await prisma.workTranslation.findFirst({
        where: { locale: 'ko', title: p.matchKoTitle },
        select: { workId: true },
      });
      if (hit) resolved.push({ workId: hit.workId, patch: p });
      else notFound.push(p.matchKoTitle);
    }

    if (notFound.length > 0) {
      console.error('대상을 찾지 못했다 (제목이 정확히 일치해야 한다):');
      for (const t of notFound) console.error(`  - ${t}`);
      process.exit(1);
    }

    console.log(`\n갱신 대상 ${resolved.length}건\n`);

    for (const { workId, patch } of resolved) {
      const current = await prisma.workTranslation.findMany({
        where: { workId },
        select: { locale: true, title: true, content: true, highlights: true },
      });
      const cur = new Map(current.map(c => [c.locale, c]));
      console.log(`  work#${workId} ${patch.matchKoTitle.slice(0, 46)}`);
      for (const t of patch.translations) {
        const c = cur.get(t.locale);
        console.log(
          `    ${t.locale}: content ${c?.content.length ?? 0} -> ${t.content.length}자, ` +
            `highlights ${c?.highlights.length ?? 0} -> ${t.highlights.length}개`,
        );
        if (t.title !== undefined && t.title !== c?.title) {
          console.log(`         title: "${c?.title ?? ''}"`);
          console.log(`             -> "${t.title}"`);
        }
      }
    }
    console.log('');

    if (!commit) {
      console.log('※ dry-run 이다. 실제로 반영하려면 --commit 을 붙인다.');
      return;
    }

    let updated = 0;
    for (const { workId, patch } of resolved) {
      for (const t of patch.translations) {
        await prisma.workTranslation.update({
          where: { workId_locale: { workId, locale: t.locale } },
          data: {
            summary: t.summary,
            content: t.content,
            highlights: t.highlights,
            ...(t.title !== undefined && { title: t.title }),
          },
        });
        updated += 1;
      }
      console.log(`  updated work#${workId} (${patch.translations.length} locales)`);
    }

    console.log(`\n완료: ${resolved.length}건 / 번역 ${updated}행 갱신`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Update failed:', err);
  process.exit(1);
});
