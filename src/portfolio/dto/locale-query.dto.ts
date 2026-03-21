import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const SUPPORTED_LOCALES = ['ko', 'en', 'jp'] as const;

export class LocaleQueryDto {
  @ApiPropertyOptional({ default: 'ko', enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string = 'ko';
}
