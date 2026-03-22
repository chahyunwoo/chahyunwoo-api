import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { SUPPORTED_LOCALES } from '../portfolio.constants';

export class GetProjectsQueryDto {
  @ApiPropertyOptional({ default: 'ko', enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string = 'ko';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  featured?: boolean;
}
