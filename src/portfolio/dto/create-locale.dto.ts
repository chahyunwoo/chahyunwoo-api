import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateLocaleDto {
  @ApiProperty({ example: 'zh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5)
  code: string;

  @ApiProperty({ example: '中文' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label: string;
}
