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
import { AuthService } from '../auth/auth.service';
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

  @Public()
  @ApiSecurity('api-key')
  @Get('posts/:slug/preview')
  @ApiOkResponse({ type: PostDetailDto })
  @ApiNotFound('Post')
  @ApiUnauthorized()
  async findOnePreview(@Param('slug') slug: string, @Query('token') token: string) {
    if (!token || !this.authService.verifyPreviewToken(token)) {
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

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('posts')
  @ApiCreatedResponse({ type: PostDetailDto })
  @HttpCode(HttpStatus.CREATED)
  @ApiUnauthorized()
  @ApiBadRequest()
  @ApiConflict('Slug already exists')
  create(@Body() dto: CreatePostDto) {
    return this.blogService.create(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
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

  @ApiBearerAuth()
  @ApiCookieAuth()
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
