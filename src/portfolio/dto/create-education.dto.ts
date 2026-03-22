import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '../portfolio.constants';

class EducationTranslationDto {
  @ApiProperty({ enum: [...SUPPORTED_LOCALES] })
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  locale: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  institution: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  degree: string;
}

export class CreateEducationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  period: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;

  @ApiProperty({ type: [EducationTranslationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EducationTranslationDto)
  translations: EducationTranslationDto[];
}
