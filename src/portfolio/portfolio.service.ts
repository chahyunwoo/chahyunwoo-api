import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import type {
  CreateEducationDto,
  CreateExperienceDto,
  CreateProjectDto,
  CreateSkillDto,
  UpdateProfileDto,
} from './dto';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidation: RevalidationService,
  ) {}

  // ─── Profile ────────────────────────────────────────────────────────────────

  async getProfile(locale: string) {
    const profile = await this.prisma.profile.findFirst({
      include: { translations: { where: { locale } } },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    const t = profile.translations[0];
    return {
      name: profile.name,
      location: profile.location,
      imageUrl: profile.imageUrl,
      socialLinks: profile.socialLinks,
      jobTitle: t?.jobTitle ?? '',
      introduction: t?.introduction ?? [],
    };
  }

  async updateProfile(dto: UpdateProfileDto) {
    let profile = await this.prisma.profile.findFirst();

    if (!profile) {
      profile = await this.prisma.profile.create({
        data: {
          name: dto.name ?? '',
          location: dto.location ?? '',
          socialLinks: dto.socialLinks ? JSON.parse(JSON.stringify(dto.socialLinks)) : undefined,
        },
      });
    } else {
      profile = await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.location !== undefined && { location: dto.location }),
          ...(dto.socialLinks !== undefined && {
            socialLinks: JSON.parse(JSON.stringify(dto.socialLinks)),
          }),
        },
      });
    }

    if (dto.translations) {
      for (const t of dto.translations) {
        await this.prisma.profileTranslation.upsert({
          where: { profileId_locale: { profileId: profile.id, locale: t.locale } },
          create: {
            profileId: profile.id,
            locale: t.locale,
            jobTitle: t.jobTitle,
            introduction: t.introduction,
          },
          update: { jobTitle: t.jobTitle, introduction: t.introduction },
        });
      }
    }

    await this.revalidation.trigger('portfolio');
    return this.getProfile('ko');
  }

  // ─── Experiences ────────────────────────────────────────────────────────────

  async getExperiences(locale: string) {
    const experiences = await this.prisma.experience.findMany({
      include: { translations: { where: { locale } } },
      orderBy: { sortOrder: 'asc' },
    });

    return experiences.map(exp => {
      const t = exp.translations[0];
      return {
        id: exp.id,
        startDate: exp.startDate,
        endDate: exp.endDate,
        isCurrent: exp.isCurrent,
        title: t?.title ?? '',
        role: t?.role ?? '',
        responsibilities: t?.responsibilities ?? [],
      };
    });
  }

  async createExperience(dto: CreateExperienceDto) {
    const result = await this.prisma.experience.create({
      data: {
        sortOrder: dto.sortOrder ?? 0,
        startDate: dto.startDate,
        endDate: dto.endDate,
        isCurrent: dto.isCurrent ?? false,
        translations: {
          create: dto.translations.map(t => ({
            locale: t.locale,
            title: t.title,
            role: t.role,
            responsibilities: t.responsibilities,
          })),
        },
      },
      include: { translations: true },
    });
    await this.revalidation.trigger('portfolio');
    return result;
  }

  async updateExperience(id: number, dto: CreateExperienceDto) {
    const existing = await this.prisma.experience.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Experience not found');

    const result = await this.prisma.experience.update({
      where: { id },
      data: {
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        startDate: dto.startDate,
        endDate: dto.endDate,
        isCurrent: dto.isCurrent ?? existing.isCurrent,
        translations: {
          deleteMany: {},
          create: dto.translations.map(t => ({
            locale: t.locale,
            title: t.title,
            role: t.role,
            responsibilities: t.responsibilities,
          })),
        },
      },
      include: { translations: true },
    });
    await this.revalidation.trigger('portfolio');
    return result;
  }

  async deleteExperience(id: number): Promise<void> {
    const existing = await this.prisma.experience.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Experience not found');
    await this.prisma.experience.delete({ where: { id } });
    await this.revalidation.trigger('portfolio');
  }

  // ─── Projects ───────────────────────────────────────────────────────────────

  async getProjects(locale: string) {
    const projects = await this.prisma.project.findMany({
      include: { translations: { where: { locale } } },
      orderBy: { sortOrder: 'asc' },
    });

    return projects.map(proj => {
      const t = proj.translations[0];
      return {
        id: proj.id,
        demoUrl: proj.demoUrl,
        repoUrl: proj.repoUrl,
        techStack: proj.techStack,
        featured: proj.featured,
        title: t?.title ?? '',
        description: t?.description ?? '',
      };
    });
  }

  async createProject(dto: CreateProjectDto) {
    const result = await this.prisma.project.create({
      data: {
        sortOrder: dto.sortOrder ?? 0,
        demoUrl: dto.demoUrl,
        repoUrl: dto.repoUrl,
        techStack: dto.techStack,
        featured: dto.featured ?? false,
        translations: {
          create: dto.translations.map(t => ({
            locale: t.locale,
            title: t.title,
            description: t.description,
          })),
        },
      },
      include: { translations: true },
    });
    await this.revalidation.trigger('portfolio');
    return result;
  }

  async updateProject(id: number, dto: CreateProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');

    const result = await this.prisma.project.update({
      where: { id },
      data: {
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        demoUrl: dto.demoUrl,
        repoUrl: dto.repoUrl,
        techStack: dto.techStack,
        featured: dto.featured ?? existing.featured,
        translations: {
          deleteMany: {},
          create: dto.translations.map(t => ({
            locale: t.locale,
            title: t.title,
            description: t.description,
          })),
        },
      },
      include: { translations: true },
    });
    await this.revalidation.trigger('portfolio');
    return result;
  }

  async deleteProject(id: number): Promise<void> {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    await this.prisma.project.delete({ where: { id } });
    await this.revalidation.trigger('portfolio');
  }

  // ─── Skills ─────────────────────────────────────────────────────────────────

  async getSkills() {
    const skills = await this.prisma.skill.findMany({ orderBy: { sortOrder: 'asc' } });

    const grouped: Record<string, string[]> = {};
    for (const skill of skills) {
      if (!grouped[skill.category]) grouped[skill.category] = [];
      grouped[skill.category].push(skill.name);
    }

    return Object.entries(grouped).map(([category, items]) => ({ category, items }));
  }

  async createSkill(dto: CreateSkillDto) {
    const result = await this.prisma.skill.create({
      data: { category: dto.category, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
    });
    await this.revalidation.trigger('portfolio');
    return result;
  }

  async updateSkill(id: number, dto: CreateSkillDto) {
    const existing = await this.prisma.skill.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Skill not found');

    const result = await this.prisma.skill.update({
      where: { id },
      data: {
        category: dto.category,
        name: dto.name,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
      },
    });
    await this.revalidation.trigger('portfolio');
    return result;
  }

  async deleteSkill(id: number): Promise<void> {
    const existing = await this.prisma.skill.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Skill not found');
    await this.prisma.skill.delete({ where: { id } });
    await this.revalidation.trigger('portfolio');
  }

  // ─── Education ──────────────────────────────────────────────────────────────

  async getEducation(locale: string) {
    const records = await this.prisma.education.findMany({
      include: { translations: { where: { locale } } },
      orderBy: { sortOrder: 'asc' },
    });

    return records.map(edu => {
      const t = edu.translations[0];
      return {
        id: edu.id,
        period: edu.period,
        institution: t?.institution ?? '',
        degree: t?.degree ?? '',
      };
    });
  }

  async createEducation(dto: CreateEducationDto) {
    const result = await this.prisma.education.create({
      data: {
        period: dto.period,
        sortOrder: dto.sortOrder ?? 0,
        translations: {
          create: dto.translations.map(t => ({
            locale: t.locale,
            institution: t.institution,
            degree: t.degree,
          })),
        },
      },
      include: { translations: true },
    });
    await this.revalidation.trigger('portfolio');
    return result;
  }

  async updateEducation(id: number, dto: CreateEducationDto) {
    const existing = await this.prisma.education.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Education not found');

    const result = await this.prisma.education.update({
      where: { id },
      data: {
        period: dto.period,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        translations: {
          deleteMany: {},
          create: dto.translations.map(t => ({
            locale: t.locale,
            institution: t.institution,
            degree: t.degree,
          })),
        },
      },
      include: { translations: true },
    });
    await this.revalidation.trigger('portfolio');
    return result;
  }

  async deleteEducation(id: number): Promise<void> {
    const existing = await this.prisma.education.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Education not found');
    await this.prisma.education.delete({ where: { id } });
    await this.revalidation.trigger('portfolio');
  }
}
