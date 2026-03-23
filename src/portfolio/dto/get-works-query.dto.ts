import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class GetWorksQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ enum: ['business', 'personal'] })
  @IsOptional()
  @IsString()
  @IsIn(['business', 'personal'])
  type?: string;
}
