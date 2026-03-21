import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import type {
  CreateEducationDto,
  CreateExperienceDto,
  CreateProjectDto,
  CreateSkillDto,
  UpdateEducationDto,
  UpdateExperienceDto,
  UpdateProfileDto,
  UpdateProjectDto,
  UpdateSkillDto,
} from './dto';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidation: RevalidationService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private handleNotFound(error: unknown, entity: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundException(`${entity} not found`);
    }
    throw error;
  }

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
          socialLinks: (dto.socialLinks ?? undefined) as unknown as Prisma.InputJsonValue,
        },
      });
    } else {
      profile = await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.location !== undefined && { location: dto.location }),
          ...(dto.socialLinks !== undefined && {
            socialLinks: dto.socialLinks as unknown as Prisma.InputJsonValue,
          }),
        },
      });
    }

    if (dto.translations?.length) {
      await Promise.all(
        dto.translations.map(t =>
          this.prisma.profileTranslation.upsert({
            where: { profileId_locale: { profileId: profile.id, locale: t.locale } },
            create: {
              profileId: profile.id,
              locale: t.locale,
              jobTitle: t.jobTitle,
              introduction: t.introduction,
            },
            update: { jobTitle: t.jobTitle, introduction: t.introduction },
          }),
        ),
      );
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

  async updateExperience(id: number, dto: UpdateExperienceDto) {
    try {
      const result = await this.prisma.experience.update({
        where: { id },
        data: {
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.startDate !== undefined && { startDate: dto.startDate }),
          ...(dto.endDate !== undefined && { endDate: dto.endDate }),
          ...(dto.isCurrent !== undefined && { isCurrent: dto.isCurrent }),
          ...(dto.translations && {
            translations: {
              deleteMany: {},
              create: dto.translations.map(t => ({
                locale: t.locale,
                title: t.title,
                role: t.role,
                responsibilities: t.responsibilities,
              })),
            },
          }),
        },
        include: { translations: true },
      });
      await this.revalidation.trigger('portfolio');
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Experience');
    }
  }

  async deleteExperience(id: number): Promise<void> {
    try {
      await this.prisma.experience.delete({ where: { id } });
      await this.revalidation.trigger('portfolio');
    } catch (error) {
      this.handleNotFound(error, 'Experience');
    }
  }

  // ─── Projects ───────────────────────────────────────────────────────────────

  async getProjects(locale: string, featured?: boolean) {
    const projects = await this.prisma.project.findMany({
      where: featured !== undefined ? { featured } : undefined,
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

  async updateProject(id: number, dto: UpdateProjectDto) {
    try {
      const result = await this.prisma.project.update({
        where: { id },
        data: {
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.demoUrl !== undefined && { demoUrl: dto.demoUrl }),
          ...(dto.repoUrl !== undefined && { repoUrl: dto.repoUrl }),
          ...(dto.techStack !== undefined && { techStack: dto.techStack }),
          ...(dto.featured !== undefined && { featured: dto.featured }),
          ...(dto.translations && {
            translations: {
              deleteMany: {},
              create: dto.translations.map(t => ({
                locale: t.locale,
                title: t.title,
                description: t.description,
              })),
            },
          }),
        },
        include: { translations: true },
      });
      await this.revalidation.trigger('portfolio');
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Project');
    }
  }

  async deleteProject(id: number): Promise<void> {
    try {
      await this.prisma.project.delete({ where: { id } });
      await this.revalidation.trigger('portfolio');
    } catch (error) {
      this.handleNotFound(error, 'Project');
    }
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

  async updateSkill(id: number, dto: UpdateSkillDto) {
    try {
      const result = await this.prisma.skill.update({
        where: { id },
        data: {
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
      });
      await this.revalidation.trigger('portfolio');
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Skill');
    }
  }

  async deleteSkill(id: number): Promise<void> {
    try {
      await this.prisma.skill.delete({ where: { id } });
      await this.revalidation.trigger('portfolio');
    } catch (error) {
      this.handleNotFound(error, 'Skill');
    }
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

  async updateEducation(id: number, dto: UpdateEducationDto) {
    try {
      const result = await this.prisma.education.update({
        where: { id },
        data: {
          ...(dto.period !== undefined && { period: dto.period }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.translations && {
            translations: {
              deleteMany: {},
              create: dto.translations.map(t => ({
                locale: t.locale,
                institution: t.institution,
                degree: t.degree,
              })),
            },
          }),
        },
        include: { translations: true },
      });
      await this.revalidation.trigger('portfolio');
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Education');
    }
  }

  async deleteEducation(id: number): Promise<void> {
    try {
      await this.prisma.education.delete({ where: { id } });
      await this.revalidation.trigger('portfolio');
    } catch (error) {
      this.handleNotFound(error, 'Education');
    }
  }
}
