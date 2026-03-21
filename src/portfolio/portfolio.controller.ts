import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import {
  CreateEducationDto,
  CreateExperienceDto,
  CreateProjectDto,
  CreateSkillDto,
  GetProjectsQueryDto,
  LocaleQueryDto,
  UpdateEducationDto,
  UpdateExperienceDto,
  UpdateProfileDto,
  UpdateProjectDto,
  UpdateSkillDto,
} from './dto';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@Controller('api/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  // ─── Public ─────────────────────────────────────────────────────────────────

  @Public()
  @Get('profile')
  getProfile(@Query() query: LocaleQueryDto) {
    return this.portfolioService.getProfile(query.locale ?? 'ko');
  }

  @Public()
  @Get('experiences')
  getExperiences(@Query() query: LocaleQueryDto) {
    return this.portfolioService.getExperiences(query.locale ?? 'ko');
  }

  @Public()
  @Get('projects')
  getProjects(@Query() query: GetProjectsQueryDto) {
    return this.portfolioService.getProjects(query.locale ?? 'ko', query.featured);
  }

  @Public()
  @Get('skills')
  getSkills() {
    return this.portfolioService.getSkills();
  }

  @Public()
  @Get('education')
  getEducation(@Query() query: LocaleQueryDto) {
    return this.portfolioService.getEducation(query.locale ?? 'ko');
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Put('profile')
  updateProfile(@Body() dto: UpdateProfileDto) {
    return this.portfolioService.updateProfile(dto);
  }

  @ApiBearerAuth()
  @Post('experiences')
  @HttpCode(HttpStatus.CREATED)
  createExperience(@Body() dto: CreateExperienceDto) {
    return this.portfolioService.createExperience(dto);
  }

  @ApiBearerAuth()
  @Put('experiences/:id')
  updateExperience(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExperienceDto) {
    return this.portfolioService.updateExperience(id, dto);
  }

  @ApiBearerAuth()
  @Delete('experiences/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteExperience(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteExperience(id);
  }

  @ApiBearerAuth()
  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  createProject(@Body() dto: CreateProjectDto) {
    return this.portfolioService.createProject(dto);
  }

  @ApiBearerAuth()
  @Put('projects/:id')
  updateProject(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProjectDto) {
    return this.portfolioService.updateProject(id, dto);
  }

  @ApiBearerAuth()
  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteProject(id);
  }

  @ApiBearerAuth()
  @Post('skills')
  @HttpCode(HttpStatus.CREATED)
  createSkill(@Body() dto: CreateSkillDto) {
    return this.portfolioService.createSkill(dto);
  }

  @ApiBearerAuth()
  @Put('skills/:id')
  updateSkill(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSkillDto) {
    return this.portfolioService.updateSkill(id, dto);
  }

  @ApiBearerAuth()
  @Delete('skills/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSkill(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteSkill(id);
  }

  @ApiBearerAuth()
  @Post('education')
  @HttpCode(HttpStatus.CREATED)
  createEducation(@Body() dto: CreateEducationDto) {
    return this.portfolioService.createEducation(dto);
  }

  @ApiBearerAuth()
  @Put('education/:id')
  updateEducation(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEducationDto) {
    return this.portfolioService.updateEducation(id, dto);
  }

  @ApiBearerAuth()
  @Delete('education/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEducation(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteEducation(id);
  }
}
