import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { LOCALE_CODES } from '../portfolio.constants';

export class LocaleQueryDto {
  @ApiPropertyOptional({ default: 'ko', enum: LOCALE_CODES })
  @IsOptional()
  @IsString()
  @IsIn(LOCALE_CODES)
  locale?: string = 'ko';
}
