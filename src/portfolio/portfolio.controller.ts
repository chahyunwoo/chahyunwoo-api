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
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import {
  ApiBadRequest,
  ApiConflict,
  ApiNoContent,
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
import {
  ContactMessageDto,
  ContactResultDto,
  EducationDto,
  EducationRecordDto,
  ExperienceDto,
  ExperienceRecordDto,
  LocaleDto,
  ProfileDto,
  ProfileWithTranslationsDto,
  ProjectDto,
  ProjectRecordDto,
  SkillGroupDto,
  SkillRecordDto,
  UploadUrlResponseDto,
  WorkDetailDto,
  WorkDto,
  WorkRecordDto,
} from './dto/portfolio-response.dto';
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
  @ApiOkResponse({ type: [LocaleDto] })
  getLocales() {
    return this.portfolioService.getLocales();
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('profile')
  @ApiOkResponse({ type: ProfileDto })
  @ApiNotFound('Profile')
  @ApiBadRequest('Unsupported locale')
  getProfile(@Query(ValidateLocalePipe) query: LocaleQueryDto) {
    return this.portfolioService.getProfile(query.locale ?? 'ko');
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('profile/all')
  @ApiOkResponse({ type: ProfileWithTranslationsDto })
  @ApiNotFound('Profile')
  getProfileWithTranslations() {
    return this.portfolioService.getProfileWithTranslations();
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('experiences')
  @ApiOkResponse({ type: [ExperienceDto] })
  @ApiBadRequest('Unsupported locale')
  getExperiences(@Query(ValidateLocalePipe) query: LocaleQueryDto) {
    return this.portfolioService.getExperiences(query.locale ?? 'ko');
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('projects')
  @ApiOkResponse({ type: [ProjectDto] })
  @ApiBadRequest('Unsupported locale')
  getProjects(@Query(ValidateLocalePipe) query: GetProjectsQueryDto) {
    return this.portfolioService.getProjects(query.locale ?? 'ko', query.featured);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('skills')
  @ApiOkResponse({ type: [SkillGroupDto] })
  getSkills() {
    return this.portfolioService.getSkills();
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('works')
  @ApiOkResponse({ type: [WorkDto] })
  @ApiBadRequest('Unsupported locale')
  getWorks(@Query(ValidateLocalePipe) query: GetWorksQueryDto) {
    return this.portfolioService.getWorks(query.locale ?? 'ko', query.type);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('works/:id')
  @ApiOkResponse({ type: WorkDetailDto })
  @ApiNotFound('Work')
  getWorkById(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.getWorkById(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('experiences/:id')
  @ApiOkResponse({ type: ExperienceRecordDto })
  @ApiNotFound('Experience')
  getExperienceById(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.getExperienceById(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('projects/:id')
  @ApiOkResponse({ type: ProjectRecordDto })
  @ApiNotFound('Project')
  getProjectById(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.getProjectById(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('education/:id')
  @ApiOkResponse({ type: EducationRecordDto })
  @ApiNotFound('Education')
  getEducationById(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.getEducationById(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('education')
  @ApiOkResponse({ type: [EducationDto] })
  @ApiBadRequest('Unsupported locale')
  getEducation(@Query(ValidateLocalePipe) query: LocaleQueryDto) {
    return this.portfolioService.getEducation(query.locale ?? 'ko');
  }

  // ─── Admin ──────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('locales')
  @ApiCreatedResponse({ type: LocaleDto })
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
  @ApiNoContent()
  @ApiUnauthorized()
  @ApiNotFound('Locale')
  deleteLocale(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteLocale(id);
  }

  /**
   * 응답 타입은 `ProfileDto`다 — `ProfileWithTranslationsDto`가 아니다.
   *
   * 서비스가 `getProfile(DEFAULT_LOCALE)`를 돌려주므로 실제 응답에는
   * `jobTitle`/`introduction`이 있고 `translations`는 **없다**. 예전에는
   * `ProfileWithTranslationsDto`로 선언돼 있어 스펙이 거짓말을 하고 있었다.
   *
   * 지금 프론트가 안 깨지는 이유는 이 라우트만 생성 타입을 쓰지 않고 손으로
   * 타이핑해 뒀기 때문이다(admin `portfolio.queries.ts`의 `PortfolioProfile`).
   * 그 손 타이핑이 런타임과 일치해서 가려져 있었고, 생성 타입으로 옮기는
   * 순간 컴파일은 통과하는데 런타임에 `translations`가 undefined가 됐을 것이다.
   */
  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('profile')
  @ApiOkResponse({ type: ProfileDto })
  @ApiUnauthorized()
  updateProfile(@Body() dto: UpdateProfileDto) {
    return this.portfolioService.updateProfile(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('profile/image')
  @ApiCreatedResponse({ type: UploadUrlResponseDto })
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
  @ApiCreatedResponse({ type: UploadUrlResponseDto })
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
  @ApiCreatedResponse({ type: ExperienceRecordDto })
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createExperience(@Body() dto: CreateExperienceDto) {
    return this.portfolioService.createExperience(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('experiences/:id')
  @ApiOkResponse({ type: ExperienceRecordDto })
  @ApiUnauthorized()
  @ApiNotFound('Experience')
  updateExperience(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExperienceDto) {
    return this.portfolioService.updateExperience(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('experiences/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiUnauthorized()
  @ApiNotFound('Experience')
  deleteExperience(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteExperience(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('projects')
  @ApiCreatedResponse({ type: ProjectRecordDto })
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createProject(@Body() dto: CreateProjectDto) {
    return this.portfolioService.createProject(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('projects/:id')
  @ApiOkResponse({ type: ProjectRecordDto })
  @ApiUnauthorized()
  @ApiNotFound('Project')
  updateProject(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProjectDto) {
    return this.portfolioService.updateProject(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiUnauthorized()
  @ApiNotFound('Project')
  deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteProject(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('skills')
  @ApiCreatedResponse({ type: SkillRecordDto })
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createSkill(@Body() dto: CreateSkillDto) {
    return this.portfolioService.createSkill(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('skills/:id')
  @ApiOkResponse({ type: SkillRecordDto })
  @ApiUnauthorized()
  @ApiNotFound('Skill')
  updateSkill(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSkillDto) {
    return this.portfolioService.updateSkill(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('skills/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiUnauthorized()
  @ApiNotFound('Skill')
  deleteSkill(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteSkill(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('education')
  @ApiCreatedResponse({ type: EducationRecordDto })
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createEducation(@Body() dto: CreateEducationDto) {
    return this.portfolioService.createEducation(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('education/:id')
  @ApiOkResponse({ type: EducationRecordDto })
  @ApiUnauthorized()
  @ApiNotFound('Education')
  updateEducation(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEducationDto) {
    return this.portfolioService.updateEducation(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('education/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiUnauthorized()
  @ApiNotFound('Education')
  deleteEducation(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteEducation(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('works')
  @ApiCreatedResponse({ type: WorkRecordDto })
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  createWork(@Body() dto: CreateWorkDto) {
    return this.portfolioService.createWork(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('works/:id')
  @ApiOkResponse({ type: WorkRecordDto })
  @ApiUnauthorized()
  @ApiNotFound('Work')
  updateWork(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkDto) {
    return this.portfolioService.updateWork(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('works/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiUnauthorized()
  @ApiNotFound('Work')
  deleteWork(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteWork(id);
  }

  // ─── Contact ───────────────────────────────────────────────────────────────

  @Public()
  @ApiSecurity('api-key')
  @Post('contact')
  @ApiCreatedResponse({ type: ContactResultDto })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @ApiBadRequest()
  createContact(@Body() dto: CreateContactDto) {
    return this.portfolioService.createContact(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Get('contacts')
  @ApiOkResponse({ type: [ContactMessageDto] })
  @ApiUnauthorized()
  getContacts(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.portfolioService.getContacts(limit);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('contacts/:id/read')
  @ApiOkResponse({ type: ContactMessageDto })
  @ApiUnauthorized()
  @ApiNotFound('Contact message')
  markContactRead(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.markContactRead(id);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('contacts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiUnauthorized()
  @ApiNotFound('Contact message')
  deleteContact(@Param('id', ParseIntPipe) id: number) {
    return this.portfolioService.deleteContact(id);
  }
}
