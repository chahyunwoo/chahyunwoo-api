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
import { ApiBearerAuth, ApiConsumes, ApiCookieAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { Public } from '../common/decorators/public.decorator';
import {
  ApiBadRequest,
  ApiConflict,
  ApiNotFound,
  ApiUnauthorized,
} from '../common/swagger/error-responses';
import { safeExtension, validateAndReadFile } from '../common/utils/file-validation.util';
import type { MultipartRequest } from '../types/fastify.d';
import { BlogService } from './blog.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreatePostDto } from './dto/create-post.dto';
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
  @ApiBadRequest('q must be at least 2 characters')
  search(@Query() query: SearchQueryDto) {
    return this.blogService.search(query);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('posts')
  findAll(@Query() query: PostQueryDto) {
    return this.blogService.findAll(query);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('posts/recent')
  getRecentPosts(@Query() query: RecentQueryDto) {
    return this.blogService.getRecentPosts(query.limit);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('categories')
  getCategories() {
    return this.blogService.getCategories();
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.blogService.createCategory(dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Put('categories/:id')
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
  getTags(@Query() query: TagQueryDto) {
    return this.blogService.getTags(query);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('posts/:slug')
  @ApiNotFound('Post')
  findOne(@Param('slug') slug: string) {
    return this.blogService.findBySlug(slug);
  }

  @Public()
  @ApiSecurity('api-key')
  @Get('posts/:slug/preview')
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
  @ApiNotFound('Post')
  getRelatedPosts(@Param('slug') slug: string) {
    return this.blogService.getRelatedPosts(slug);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('posts')
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
  @ApiUnauthorized()
  @ApiNotFound('Post')
  update(@Param('slug') slug: string, @Body() dto: UpdatePostDto) {
    return this.blogService.update(slug, dto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Delete('posts/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiUnauthorized()
  @ApiNotFound('Post')
  remove(@Param('slug') slug: string) {
    return this.blogService.remove(slug);
  }

  @ApiBearerAuth()
  @ApiCookieAuth()
  @Post('images')
  @ApiConsumes('multipart/form-data')
  @ApiUnauthorized()
  @ApiBadRequest('No file provided or invalid file type')
  async uploadImage(@Req() request: MultipartRequest) {
    const { buffer, mimeType } = await validateAndReadFile(request);
    return this.blogService.uploadTempImage(buffer, `image${safeExtension(mimeType)}`, mimeType);
  }
}
