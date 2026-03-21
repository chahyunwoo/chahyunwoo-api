import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class ProjectTranslationDto {
  @ApiProperty({ enum: ['ko', 'en', 'jp'] })
  @IsString()
  @IsIn(['ko', 'en', 'jp'])
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
  @IsString()
  demoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
