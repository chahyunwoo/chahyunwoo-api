import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';

import { WorkTranslationDto } from './work-translation.dto';

export class CreateWorkDto {
  @ApiProperty({ enum: ['business', 'personal'] })
  @IsString()
  @IsIn(['business', 'personal'])
  type: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean = false;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  techStack: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'demoUrl must be a valid URL' })
  demoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'repoUrl must be a valid URL' })
  repoUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  featured?: boolean = false;

  @ApiProperty({ type: [WorkTranslationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkTranslationDto)
  translations: WorkTranslationDto[];
}
