import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ example: 'Next.js 15 App Router 완전 정복' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ description: '미입력 시 제목에서 자동 생성' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiProperty({ description: 'MDX content' })
  @IsString()
  @MinLength(1)
  @MaxLength(500_000)
  content: string;

  @ApiPropertyOptional({ example: 'Frontend' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  category?: string;

  @ApiPropertyOptional({ description: '이미지 업로드 API에서 받은 URL' })
  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\//, { message: 'thumbnailUrl must be a valid HTTP URL' })
  thumbnailUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean = false;

  @ApiPropertyOptional({ example: '2026-03-21', description: '발행일 (미입력 시 발행 시점 자동)' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional({ type: [String], example: ['React', 'TypeScript'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[] = [];
}
