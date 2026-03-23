import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class EducationTranslationDto {
  @ApiProperty()
  @IsString()
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
