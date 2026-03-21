import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import type { MultipartRequest } from '../types/fastify.d';
import { ALLOWED_MIME_TYPES } from './blog.constants';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostQueryDto, RecentQueryDto, SearchQueryDto, TagQueryDto } from './dto/post-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@ApiTags('blog')
@Controller('api/blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // NOTE: /search must be registered before /:slug to avoid route conflict
  @Public()
  @Get('posts/search')
  search(@Query() query: SearchQueryDto) {
    return this.blogService.search(query);
  }

  @Public()
  @Get('posts')
  findAll(@Query() query: PostQueryDto) {
    return this.blogService.findAll(query);
  }

  @Public()
  @Get('posts/recent')
  getRecentPosts(@Query() query: RecentQueryDto) {
    return this.blogService.getRecentPosts(query.limit);
  }

  @Public()
  @Get('categories')
  getCategories() {
    return this.blogService.getCategories();
  }

  @Public()
  @Get('tags')
  getTags(@Query() query: TagQueryDto) {
    return this.blogService.getTags(query);
  }

  @Public()
  @Get('posts/:slug')
  findOne(@Param('slug') slug: string) {
    return this.blogService.findBySlug(slug);
  }

  @Public()
  @Get('posts/:slug/related')
  getRelatedPosts(@Param('slug') slug: string) {
    return this.blogService.getRelatedPosts(slug);
  }

  @ApiBearerAuth()
  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePostDto) {
    return this.blogService.create(dto);
  }

  @ApiBearerAuth()
  @Put('posts/:slug')
  update(@Param('slug') slug: string, @Body() dto: UpdatePostDto) {
    return this.blogService.update(slug, dto);
  }

  @ApiBearerAuth()
  @Delete('posts/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('slug') slug: string) {
    return this.blogService.remove(slug);
  }

  @ApiBearerAuth()
  @Post('posts/:slug/thumbnail')
  @ApiConsumes('multipart/form-data')
  async uploadThumbnail(@Param('slug') slug: string, @Req() request: MultipartRequest) {
    const data = await request.file();
    if (!data) throw new BadRequestException('No file provided');
    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WebP, GIF are allowed');
    }

    const buffer = await data.toBuffer();
    return this.blogService.updateThumbnail(slug, buffer, data.filename, data.mimetype);
  }
}
