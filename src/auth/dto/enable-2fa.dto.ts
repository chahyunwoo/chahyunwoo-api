import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class Enable2faDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be exactly 6 digits' })
  code: string;
}
