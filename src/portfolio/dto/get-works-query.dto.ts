import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { SUPPORTED_LOCALES } from '../portfolio.constants';

export class GetWorksQueryDto {
  @ApiPropertyOptional({ enum: [...SUPPORTED_LOCALES] })
  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LOCALES])
  locale?: string;

  @ApiPropertyOptional({ enum: ['business', 'personal'] })
  @IsOptional()
  @IsString()
  @IsIn(['business', 'personal'])
  type?: string;
}
