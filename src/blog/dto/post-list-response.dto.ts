import { ApiProperty } from '@nestjs/swagger';

/**
 * GET /api/blog/posts 응답 스키마.
 *
 * 실제 반환 shape는 BlogService.findAll() → formatPost()가 만든다.
 * formatPost는 `const { postTags, content, ...rest } = post`로 Post의 content를 뺀
 * 전 스칼라 필드를 그대로 싣고, postTags를 Tag 배열로 펼친다.
 * 따라서 여기 필드는 prisma/schema.prisma의 model Post / model Tag와 1:1로 맞춰야 하며,
 * nullable도 스키마와 동일해야 한다.
 */
export class PostTagDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'React' })
  name: string;

  @ApiProperty({ example: 'react' })
  slug: string;
}

export class PostSummaryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Next.js 15 App Router 완전 정복' })
  title: string;

  @ApiProperty({ example: 'nextjs-15-app-router' })
  slug: string;

  @ApiProperty({ type: String, nullable: true, description: '미입력 시 content에서 자동 추출' })
  description: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://assets.chahyunwoo.dev/thumbnail/example.png',
  })
  thumbnailUrl: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Frontend' })
  category: string | null;

  @ApiProperty({ example: true })
  published: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  publishedAt: string | null;

  @ApiProperty({ example: 5, description: '분 단위 예상 읽기 시간' })
  readingTime: number;

  @ApiProperty({ example: 128 })
  viewCount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: string;

  @ApiProperty({ type: [PostTagDto] })
  tags: PostTagDto[];
}

export class PostListResponseDto {
  @ApiProperty({ type: [PostSummaryDto] })
  posts: PostSummaryDto[];

  @ApiProperty({ example: 40, description: '필터 조건에 맞는 전체 건수' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 4 })
  totalPages: number;
}
