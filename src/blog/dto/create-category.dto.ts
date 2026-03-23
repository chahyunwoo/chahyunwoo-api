import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DEFAULT_CATEGORY_ICON } from '../blog.constants';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Frontend' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Monitor', description: 'lucide-react 아이콘 이름' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string = DEFAULT_CATEGORY_ICON;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;
}
