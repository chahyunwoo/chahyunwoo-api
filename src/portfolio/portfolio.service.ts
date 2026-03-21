import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortfolioService {
  constructor(private readonly prisma: PrismaService) {}

  async getExperiences() {
    return this.prisma.experience.findMany({
      include: { projects: { orderBy: { displayOrder: 'asc' } } },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getProjects(featuredOnly = false) {
    return this.prisma.project.findMany({
      where: featuredOnly ? { isFeatured: true } : undefined,
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getSkills() {
    return this.prisma.skill.findMany({
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  async getEducation() {
    return this.prisma.education.findMany({
      orderBy: { displayOrder: 'asc' },
    });
  }
}
