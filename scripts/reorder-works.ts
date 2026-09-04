/**
 * works 의 표시 순서(sortOrder)와 기간(startDate/endDate/isCurrent)을 정리한다.
 *
 * 왜 필요한가:
 *   조회 정렬이 `orderBy: [{ type }, { sortOrder }]` 라 sortOrder 가 곧 화면 순서다.
 *   신규 항목을 기존 뒤에 이어 붙이면 목록이 "과거 → 미래 → 과거" 로 튄다.
 *   실제로 그렇게 됐고(2026-09-05), 시작일 내림차순으로 다시 매긴다.
 *
 * 무엇을 바꾸는가: sortOrder / startDate / endDate / isCurrent 만.
 *   번역(title·summary·content·highlights) 과 techStack·featured 는 건드리지 않는다.
 *
 * 안전장치:
 *   - 대상을 ko 제목으로 지정한다. id 를 직접 받지 않는다.
 *   - 기본은 dry-run. `--commit` 이 있어야 쓴다.
 *   - 입력에 없는 work 가 DB 에 있으면 경고하고 멈춘다(순서에 구멍이 생긴다).
 *   - 적용 후 실제 정렬이 날짜 내림차순인지 스스로 검사한다.
 *
 * Usage:
 *   npx tsx scripts/reorder-works.ts            # dry-run
 *   npx tsx scripts/reorder-works.ts --commit
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

interface WorkOrder {
  /** 갱신 대상을 찾는 키. ko 번역의 title 과 정확히 일치해야 한다. */
  matchKoTitle: string;
  type: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
}

/** '2026.08' -> 202608. 정렬 키로만 쓴다. */
function dateKey(s: string | null): number {
  if (!s) return 0;
  const m = /^(\d{4})\.(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
}

function validate(items: WorkOrder[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, w] of items.entries()) {
    const at = `items[${i}] (${w.matchKoTitle.slice(0, 28)}…)`;
    if (!w.matchKoTitle?.trim()) errors.push(`${at}: matchKoTitle 이 비었다`);
    if (seen.has(w.matchKoTitle)) errors.push(`${at}: 제목이 중복이다`);
    seen.add(w.matchKoTitle);
    if (!['business', 'personal'].includes(w.type)) errors.push(`${at}: type 이 잘못됐다`);
    if (w.startDate && dateKey(w.startDate) === 0) {
      errors.push(`${at}: startDate 형식이 YYYY.MM 이 아니다 (${w.startDate})`);
    }
    if (w.endDate && dateKey(w.endDate) === 0) {
      errors.push(`${at}: endDate 형식이 YYYY.MM 이 아니다 (${w.endDate})`);
    }
    if (w.isCurrent && w.endDate === null && w.startDate === null) {
      errors.push(`${at}: 날짜가 하나도 없다`);
    }
    if (w.startDate && w.endDate && dateKey(w.startDate) > dateKey(w.endDate)) {
      errors.push(`${at}: startDate 가 endDate 보다 늦다`);
    }
  }
  return errors;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const filePath = path.resolve(__dirname, '..', process.env.ORDER_JSON ?? 'temp/work-order.json');

  if (!fs.existsSync(filePath)) {
    console.error(`입력 파일이 없다: ${filePath}`);
    process.exit(1);
  }

  const items: WorkOrder[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const errors = validate(items);
  if (errors.length > 0) {
    console.error('입력 검증 실패:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    // ko 제목 -> workId
    const resolved: { workId: number; item: WorkOrder }[] = [];
    const notFound: string[] = [];
    for (const w of items) {
      const hit = await prisma.workTranslation.findFirst({
        where: { locale: 'ko', title: w.matchKoTitle },
        select: { workId: true },
      });
      if (hit) resolved.push({ workId: hit.workId, item: w });
      else notFound.push(w.matchKoTitle);
    }
    if (notFound.length > 0) {
      console.error('대상을 찾지 못했다:');
      for (const t of notFound) console.error(`  - ${t}`);
      process.exit(1);
    }

    // DB 에 있는데 입력에 없는 work 가 있으면 순서에 구멍이 생긴다.
    const allWorks = await prisma.work.count();
    if (allWorks !== items.length) {
      console.error(
        `DB 의 works 는 ${allWorks}건인데 입력은 ${items.length}건이다. ` +
          '전부 나열해야 순서가 온전하다.',
      );
      process.exit(1);
    }

    // type 별로 시작일 내림차순 정렬 → sortOrder 0..n
    const byType = new Map<string, typeof resolved>();
    for (const r of resolved) {
      const list = byType.get(r.item.type) ?? [];
      list.push(r);
      byType.set(r.item.type, list);
    }

    const plan: { workId: number; type: string; sortOrder: number; item: WorkOrder }[] = [];
    for (const [type, list] of byType) {
      list.sort((a, b) => dateKey(b.item.startDate) - dateKey(a.item.startDate));
      list.forEach((r, i) => {
        plan.push({ workId: r.workId, type, sortOrder: i, item: r.item });
      });
    }

    // 현재 값과 비교해 무엇이 바뀌는지 보인다.
    const current = await prisma.work.findMany({
      select: {
        id: true,
        type: true,
        sortOrder: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
      },
    });
    const cur = new Map(current.map(c => [c.id, c]));

    console.log('');
    let changes = 0;
    for (const type of [...byType.keys()].sort()) {
      console.log(`[${type}]`);
      for (const p of plan.filter(x => x.type === type)) {
        const c = cur.get(p.workId);
        const diffs: string[] = [];
        if (c?.sortOrder !== p.sortOrder) diffs.push(`sortOrder ${c?.sortOrder}->${p.sortOrder}`);
        if (c?.startDate !== p.item.startDate)
          diffs.push(`start ${c?.startDate ?? '-'}->${p.item.startDate ?? '-'}`);
        if (c?.endDate !== p.item.endDate)
          diffs.push(`end ${c?.endDate ?? '-'}->${p.item.endDate ?? '-'}`);
        if (c?.isCurrent !== p.item.isCurrent)
          diffs.push(`isCurrent ${c?.isCurrent}->${p.item.isCurrent}`);
        if (diffs.length > 0) changes += 1;
        console.log(
          `  ${p.sortOrder.toString().padStart(2)} ${(p.item.startDate ?? '-').padEnd(8)}` +
            `${(p.item.endDate ?? '-').padEnd(9)} work#${p.workId} ` +
            `${p.item.matchKoTitle.slice(0, 40)}` +
            (diffs.length > 0 ? `\n       ${diffs.join(', ')}` : ''),
        );
      }
    }
    console.log(`\n변경되는 항목: ${changes}건 / 전체 ${plan.length}건`);

    if (!commit) {
      console.log('\n※ dry-run 이다. 실제로 반영하려면 --commit 을 붙인다.');
      return;
    }

    for (const p of plan) {
      await prisma.work.update({
        where: { id: p.workId },
        data: {
          sortOrder: p.sortOrder,
          startDate: p.item.startDate,
          endDate: p.item.endDate,
          isCurrent: p.item.isCurrent,
        },
      });
    }
    console.log(`\n완료: ${plan.length}건 갱신`);

    // 적용 결과가 실제로 날짜 내림차순인지 스스로 검사한다.
    const after = await prisma.work.findMany({
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, type: true, sortOrder: true, startDate: true },
    });
    let broken = 0;
    for (const type of new Set(after.map(a => a.type))) {
      const list = after.filter(a => a.type === type);
      for (let i = 1; i < list.length; i++) {
        if (dateKey(list[i].startDate) > dateKey(list[i - 1].startDate)) {
          console.error(
            `  !! ${type}: work#${list[i].id}(${list[i].startDate}) 가 ` +
              `work#${list[i - 1].id}(${list[i - 1].startDate}) 보다 뒤에 있다`,
          );
          broken += 1;
        }
      }
    }
    console.log(broken === 0 ? '검증: 모든 type 이 날짜 내림차순이다' : `검증 실패 ${broken}건`);
    if (broken > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Reorder failed:', err);
  process.exit(1);
});
