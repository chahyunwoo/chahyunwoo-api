/**
 * Work + Skill 데이터를 DB에 시드
 *
 * Usage: npx tsx scripts/seed-works.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
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
  translations: {
    locale: string;
    title: string;
    role: string | null;
    summary: string;
    content: string;
    highlights: string[];
  }[];
}

interface SkillJson {
  category: string;
  name: string;
  sortOrder: number;
  proficiency: number;
  description: string | null;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    const workPath = path.resolve(__dirname, '../temp/work.json');
    const skillPath = path.resolve(__dirname, '../temp/skills.json');

    // ─── Works ────────────────────────────────────────────────────────────────
    if (fs.existsSync(workPath)) {
      const works: WorkJson[] = JSON.parse(fs.readFileSync(workPath, 'utf8'));

      if (!Array.isArray(works) || works.length === 0) {
        console.error('Invalid work.json: expected non-empty array');
        return;
      }

      await prisma.work.deleteMany();

      for (const work of works) {
        await prisma.work.create({
          data: {
            type: work.type,
            sortOrder: work.sortOrder,
            startDate: work.startDate,
            endDate: work.endDate,
            isCurrent: work.isCurrent,
            techStack: work.techStack,
            demoUrl: work.demoUrl,
            repoUrl: work.repoUrl,
            featured: work.featured,
            translations: {
              create: work.translations.map(t => ({
                locale: t.locale,
                title: t.title,
                role: t.role,
                summary: t.summary,
                content: t.content,
                highlights: t.highlights,
              })),
            },
          },
        });
      }
      console.log(`Works seeded: ${works.length}`);
    } else {
      console.log('No work.json found, skipping works');
    }

    // ─── Skills ───────────────────────────────────────────────────────────────
    if (fs.existsSync(skillPath)) {
      const skills: SkillJson[] = JSON.parse(fs.readFileSync(skillPath, 'utf8'));

      if (!Array.isArray(skills) || skills.length === 0) {
        console.error('Invalid skills.json: expected non-empty array');
        return;
      }

      await prisma.skill.deleteMany();

      for (const skill of skills) {
        await prisma.skill.create({
          data: {
            category: skill.category,
            name: skill.name,
            sortOrder: skill.sortOrder,
            proficiency: skill.proficiency,
            description: skill.description,
          },
        });
      }
      console.log(`Skills seeded: ${skills.length}`);
    } else {
      console.log('No skills.json found, skipping skills');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
