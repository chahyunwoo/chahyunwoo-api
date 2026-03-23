import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class GetProjectsQueryDto {
  @ApiPropertyOptional({ default: 'ko' })
  @IsOptional()
  @IsString()
  locale?: string = 'ko';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  featured?: boolean;
}
