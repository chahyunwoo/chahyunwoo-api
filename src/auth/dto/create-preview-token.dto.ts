import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePreviewTokenDto {
  /**
   * 미리보기를 허용할 글의 slug.
   *
   * 토큰을 이 slug에 묶어 두면 토큰이 유출돼도 열람 범위가 그 글 하나로
   * 제한된다. 예전에는 slug 없이 발급해 토큰 하나로 모든 비공개 글을
   * 볼 수 있었다.
   */
  @ApiProperty({ example: 'my-post-slug' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  slug: string;
}
