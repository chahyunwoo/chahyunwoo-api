import type { MultipartFile } from '@fastify/multipart';
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
import type { FastifyRequest } from 'fastify';

interface MultipartRequest extends FastifyRequest {
  file(): Promise<MultipartFile | undefined>;
}

import { Public } from '../common/decorators/public.decorator';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { PostQueryDto, SearchQueryDto } from './dto/post-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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
  @Get('categories')
  getCategories() {
    return this.blogService.getCategories();
  }

  @Public()
  @Get('posts/:slug')
  findOne(@Param('slug') slug: string) {
    return this.blogService.findBySlug(slug);
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
