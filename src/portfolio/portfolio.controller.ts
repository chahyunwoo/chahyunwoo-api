import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@Controller('api/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Public()
  @Get('experiences')
  getExperiences() {
    return this.portfolioService.getExperiences();
  }

  @Public()
  @Get('projects')
  @ApiQuery({ name: 'featured', required: false, type: Boolean })
  getProjects(@Query('featured') featured?: string) {
    return this.portfolioService.getProjects(featured === 'true');
  }

  @Public()
  @Get('skills')
  getSkills() {
    return this.portfolioService.getSkills();
  }

  @Public()
  @Get('education')
  getEducation() {
    return this.portfolioService.getEducation();
  }
}
