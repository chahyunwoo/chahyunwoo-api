import { ApiProperty } from '@nestjs/swagger';
import { PostSummaryDto, PostTagDto } from './post-list-response.dto';

/**
 * blog 도메인의 응답 스키마.
 *
 * 필드는 추측이 아니라 **실제 반환값을 관측해서** 맞췄다. 대부분은
 * `BlogService.formatPost()`가 만드는 shape이고, 그건 `PostSummaryDto`와 같다:
 *
 *   formatPost(post, withContent) {
 *     const { postTags, content, ...rest } = post;
 *     return { ...rest, ...(withContent ? { content } : {}), tags: ... };
 *   }
 *
 * 즉 `content`를 뺀 Post의 전 스칼라 필드 + `tags`다. `withContent=true`인
 * 라우트만 `content`가 추가로 실린다(상세·미리보기·생성·수정).
 *
 * DTO가 실제 응답과 어긋나면 타입이 없는 것보다 나쁘다 — 프론트가 그 타입을
 * 믿고 코드를 짜기 때문이다. 그래서 nullable까지 prisma/schema.prisma와 맞췄다.
 */

/** 상세·생성·수정 응답. 목록과 달리 `content`(MDX 원문)가 포함된다. */
export class PostDetailDto extends PostSummaryDto {
  @ApiProperty({ description: 'MDX 원문', example: '# 제목\n\n본문입니다.' })
  content: string;
}

export class TagCountDto {
  @ApiProperty({ example: 'React' })
  name: string;

  @ApiProperty({ example: 'react' })
  slug: string;

  @ApiProperty({ example: 12, description: '이 카테고리 안에서 이 태그가 붙은 글 수' })
  count: number;
}

/** `GET /api/blog/categories` — 카테고리별 글 수와 그 안의 태그 집계. */
export class CategoryWithTagsDto {
  /**
   * 어드민의 수정·삭제가 이 값을 쓴다(`PUT|DELETE /categories/{id}`).
   *
   * nullable인 이유: 이 목록은 **발행된 글의 category 값**을 groupBy한 것이라,
   * categories 테이블에 없는 이름이 글에 들어가 있으면 매칭되는 레코드가 없다.
   * 그 경우 수정·삭제 대상이 아니므로 프론트가 버튼을 감춰야 한다.
   */
  @ApiProperty({ type: Number, nullable: true, example: 1 })
  id: number | null;

  @ApiProperty({ example: 'Frontend' })
  category: string;

  @ApiProperty({ example: 'Monitor', description: 'lucide 아이콘 이름' })
  icon: string;

  @ApiProperty({ example: 8, description: '이 카테고리의 발행된 글 수' })
  count: number;

  @ApiProperty({ example: true, description: '최근 기간 내 새 글이 있는지' })
  recent: boolean;

  @ApiProperty({ type: [TagCountDto], description: 'count 내림차순' })
  tags: TagCountDto[];
}

/**
 * `GET /api/blog/posts/search` — 검색 결과.
 *
 * `grouped`는 카테고리명을 키로 하는 동적 객체라 정확한 프로퍼티를 선언할 수 없다.
 * `additionalProperties`로 값의 형태만 기술한다.
 */
export class PostSearchResponseDto {
  @ApiProperty({ type: [PostSummaryDto] })
  posts: PostSummaryDto[];

  @ApiProperty({ example: 3, description: '검색 조건에 맞는 전체 건수' })
  total: number;

  @ApiProperty({ example: 'react', description: '검색어(요청의 q를 그대로 되돌려준다)' })
  query: string;

  @ApiProperty({
    description: '카테고리명을 키로 묶은 결과. 카테고리가 없는 글은 "Uncategorized"로 묶인다.',
    type: 'object',
    additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/PostSummaryDto' } },
    example: { Frontend: [], Backend: [] },
  })
  grouped: Record<string, PostSummaryDto[]>;
}

/** `GET /api/blog/posts/{slug}/related` — 태그가 겹치는 글과, 부족분을 채운 추천 글. */
export class RelatedPostsResponseDto {
  @ApiProperty({ type: [PostSummaryDto], description: '태그가 겹치는 글 (겹친 수 내림차순)' })
  related: PostSummaryDto[];

  @ApiProperty({
    type: [PostSummaryDto],
    description: 'related가 목표 수에 못 미칠 때 최신 글로 채운 분',
  })
  recommended: PostSummaryDto[];
}

export class TagListResponseDto {
  @ApiProperty({ type: [TagCountDto], description: '글 수 내림차순. 참조가 0인 태그는 제외된다.' })
  tags: TagCountDto[];

  @ApiProperty({ example: 75, description: '실제로 글에 붙어 있는 태그의 총 개수' })
  total: number;
}

/** `POST /api/blog/categories`, `PUT /api/blog/categories/{id}` — Category 레코드 그대로. */
export class CategoryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Frontend' })
  name: string;

  @ApiProperty({ example: 'Monitor', description: 'lucide 아이콘 이름' })
  icon: string;

  @ApiProperty({ example: 1 })
  sortOrder: number;
}

/** `POST /api/blog/images` — temp 경로에 올라간 이미지 URL. 글 저장 시 확정 경로로 옮겨진다. */
export class UploadImageResponseDto {
  @ApiProperty({ example: 'https://assets.chahyunwoo.dev/blog/temp/abc123.png' })
  url: string;
}

export { PostTagDto };
