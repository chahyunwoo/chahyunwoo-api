import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';

class ProjectTranslationDto {
  @ApiProperty()
  @IsString()
  locale: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateProjectDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'demoUrl must be a valid URL' })
  demoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'repoUrl must be a valid URL' })
  repoUrl?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  techStack: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  featured?: boolean = false;

  @ApiProperty({ type: [ProjectTranslationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProjectTranslationDto)
  translations: ProjectTranslationDto[];
}
