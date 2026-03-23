import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';

class SocialLinkDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsUrl({}, { message: 'href must be a valid URL' })
  href: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;
}

class ProfileTranslationDto {
  @ApiProperty()
  @IsString()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'imageUrl must be a valid URL' })
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'iconUrl must be a valid URL' })
  iconUrl?: string;

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
