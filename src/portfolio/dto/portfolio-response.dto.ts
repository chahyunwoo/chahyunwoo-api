import { ApiProperty } from '@nestjs/swagger';

/**
 * portfolio 도메인의 응답 스키마.
 *
 * **목록/단건 조회와 CRUD 응답의 shape이 다르다.** 이 도메인은 i18n 구조라
 * (`*_translations` 테이블) 조회 계열은 요청 locale의 번역을 골라 **평탄화**해서
 * 돌려주고, `create`/`update`/`getXById`는 Prisma 레코드를 **그대로** 돌려준다
 * (`translations` 배열이 그대로 실린다).
 *
 * 예: `getExperiences(locale)`는 `{ id, startDate, ..., title, role, responsibilities }`를
 * 만들지만 `getExperienceById(id)`는 `{ id, startDate, ..., translations: [...] }`다.
 * 둘을 같은 DTO로 묶으면 어느 쪽이든 거짓말이 된다.
 *
 * 필드는 추측이 아니라 서비스 코드의 반환문을 그대로 옮긴 것이고, 실제 응답과
 * 대조해 확인했다.
 */

// ─── 공통 ─────────────────────────────────────────────────────────────────────

/**
 * `profiles.social_links`(JSON 컬럼)의 요소.
 *
 * `icon`은 프론트가 실제로 쓴다 — 포트폴리오 연락처 섹션이 이 값으로 lucide
 * 아이콘을 고른다(`contact-section.tsx`의 `ICON_MAP[link.icon.toLowerCase()]`).
 * 처음 이 DTO를 쓸 때 `name`/`href`만 선언했다가, 프론트를 생성 타입으로
 * 전환하면서 컴파일 에러로 드러났다.
 */
export class SocialLinkDto {
  @ApiProperty({ example: 'Github' })
  name: string;

  @ApiProperty({ example: 'https://github.com/chahyunwoo' })
  href: string;

  @ApiProperty({ example: 'Github', description: 'lucide 아이콘 이름(대소문자 무관)' })
  icon: string;
}

/** 업로드 응답 — `POST /profile/image`, `POST /profile/icon`. */
export class UploadUrlResponseDto {
  @ApiProperty({ example: 'https://assets.chahyunwoo.dev/profile/image/abc.png' })
  url: string;
}

export class LocaleDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'ko' })
  code: string;

  @ApiProperty({ example: '한국어' })
  label: string;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

/** `GET /profile?locale=` — 요청 locale의 번역을 평탄화한 결과. */
export class ProfileDto {
  @ApiProperty({ example: '차현우' })
  name: string;

  @ApiProperty({ example: '서울, 대한민국' })
  location: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  iconUrl: string | null;

  @ApiProperty({ type: [SocialLinkDto] })
  socialLinks: SocialLinkDto[];

  @ApiProperty({ example: 'Full-Stack Developer', description: '번역이 없으면 빈 문자열' })
  jobTitle: string;

  @ApiProperty({ type: [String], description: '문단 배열. 번역이 없으면 빈 배열' })
  introduction: string[];
}

export class ProfileTranslationDto {
  @ApiProperty({ example: 'ko' })
  locale: string;

  @ApiProperty({ example: 'Full-Stack Developer' })
  jobTitle: string;

  @ApiProperty({ type: [String] })
  introduction: string[];
}

/**
 * `GET /profile/all` — 어드민용. 모든 locale의 번역을 함께 돌려준다.
 *
 * Prisma 레코드를 그대로 주지 않는다 — `id`를 빼고 translations도 3필드만 골라 담는다.
 */
export class ProfileWithTranslationsDto {
  @ApiProperty({ example: '차현우' })
  name: string;

  @ApiProperty({ example: '서울, 대한민국' })
  location: string;

  @ApiProperty({ type: String, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  iconUrl: string | null;

  @ApiProperty({ type: [SocialLinkDto] })
  socialLinks: SocialLinkDto[];

  @ApiProperty({ type: [ProfileTranslationDto] })
  translations: ProfileTranslationDto[];
}

// ─── Experience ───────────────────────────────────────────────────────────────

/** `GET /experiences?locale=` — 평탄화된 목록. */
export class ExperienceDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startDate: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endDate: string | null;

  @ApiProperty({ example: false })
  isCurrent: boolean;

  @ApiProperty({ example: '회사명', description: '번역이 없으면 빈 문자열' })
  title: string;

  @ApiProperty({ example: 'Backend Developer', description: '번역이 없으면 빈 문자열' })
  role: string;

  @ApiProperty({ type: [String], description: '번역이 없으면 빈 배열' })
  responsibilities: string[];
}

export class ExperienceTranslationDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  experienceId: number;

  @ApiProperty({ example: 'ko' })
  locale: string;

  @ApiProperty({ example: '회사명' })
  title: string;

  @ApiProperty({ example: 'Backend Developer' })
  role: string;

  @ApiProperty({ type: [String] })
  responsibilities: string[];
}

/**
 * `GET /experiences/{id}`, `POST /experiences`, `PUT /experiences/{id}` —
 * Prisma 레코드 그대로. 목록과 달리 평탄화하지 않고 `translations`가 그대로 실린다.
 */
export class ExperienceRecordDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startDate: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endDate: string | null;

  @ApiProperty({ example: false })
  isCurrent: boolean;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ type: [ExperienceTranslationDto] })
  translations: ExperienceTranslationDto[];
}

// ─── Project ──────────────────────────────────────────────────────────────────

export class ProjectDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: String, nullable: true })
  demoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ type: [String] })
  techStack: string[];

  @ApiProperty({ example: false })
  featured: boolean;

  @ApiProperty({ example: '프로젝트명', description: '번역이 없으면 빈 문자열' })
  title: string;

  @ApiProperty({ example: '설명', description: '번역이 없으면 빈 문자열' })
  description: string;
}

export class ProjectTranslationDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  projectId: number;

  @ApiProperty({ example: 'ko' })
  locale: string;

  @ApiProperty({ example: '프로젝트명' })
  title: string;

  @ApiProperty({ example: '설명' })
  description: string;
}

/** `GET /projects/{id}`, `POST /projects`, `PUT /projects/{id}` — Prisma 레코드 그대로. */
export class ProjectRecordDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ type: String, nullable: true })
  demoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ type: [String] })
  techStack: string[];

  @ApiProperty({ example: false })
  featured: boolean;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ type: [ProjectTranslationDto] })
  translations: ProjectTranslationDto[];
}

// ─── Work ─────────────────────────────────────────────────────────────────────

export class WorkDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'company', description: 'company | side | freelance 등' })
  type: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startDate: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endDate: string | null;

  @ApiProperty({ example: false })
  isCurrent: boolean;

  @ApiProperty({ type: [String] })
  techStack: string[];

  @ApiProperty({ type: String, nullable: true })
  demoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ example: false })
  featured: boolean;

  @ApiProperty({
    type: [String],
    description: 'title과 featured로 서버에서 생성한 그라디언트 색. DB 값이 아니다.',
    example: ['#4F46E5', '#7C3AED'],
  })
  gradientColors: string[];

  @ApiProperty({ example: '프로젝트명', description: '번역이 없으면 빈 문자열' })
  title: string;

  @ApiProperty({ type: String, nullable: true, description: '번역이 없으면 null' })
  role: string | null;

  @ApiProperty({ example: '한 줄 요약', description: '번역이 없으면 빈 문자열' })
  summary: string;

  @ApiProperty({ description: 'MDX 본문. 번역이 없으면 빈 문자열' })
  content: string;

  @ApiProperty({ type: [String], description: '번역이 없으면 빈 배열' })
  highlights: string[];
}

export class WorkTranslationDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  workId: number;

  @ApiProperty({ example: 'ko' })
  locale: string;

  @ApiProperty({ example: '프로젝트명' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  role: string | null;

  @ApiProperty({ example: '한 줄 요약' })
  summary: string;

  @ApiProperty({ description: 'MDX 본문' })
  content: string;

  @ApiProperty({ type: [String] })
  highlights: string[];
}

/** `POST /works`, `PUT /works/{id}` — Prisma 레코드 그대로. */
export class WorkRecordDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'company' })
  type: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startDate: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endDate: string | null;

  @ApiProperty({ example: false })
  isCurrent: boolean;

  @ApiProperty({ type: [String] })
  techStack: string[];

  @ApiProperty({ type: String, nullable: true })
  demoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  repoUrl: string | null;

  @ApiProperty({ example: false })
  featured: boolean;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ type: [WorkTranslationDto] })
  translations: WorkTranslationDto[];
}

/**
 * `GET /works/{id}` — Prisma 레코드 + `gradientColors`.
 *
 * `create`/`update`와 달리 상세 조회만 `gradientColors`를 덧붙인다
 * (`getWorkById`가 기본 locale 번역의 title로 생성한다). 같은 DTO를 쓰면
 * CRUD 응답에 없는 필드를 있다고 말하게 된다.
 */
export class WorkDetailDto extends WorkRecordDto {
  @ApiProperty({
    type: [String],
    description: 'title과 featured로 서버에서 생성한 그라디언트 색. DB 값이 아니다.',
    example: ['#4F46E5', '#7C3AED'],
  })
  gradientColors: string[];
}

// ─── Skill ────────────────────────────────────────────────────────────────────

export class SkillItemDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'TypeScript' })
  name: string;

  @ApiProperty({ example: 90, description: '0-100' })
  proficiency: number;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;
}

/** `GET /skills` — category로 묶은 그룹 배열. locale 무관(번역 테이블이 없다). */
export class SkillGroupDto {
  @ApiProperty({ example: 'Frontend' })
  category: string;

  @ApiProperty({ type: [SkillItemDto], description: 'sortOrder 오름차순' })
  items: SkillItemDto[];
}

/** `POST /skills`, `PUT /skills/{id}` — Prisma 레코드 그대로. */
export class SkillRecordDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Frontend' })
  category: string;

  @ApiProperty({ example: 'TypeScript' })
  name: string;

  @ApiProperty({ example: 90 })
  proficiency: number;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;
}

// ─── Education ────────────────────────────────────────────────────────────────

export class EducationDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2018.03 - 2022.02' })
  period: string;

  @ApiProperty({ example: '○○대학교', description: '번역이 없으면 빈 문자열' })
  institution: string;

  @ApiProperty({ example: '컴퓨터공학 학사', description: '번역이 없으면 빈 문자열' })
  degree: string;
}

export class EducationTranslationDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  educationId: number;

  @ApiProperty({ example: 'ko' })
  locale: string;

  @ApiProperty({ example: '○○대학교' })
  institution: string;

  @ApiProperty({ example: '컴퓨터공학 학사' })
  degree: string;
}

/** `GET /education/{id}`, `POST /education`, `PUT /education/{id}` — Prisma 레코드 그대로. */
export class EducationRecordDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '2018.03 - 2022.02' })
  period: string;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ type: [EducationTranslationDto] })
  translations: EducationTranslationDto[];
}

// ─── Contact ──────────────────────────────────────────────────────────────────

/**
 * `POST /contact` — 문의 접수 결과.
 *
 * 동일 이메일 10분 쿨다운에 걸려도 같은 응답을 돌려준다(스팸 대응이 드러나지 않게).
 * 즉 `success: true`가 "새 메시지가 저장됐다"를 뜻하지는 않는다.
 */
export class ContactResultDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Message sent successfully' })
  message: string;
}

/** `GET /contacts`, `PUT /contacts/{id}/read` — Prisma 레코드 그대로. */
export class ContactMessageDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '홍길동' })
  name: string;

  @ApiProperty({ example: 'someone@example.com' })
  email: string;

  @ApiProperty({ type: String, nullable: true, example: '협업 문의' })
  subject: string | null;

  @ApiProperty({ example: '문의 내용입니다.' })
  message: string;

  @ApiProperty({ example: false })
  read: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}
