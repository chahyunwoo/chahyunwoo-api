import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TrackPageViewDto {
  @ApiProperty({ example: '/blog/my-post' })
  @IsString()
  @IsNotEmpty()
  path: string;

  @ApiProperty({ enum: ['blog', 'portfolio', 'admin'], example: 'blog' })
  @IsString()
  @IsIn(['blog', 'portfolio', 'admin'])
  appName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referrer?: string;
}
