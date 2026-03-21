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
  ApiBadRequest,
  ApiConflict,
  ApiNotFound,
  ApiUnauthorized,
} from '../common/swagger/error-responses';
import {
  CreateEducationDto,
  CreateExperienceDto,
  CreateLocaleDto,
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
  @Get('locales')
  getLocales() {
    return this.portfolioService.getLocales();
  }

  @Public()
  @Get('profile')
  @ApiNotFound('Profile')
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
  @Post('locales')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  @ApiConflict('Locale already exists')
  createLocale(@Body() dto: CreateLocaleDto) {
    return this.portfolioService.createLocale(dto);
  }

  @ApiBearerAuth()
  @Delete('locales/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Locale')
  deleteLocale(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteLocale(id);
  }

  @ApiBearerAuth()
  @Put('profile')
  @ApiUnauthorized()
  updateProfile(@Body() dto: UpdateProfileDto) {
    return this.portfolioService.updateProfile(dto);
  }

  @ApiBearerAuth()
  @Post('experiences')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createExperience(@Body() dto: CreateExperienceDto) {
    return this.portfolioService.createExperience(dto);
  }

  @ApiBearerAuth()
  @Put('experiences/:id')
  @ApiUnauthorized()
  @ApiNotFound('Experience')
  updateExperience(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExperienceDto) {
    return this.portfolioService.updateExperience(id, dto);
  }

  @ApiBearerAuth()
  @Delete('experiences/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Experience')
  deleteExperience(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteExperience(id);
  }

  @ApiBearerAuth()
  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createProject(@Body() dto: CreateProjectDto) {
    return this.portfolioService.createProject(dto);
  }

  @ApiBearerAuth()
  @Put('projects/:id')
  @ApiUnauthorized()
  @ApiNotFound('Project')
  updateProject(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProjectDto) {
    return this.portfolioService.updateProject(id, dto);
  }

  @ApiBearerAuth()
  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Project')
  deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteProject(id);
  }

  @ApiBearerAuth()
  @Post('skills')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createSkill(@Body() dto: CreateSkillDto) {
    return this.portfolioService.createSkill(dto);
  }

  @ApiBearerAuth()
  @Put('skills/:id')
  @ApiUnauthorized()
  @ApiNotFound('Skill')
  updateSkill(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSkillDto) {
    return this.portfolioService.updateSkill(id, dto);
  }

  @ApiBearerAuth()
  @Delete('skills/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Skill')
  deleteSkill(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteSkill(id);
  }

  @ApiBearerAuth()
  @Post('education')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createEducation(@Body() dto: CreateEducationDto) {
    return this.portfolioService.createEducation(dto);
  }

  @ApiBearerAuth()
  @Put('education/:id')
  @ApiUnauthorized()
  @ApiNotFound('Education')
  updateEducation(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEducationDto) {
    return this.portfolioService.updateEducation(id, dto);
  }

  @ApiBearerAuth()
  @Delete('education/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Education')
  deleteEducation(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteEducation(id);
  }
}
