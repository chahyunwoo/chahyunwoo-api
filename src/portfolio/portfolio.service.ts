import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MailService } from '../common/mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { StorageService } from '../storage/storage.service';
import { type CacheStore, NamespacedCache } from '../types/cache-store';
import type {
  CreateContactDto,
  CreateEducationDto,
  CreateExperienceDto,
  CreateLocaleDto,
  CreateProjectDto,
  CreateSkillDto,
  CreateWorkDto,
  UpdateEducationDto,
  UpdateExperienceDto,
  UpdateProfileDto,
  UpdateProjectDto,
  UpdateSkillDto,
  UpdateWorkDto,
} from './dto';
import { ValidateLocalePipe } from './pipes/validate-locale.pipe';
import { DEFAULT_LOCALE, PORTFOLIO_CACHE_PREFIX, PORTFOLIO_CACHE_TTL } from './portfolio.constants';
import { generateGradientColors } from './portfolio.utils';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidation: RevalidationService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly localePipe: ValidateLocalePipe,
    @Inject(CACHE_MANAGER) rawCache: CacheStore,
  ) {
    this.cache = new NamespacedCache(rawCache, PORTFOLIO_CACHE_PREFIX);
  }

  private readonly logger = new Logger(PortfolioService.name);
  private readonly cache: NamespacedCache;

  // ─── Locales ────────────────────────────────────────────────────────────────

  async getLocales() {
    return this.prisma.locale.findMany({ orderBy: { id: 'asc' } });
  }

  async createLocale(dto: CreateLocaleDto) {
    try {
      const result = await this.prisma.locale.create({
        data: { code: dto.code, label: dto.label },
      });
      this.localePipe.invalidateCache();
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Locale already exists');
      }
      throw error;
    }
  }

  async deleteLocale(id: number): Promise<void> {
    try {
      await this.prisma.locale.delete({ where: { id } });
      this.localePipe.invalidateCache();
    } catch (error) {
      this.handleNotFound(error, 'Locale');
    }
  }

  private handleNotFound(error: unknown, entity: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundException(`${entity} not found`);
    }
    throw error;
  }

  // ─── Profile ────────────────────────────────────────────────────────────────

  async getProfile(locale: string) {
    const key = `profile:${locale}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const profile = await this.prisma.profile.findFirst({
      orderBy: { id: 'asc' },
      include: { translations: { where: { locale } } },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    const t = profile.translations[0];
    const result = {
      name: profile.name,
      location: profile.location,
      imageUrl: profile.imageUrl,
      iconUrl: profile.iconUrl,
      socialLinks: profile.socialLinks,
      jobTitle: t?.jobTitle ?? '',
      introduction: t?.introduction ?? [],
    };

    await this.cache.set(key, result, PORTFOLIO_CACHE_TTL);
    return result;
  }

  async updateProfile(dto: UpdateProfileDto) {
    let profile = await this.prisma.profile.findFirst({ orderBy: { id: 'asc' } });

    if (!profile) {
      profile = await this.prisma.profile.create({
        data: {
          name: dto.name ?? '',
          location: dto.location ?? '',
          imageUrl: dto.imageUrl,
          iconUrl: dto.iconUrl,
          socialLinks: (dto.socialLinks ?? undefined) as unknown as Prisma.InputJsonValue,
        },
      });
    } else {
      const oldImageUrl = dto.imageUrl !== undefined ? profile.imageUrl : null;
      const oldIconUrl = dto.iconUrl !== undefined ? profile.iconUrl : null;

      profile = await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.location !== undefined && { location: dto.location }),
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
          ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
          ...(dto.socialLinks !== undefined && {
            socialLinks: dto.socialLinks as unknown as Prisma.InputJsonValue,
          }),
        },
      });

      // DB 업데이트 성공 후 이전 파일 삭제 (새 URL과 다를 때만)
      if (oldImageUrl && oldImageUrl !== dto.imageUrl) {
        this.storage
          .delete(oldImageUrl)
          .catch(err => this.logger.warn('Old image cleanup failed', err));
      }
      if (oldIconUrl && oldIconUrl !== dto.iconUrl) {
        this.storage
          .delete(oldIconUrl)
          .catch(err => this.logger.warn('Old icon cleanup failed', err));
      }
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

    await this.cache.invalidate();
    this.revalidation
      .trigger('portfolio')
      .catch(err => this.logger.warn('revalidation failed', err));
    return this.getProfile(DEFAULT_LOCALE);
  }

  async getProfileWithTranslations() {
    const key = 'profile:all';
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const profile = await this.prisma.profile.findFirst({
      orderBy: { id: 'asc' },
      include: { translations: true },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    const result = {
      name: profile.name,
      location: profile.location,
      imageUrl: profile.imageUrl,
      iconUrl: profile.iconUrl,
      socialLinks: profile.socialLinks,
      translations: profile.translations.map(t => ({
        locale: t.locale,
        jobTitle: t.jobTitle,
        introduction: t.introduction,
      })),
    };

    await this.cache.set(key, result, PORTFOLIO_CACHE_TTL);
    return result;
  }

  async uploadProfileImage(buffer: Buffer, filename: string, mimeType: string) {
    return { url: await this.storage.upload(buffer, filename, mimeType, 'profile/image') };
  }

  async uploadProfileIcon(buffer: Buffer, filename: string, mimeType: string) {
    return { url: await this.storage.upload(buffer, filename, mimeType, 'profile/icon') };
  }

  // ─── Experiences ────────────────────────────────────────────────────────────

  async getExperiences(locale: string) {
    const key = `experiences:${locale}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const experiences = await this.prisma.experience.findMany({
      include: { translations: { where: { locale } } },
      orderBy: { sortOrder: 'asc' },
    });

    const result = experiences.map(exp => {
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

    await this.cache.set(key, result, PORTFOLIO_CACHE_TTL);
    return result;
  }

  async getExperienceById(id: number) {
    const experience = await this.prisma.experience.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!experience) throw new NotFoundException('Experience not found');
    return experience;
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
    await this.cache.invalidate();
    this.revalidation
      .trigger('portfolio')
      .catch(err => this.logger.warn('revalidation failed', err));
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
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Experience');
    }
  }

  async deleteExperience(id: number): Promise<void> {
    try {
      await this.prisma.experience.delete({ where: { id } });
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
    } catch (error) {
      this.handleNotFound(error, 'Experience');
    }
  }

  // ─── Projects ───────────────────────────────────────────────────────────────

  async getProjects(locale: string, featured?: boolean) {
    const key = `projects:${locale}:${featured ?? 'all'}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const projects = await this.prisma.project.findMany({
      where: featured !== undefined ? { featured } : undefined,
      include: { translations: { where: { locale } } },
      orderBy: { sortOrder: 'asc' },
    });

    const result = projects.map(proj => {
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

    await this.cache.set(key, result, PORTFOLIO_CACHE_TTL);
    return result;
  }

  async getProjectById(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
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
    await this.cache.invalidate();
    this.revalidation
      .trigger('portfolio')
      .catch(err => this.logger.warn('revalidation failed', err));
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
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Project');
    }
  }

  async deleteProject(id: number): Promise<void> {
    try {
      await this.prisma.project.delete({ where: { id } });
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
    } catch (error) {
      this.handleNotFound(error, 'Project');
    }
  }

  // ─── Works ──────────────────────────────────────────────────────────────────

  async getWorks(locale: string, type?: string) {
    const key = `works:${locale}:${type ?? 'all'}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const works = await this.prisma.work.findMany({
      where: type ? { type } : undefined,
      include: { translations: { where: { locale } } },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    const result = works.map(work => {
      const t = work.translations[0];
      return {
        id: work.id,
        type: work.type,
        startDate: work.startDate,
        endDate: work.endDate,
        isCurrent: work.isCurrent,
        techStack: work.techStack,
        demoUrl: work.demoUrl,
        repoUrl: work.repoUrl,
        featured: work.featured,
        gradientColors: generateGradientColors(t?.title ?? '', work.featured),
        title: t?.title ?? '',
        role: t?.role ?? null,
        summary: t?.summary ?? '',
        content: t?.content ?? '',
        highlights: t?.highlights ?? [],
      };
    });

    await this.cache.set(key, result, PORTFOLIO_CACHE_TTL);
    return result;
  }

  async getWorkById(id: number) {
    const work = await this.prisma.work.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!work) throw new NotFoundException('Work not found');

    const t = work.translations.find(tr => tr.locale === DEFAULT_LOCALE) ?? work.translations[0];
    return {
      ...work,
      gradientColors: generateGradientColors(t?.title ?? '', work.featured),
    };
  }

  async createWork(dto: CreateWorkDto) {
    const result = await this.prisma.work.create({
      data: {
        type: dto.type,
        sortOrder: dto.sortOrder ?? 0,
        startDate: dto.startDate,
        endDate: dto.endDate,
        isCurrent: dto.isCurrent ?? false,
        techStack: dto.techStack,
        demoUrl: dto.demoUrl,
        repoUrl: dto.repoUrl,
        featured: dto.featured ?? false,
        translations: {
          create: dto.translations.map(t => ({
            locale: t.locale,
            title: t.title,
            role: t.role,
            summary: t.summary,
            content: t.content,
            highlights: t.highlights ?? [],
          })),
        },
      },
      include: { translations: true },
    });
    await this.cache.invalidate();
    this.revalidation
      .trigger('portfolio')
      .catch(err => this.logger.warn('revalidation failed', err));
    return result;
  }

  async updateWork(id: number, dto: UpdateWorkDto) {
    try {
      const result = await this.prisma.work.update({
        where: { id },
        data: {
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
          ...(dto.startDate !== undefined && { startDate: dto.startDate }),
          ...(dto.endDate !== undefined && { endDate: dto.endDate }),
          ...(dto.isCurrent !== undefined && { isCurrent: dto.isCurrent }),
          ...(dto.techStack !== undefined && { techStack: dto.techStack }),
          ...(dto.demoUrl !== undefined && { demoUrl: dto.demoUrl }),
          ...(dto.repoUrl !== undefined && { repoUrl: dto.repoUrl }),
          ...(dto.featured !== undefined && { featured: dto.featured }),
          ...(dto.translations && {
            translations: {
              deleteMany: {},
              create: dto.translations.map(t => ({
                locale: t.locale,
                title: t.title,
                role: t.role,
                summary: t.summary,
                content: t.content,
                highlights: t.highlights ?? [],
              })),
            },
          }),
        },
        include: { translations: true },
      });
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Work');
    }
  }

  async deleteWork(id: number): Promise<void> {
    try {
      await this.prisma.work.delete({ where: { id } });
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
    } catch (error) {
      this.handleNotFound(error, 'Work');
    }
  }

  // ─── Skills ─────────────────────────────────────────────────────────────────

  async getSkills() {
    const key = 'skills';
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const skills = await this.prisma.skill.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });

    const grouped: Record<
      string,
      { id: number; name: string; proficiency: number; description: string | null }[]
    > = {};
    for (const skill of skills) {
      if (!grouped[skill.category]) grouped[skill.category] = [];
      grouped[skill.category].push({
        id: skill.id,
        name: skill.name,
        proficiency: skill.proficiency,
        description: skill.description,
      });
    }

    const result = Object.entries(grouped).map(([category, items]) => ({ category, items }));

    await this.cache.set(key, result, PORTFOLIO_CACHE_TTL);
    return result;
  }

  async createSkill(dto: CreateSkillDto) {
    const result = await this.prisma.skill.create({
      data: {
        category: dto.category,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        proficiency: dto.proficiency ?? 0,
        description: dto.description,
      },
    });
    await this.cache.invalidate();
    this.revalidation
      .trigger('portfolio')
      .catch(err => this.logger.warn('revalidation failed', err));
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
          ...(dto.proficiency !== undefined && { proficiency: dto.proficiency }),
          ...(dto.description !== undefined && { description: dto.description }),
        },
      });
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Skill');
    }
  }

  async deleteSkill(id: number): Promise<void> {
    try {
      await this.prisma.skill.delete({ where: { id } });
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
    } catch (error) {
      this.handleNotFound(error, 'Skill');
    }
  }

  // ─── Education ──────────────────────────────────────────────────────────────

  async getEducation(locale: string) {
    const key = `education:${locale}`;
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const records = await this.prisma.education.findMany({
      include: { translations: { where: { locale } } },
      orderBy: { sortOrder: 'asc' },
    });

    const result = records.map(edu => {
      const t = edu.translations[0];
      return {
        id: edu.id,
        period: edu.period,
        institution: t?.institution ?? '',
        degree: t?.degree ?? '',
      };
    });

    await this.cache.set(key, result, PORTFOLIO_CACHE_TTL);
    return result;
  }

  async getEducationById(id: number) {
    const education = await this.prisma.education.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!education) throw new NotFoundException('Education not found');
    return education;
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
    await this.cache.invalidate();
    this.revalidation
      .trigger('portfolio')
      .catch(err => this.logger.warn('revalidation failed', err));
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
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
      return result;
    } catch (error) {
      this.handleNotFound(error, 'Education');
    }
  }

  async deleteEducation(id: number): Promise<void> {
    try {
      await this.prisma.education.delete({ where: { id } });
      await this.cache.invalidate();
      this.revalidation
        .trigger('portfolio')
        .catch(err => this.logger.warn('revalidation failed', err));
    } catch (error) {
      this.handleNotFound(error, 'Education');
    }
  }

  // ─── Contact ───────────────────────────────────────────────────────────────

  async createContact(dto: CreateContactDto) {
    try {
      // 동일 이메일 10분 쿨다운
      const recent = await this.prisma.contactMessage.findFirst({
        where: {
          email: dto.email,
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
      });
      if (recent) {
        return { success: true, message: 'Message sent successfully' };
      }

      await this.prisma.contactMessage.create({
        data: {
          name: dto.name,
          email: dto.email,
          subject: dto.subject ?? null,
          message: dto.message,
        },
      });

      this.mail
        .sendContactNotification(dto)
        .catch(err => this.logger.warn('Contact email notification failed', err));

      return { success: true, message: 'Message sent successfully' };
    } catch (error) {
      this.logger.error('Failed to save contact message', error);
      throw new InternalServerErrorException('Failed to send message');
    }
  }

  async getContacts(limit = 20) {
    return this.prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 100),
    });
  }

  async markContactRead(id: number) {
    try {
      return await this.prisma.contactMessage.update({
        where: { id },
        data: { read: true },
      });
    } catch (error) {
      this.handleNotFound(error, 'Contact message');
    }
  }

  async deleteContact(id: number): Promise<void> {
    try {
      await this.prisma.contactMessage.delete({ where: { id } });
    } catch (error) {
      this.handleNotFound(error, 'Contact message');
    }
  }
}
