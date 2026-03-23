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
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiCookieAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import {
  ApiBadRequest,
  ApiConflict,
  ApiNotFound,
  ApiUnauthorized,
} from '../common/swagger/error-responses';
import { safeExtension, validateAndReadFile } from '../common/utils/file-validation.util';
import type { MultipartRequest } from '../types/fastify.d';
import {
  CreateContactDto,
  CreateEducationDto,
  CreateExperienceDto,
  CreateLocaleDto,
  CreateProjectDto,
  CreateSkillDto,
  CreateWorkDto,
  GetProjectsQueryDto,
  GetWorksQueryDto,
  LocaleQueryDto,
  UpdateEducationDto,
  UpdateExperienceDto,
  UpdateProfileDto,
  UpdateProjectDto,
  UpdateSkillDto,
  UpdateWorkDto,
} from './dto';
import { ValidateLocalePipe } from './pipes/validate-locale.pipe';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@Controller('api/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  // ─── Public ─────────────────────────────────────────────────────────────────

  @Public()
  @ApiSecurity('api-key')
  @Get('locales')
  getLocales() {
    return this.portfolioService.getLocales();
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('profile')
  @ApiNotFound('Profile')
  @ApiBadRequest('Unsupported locale')
  getProfile(@Query(ValidateLocalePipe) query: LocaleQueryDto) {
    return this.portfolioService.getProfile(query.locale ?? 'ko');
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('profile/all')
  @ApiNotFound('Profile')
  getProfileWithTranslations() {
    return this.portfolioService.getProfileWithTranslations();
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('experiences')
  @ApiBadRequest('Unsupported locale')
  getExperiences(@Query(ValidateLocalePipe) query: LocaleQueryDto) {
    return this.portfolioService.getExperiences(query.locale ?? 'ko');
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('projects')
  @ApiBadRequest('Unsupported locale')
  getProjects(@Query(ValidateLocalePipe) query: GetProjectsQueryDto) {
    return this.portfolioService.getProjects(query.locale ?? 'ko', query.featured);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('skills')
  getSkills() {
    return this.portfolioService.getSkills();
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('works')
  @ApiBadRequest('Unsupported locale')
  getWorks(@Query(ValidateLocalePipe) query: GetWorksQueryDto) {
    return this.portfolioService.getWorks(query.locale ?? 'ko', query.type);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('works/:id')
  @ApiNotFound('Work')
  getWorkById(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.getWorkById(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('experiences/:id')
  @ApiNotFound('Experience')
  getExperienceById(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.getExperienceById(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('projects/:id')
  @ApiNotFound('Project')
  getProjectById(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.getProjectById(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('education/:id')
  @ApiNotFound('Education')
  getEducationById(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.getEducationById(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('education')
  @ApiBadRequest('Unsupported locale')
  getEducation(@Query(ValidateLocalePipe) query: LocaleQueryDto) {
    return this.portfolioService.getEducation(query.locale ?? 'ko');
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('locales')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  @ApiConflict('Locale already exists')
  createLocale(@Body() dto: CreateLocaleDto) {
    return this.portfolioService.createLocale(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('locales/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Locale')
  deleteLocale(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteLocale(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('profile')
  @ApiUnauthorized()
  updateProfile(@Body() dto: UpdateProfileDto) {
    return this.portfolioService.updateProfile(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('profile/image')
  @ApiConsumes('multipart/form-data')
  @ApiUnauthorized()
  @ApiBadRequest('No file provided or invalid file type')
  async uploadProfileImage(@Req() request: MultipartRequest) {
    const { buffer, mimeType } = await validateAndReadFile(request);
    return this.portfolioService.uploadProfileImage(
      buffer,
      `image${safeExtension(mimeType)}`,
      mimeType,
    );
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('profile/icon')
  @ApiConsumes('multipart/form-data')
  @ApiUnauthorized()
  @ApiBadRequest('No file provided or invalid file type')
  async uploadProfileIcon(@Req() request: MultipartRequest) {
    const { buffer, mimeType } = await validateAndReadFile(request);
    return this.portfolioService.uploadProfileIcon(
      buffer,
      `icon${safeExtension(mimeType)}`,
      mimeType,
    );
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('experiences')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createExperience(@Body() dto: CreateExperienceDto) {
    return this.portfolioService.createExperience(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('experiences/:id')
  @ApiUnauthorized()
  @ApiNotFound('Experience')
  updateExperience(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExperienceDto) {
    return this.portfolioService.updateExperience(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('experiences/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Experience')
  deleteExperience(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteExperience(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('projects')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createProject(@Body() dto: CreateProjectDto) {
    return this.portfolioService.createProject(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('projects/:id')
  @ApiUnauthorized()
  @ApiNotFound('Project')
  updateProject(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProjectDto) {
    return this.portfolioService.updateProject(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Project')
  deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteProject(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('skills')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createSkill(@Body() dto: CreateSkillDto) {
    return this.portfolioService.createSkill(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('skills/:id')
  @ApiUnauthorized()
  @ApiNotFound('Skill')
  updateSkill(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSkillDto) {
    return this.portfolioService.updateSkill(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('skills/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Skill')
  deleteSkill(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteSkill(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('education')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createEducation(@Body() dto: CreateEducationDto) {
    return this.portfolioService.createEducation(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('education/:id')
  @ApiUnauthorized()
  @ApiNotFound('Education')
  updateEducation(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEducationDto) {
    return this.portfolioService.updateEducation(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('education/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Education')
  deleteEducation(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteEducation(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('works')
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createWork(@Body() dto: CreateWorkDto) {
    return this.portfolioService.createWork(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('works/:id')
  @ApiUnauthorized()
  @ApiNotFound('Work')
  updateWork(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkDto) {
    return this.portfolioService.updateWork(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('works/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Work')
  deleteWork(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteWork(id);
  }

  // ─── Contact ───────────────────────────────────────────────────────────────

  @Public()
  @ApiSecurity('api-key')
  @Post('contact')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @ApiBadRequest()
  createContact(@Body() dto: CreateContactDto) {
    return this.portfolioService.createContact(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('contacts')
  @ApiUnauthorized()
  getContacts(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.portfolioService.getContacts(limit);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('contacts/:id/read')
  @ApiUnauthorized()
  @ApiNotFound('Contact message')
  markContactRead(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.markContactRead(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('contacts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Contact message')
  deleteContact(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteContact(id);
  }
}
