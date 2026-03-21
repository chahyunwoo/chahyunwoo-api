import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { DEFAULT_LOCALE } from '../portfolio.constants';

export class LocaleQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_LOCALE })
  @IsOptional()
  @IsString()
  locale?: string = DEFAULT_LOCALE;
}
