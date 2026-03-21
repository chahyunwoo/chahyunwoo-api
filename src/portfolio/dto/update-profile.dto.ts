import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

class SocialLinkDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  href: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;
}

class ProfileTranslationDto {
  @ApiProperty({ enum: ['ko', 'en', 'jp'] })
  @IsString()
  @IsIn(['ko', 'en', 'jp'])
  locale: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  jobTitle: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  introduction: string[];
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ type: [SocialLinkDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];

  @ApiPropertyOptional({ type: [ProfileTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfileTranslationDto)
  translations?: ProfileTranslationDto[];
}
