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
  UnauthorizedException,
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
import { AuthService } from '../auth/auth.service';
import { MachineKey } from '../common/decorators/machine-key.decorator';
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
import { BlogService } from './blog.service';
import {
  CategoryDto,
  CategoryWithTagsDto,
  PostDetailDto,
  PostSearchResponseDto,
  RelatedPostsResponseDto,
  TagListResponseDto,
  UploadImageResponseDto,
} from './dto/blog-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostListResponseDto, PostSummaryDto } from './dto/post-list-response.dto';
import { PostQueryDto, RecentQueryDto, SearchQueryDto, TagQueryDto } from './dto/post-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@ApiTags('blog')
@Controller('api/blog')
export class BlogController {
  constructor(
    private readonly blogService: BlogService,
    private readonly authService: AuthService,
  ) {}

  @Public()
  @ApiSecurity('api-key')
  @Get('posts/search')
  @ApiOkResponse({ type: PostSearchResponseDto })
  @ApiBadRequest('q must be at least 2 characters')
  search(@Query() query: SearchQueryDto) {
    return this.blogService.search(query);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('posts')
  @ApiOkResponse({ type: PostListResponseDto })
  findAll(@Query() query: PostQueryDto, @Req() req: MultipartRequest) {
    const isAdmin = this.authService.isAuthenticated(req.cookies?.access_token);
    return this.blogService.findAll(query, isAdmin);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('posts/recent')
  @ApiOkResponse({ type: [PostSummaryDto] })
  getRecentPosts(@Query() query: RecentQueryDto) {
    return this.blogService.getRecentPosts(query.limit);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('categories')
  @ApiOkResponse({ type: [CategoryWithTagsDto] })
  getCategories() {
    return this.blogService.getCategories();
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('categories')
  @ApiCreatedResponse({ type: CategoryDto })
  @HttpCode(HttpStatus.CREATED)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.blogService.createCategory(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('categories/:id')
  @ApiOkResponse({ type: CategoryDto })
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCategoryDto) {
    return this.blogService.updateCategory(id, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.blogService.deleteCategory(id);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('tags')
  @ApiOkResponse({ type: TagListResponseDto })
  getTags(@Query() query: TagQueryDto) {
    return this.blogService.getTags(query);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('posts/:slug')
  @ApiOkResponse({ type: PostDetailDto })
  @ApiNotFound('Post')
  findOne(@Param('slug') slug: string, @Req() req: MultipartRequest) {
    const isAdmin = this.authService.isAuthenticated(req.cookies?.access_token);
    return this.blogService.findBySlug(slug, isAdmin);
  }

  /**
   * 미발행 글 미리보기.
   *
   * 이 라우트는 `findBySlug(slug, isAdmin = true)`를 불러 `published` 검사를
   * 건너뛴다. 즉 유효한 토큰 하나면 **임의의 slug**로 미발행 글을 읽을 수 있다.
   * 토큰은 어드민 화면 진입 시점에 slug 없이 발급되므로(프론트가 글을 저장하기
   * 전에 미리 받는다) 특정 글에 묶을 수가 없다.
   *
   * 그래서 최소한 **전수 대입은 막는다.** 스로틀이 없으면 토큰이 URL·Referer로
   * 한 번 새는 순간 30분 동안 slug를 무제한 대입해 미발행 글을 전부 긁어낼 수
   * 있다. 분당 10회면 정상적인 미리보기(한 글을 열고 새로고침 몇 번)에는
   * 걸리지 않으면서 대입 속도는 실효적으로 죽인다.
   */
  @Public()
  @ApiSecurity('api-key')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('posts/:slug/preview')
  @ApiOkResponse({ type: PostDetailDto })
  @ApiNotFound('Post')
  @ApiUnauthorized()
  async findOnePreview(@Param('slug') slug: string, @Query('token') token: string) {
    // slug 를 함께 넘겨 "이 글에 대해 발급된 토큰인가"까지 확인한다.
    // 넘기지 않으면 토큰 하나로 모든 비공개 글이 열린다.
    if (!token || !(await this.authService.verifyPreviewToken(token, slug))) {
      throw new UnauthorizedException('Invalid or expired preview token');
    }
    return this.blogService.findBySlug(slug, true);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('posts/:slug/related')
  @ApiOkResponse({ type: RelatedPostsResponseDto })
  @ApiNotFound('Post')
  getRelatedPosts(@Param('slug') slug: string) {
    return this.blogService.getRelatedPosts(slug);
  }

  // 무인 발행: 파이프라인 스케줄러가 x-machine-key 로 부른다.
  // 어드민 JWT 경로도 그대로 열려 있다 — 인증 수단이 하나 늘어난 것이다.
  // 3주에 1회 도는 작업이라 스로틀을 아주 낮게 잡아도 충분하다.
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiSecurity('machine-key')
  @MachineKey()
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  @Post('posts')
  @ApiCreatedResponse({ type: PostDetailDto })
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  @ApiConflict('Slug already exists')
  create(@Body() dto: CreatePostDto) {
    return this.blogService.create(dto);
  }

  // 무인 발행: 파이프라인이 자기가 발행한 글을 고친다. 이게 없으면 운영 DB 를
  // 직접 UPDATE 하게 된다(실제로 그런 일이 있었다) — 그러면 파이프라인이 DB
  // 스키마에 의존하고, 이미지 확정·재검증 같은 서버 처리를 통째로 우회한다.
  //
  // DELETE 는 열지 않는다. 지우는 것은 사람이 판단할 일이다.
  //
  // 전체 교체가 아니라 **부분 갱신**이라 안전하다. UpdatePostDto 는
  // PartialType 이고 service.update() 가 `dto.X !== undefined` 로 보낸 필드만
  // 갱신하므로, 파이프라인이 title 만 보내도 publishedAt·viewCount 는 남는다.
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiSecurity('machine-key')
  @MachineKey()
  @Throttle({ default: { ttl: 3_600_000, limit: 20 } })
  @Put('posts/:slug')
  @ApiOkResponse({ type: PostDetailDto })
  @ApiUnauthorized()
  @ApiNotFound('Post')
  update(@Param('slug') slug: string, @Body() dto: UpdatePostDto) {
    return this.blogService.update(slug, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('posts/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiUnauthorized()
  @ApiNotFound('Post')
  remove(@Param('slug') slug: string) {
    return this.blogService.remove(slug);
  }

  // 무인 발행: 썸네일·본문 이미지를 올린다. 파이프라인은 R2 자격증명을
  // 갖지 않고 이 엔드포인트를 통한다.
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiSecurity('machine-key')
  @MachineKey()
  @Throttle({ default: { ttl: 3_600_000, limit: 40 } })
  @Post('images')
  @ApiCreatedResponse({ type: UploadImageResponseDto })
  @ApiConsumes('multipart/form-data')
  @ApiUnauthorized()
  @ApiBadRequest('No file provided or invalid file type')
  async uploadImage(@Req() request: MultipartRequest) {
    const { buffer, mimeType } = await validateAndReadFile(request);
    return this.blogService.uploadTempImage(buffer, `image${safeExtension(mimeType)}`, mimeType);
  }
}
