import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackPageViewDto {
  @ApiProperty({ example: '/blog/my-post' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  path: string;

  @ApiProperty({ enum: ['blog', 'portfolio', 'admin'], example: 'blog' })
  @IsString()
  @IsIn(['blog', 'portfolio', 'admin'])
  appName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  referrer?: string;
}
