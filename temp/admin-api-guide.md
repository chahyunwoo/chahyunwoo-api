# Admin API Guide

## 인증 흐름

### 1. 로그인
```
POST /api/auth/login
Content-Type: application/json

{ "username": "admin", "password": "your_password" }
```
응답:
```json
{ "accessToken": "eyJ...", "refreshToken": "71623e51a6b..." }
```
- accessToken: 15분 만료, 모든 어드민 API 요청에 `Authorization: Bearer {accessToken}` 헤더로 사용
- refreshToken: 7일 만료, accessToken 갱신용

### 2. 토큰 갱신
```
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "71623e51a6b..." }
```
응답: 새 `{ accessToken, refreshToken }` 쌍 반환
- **Token Rotation**: 기존 refreshToken은 폐기되고 새 refreshToken 발급
- 이전 refreshToken으로 다시 요청하면 401
- 다른 IP에서 요청하면 전체 세션 폐기 + 403

### 3. 로그아웃
```
POST /api/auth/logout
Content-Type: application/json

{ "refreshToken": "71623e51a6b..." }
```

### 4. 전체 세션 폐기 (JWT 필요)
```
POST /api/auth/logout-all
Authorization: Bearer {accessToken}
```

---

## 블로그 어드민 API

모든 요청에 `Authorization: Bearer {accessToken}` 필요.

### 포스트 생성
```
POST /api/blog/posts
Content-Type: application/json

{
  "title": "포스트 제목",
  "slug": "post-slug",
  "description": "간단한 설명",
  "content": "MDX 콘텐츠 문자열",
  "category": "Frontend",
  "tags": ["React", "TypeScript"],
  "published": false
}
```
- `published: false` (기본값) → 임시저장, `true`로 수정해야 발행
- `slug` 중복 시 409 Conflict
- `tags`는 문자열 배열, 없는 태그 자동 생성

### 포스트 수정
```
PUT /api/blog/posts/:slug
Content-Type: application/json

{
  "title": "수정된 제목",
  "published": true
}
```
- 부분 수정 가능 (보낸 필드만 업데이트)
- `tags` 수정 시 기존 태그 연결 해제 후 새로 연결

### 포스트 삭제
```
DELETE /api/blog/posts/:slug
```
- 204 No Content 응답

### 썸네일 업로드
```
POST /api/blog/posts/:slug/thumbnail
Content-Type: multipart/form-data

file: (이미지 파일)
```
- JPEG, PNG, WebP, GIF만 허용
- 5MB 제한
- 기존 썸네일 자동 삭제 후 교체
- R2에 업로드, URL 자동 반영

### CUD 후 동작
- 생성/수정/삭제 성공 시 블로그 프론트 revalidation 자동 호출
- 블로그 캐시 자동 무효화

---

## 포트폴리오 어드민 API

모든 요청에 `Authorization: Bearer {accessToken}` 필요.

### Locale 관리
```
# 목록 (공개)
GET /api/portfolio/locales

# 추가
POST /api/portfolio/locales
{ "code": "zh", "label": "中文" }

# 삭제
DELETE /api/portfolio/locales/:id
```

### 프로필 수정
```
PUT /api/portfolio/profile

{
  "name": "CHA HYUNWOO",
  "location": "Seoul, Korea",
  "imageUrl": "https://assets.chahyunwoo.dev/profile/chahyunwoo-profile.jpg",
  "iconUrl": "https://assets.chahyunwoo.dev/profile/profile-icon.png",
  "socialLinks": [
    { "name": "Github", "href": "https://github.com/chahyunwoo", "icon": "Github" }
  ],
  "translations": [
    { "locale": "ko", "jobTitle": "풀스택 개발자", "introduction": ["소개 1", "소개 2"] },
    { "locale": "en", "jobTitle": "Full-Stack Developer", "introduction": ["Intro 1"] }
  ]
}
```
- 부분 수정 가능
- translations의 locale별 upsert (있으면 수정, 없으면 생성)

### 경력 CRUD
```
# 생성
POST /api/portfolio/experiences
{
  "sortOrder": 1,
  "startDate": "2025",
  "endDate": null,
  "isCurrent": true,
  "translations": [
    { "locale": "ko", "title": "프리랜서", "role": "풀스택", "responsibilities": ["업무1", "업무2"] },
    { "locale": "en", "title": "Freelancer", "role": "Full-Stack", "responsibilities": ["Task1"] }
  ]
}

# 수정 (부분 수정 가능)
PUT /api/portfolio/experiences/:id
{ "sortOrder": 2 }

# 삭제
DELETE /api/portfolio/experiences/:id
```

### 프로젝트 CRUD
```
POST /api/portfolio/projects
{
  "sortOrder": 1,
  "demoUrl": "https://chahyunwoo.dev",
  "repoUrl": "https://github.com/chahyunwoo/repo",
  "techStack": ["Next.js", "TypeScript"],
  "featured": true,
  "translations": [
    { "locale": "ko", "title": "프로젝트명", "description": "설명" },
    { "locale": "en", "title": "Project", "description": "Description" }
  ]
}

PUT /api/portfolio/projects/:id
DELETE /api/portfolio/projects/:id
```

### 스킬 CRUD
```
POST /api/portfolio/skills
{ "category": "Frontend", "name": "React", "sortOrder": 0 }

PUT /api/portfolio/skills/:id
DELETE /api/portfolio/skills/:id
```
- 다국어 불필요 (기술명은 영어 공통)

### 학력 CRUD
```
POST /api/portfolio/education
{
  "period": "2011 - 2017",
  "sortOrder": 1,
  "translations": [
    { "locale": "ko", "institution": "숭실대학교", "degree": "회계학 학사" },
    { "locale": "en", "institution": "Soongsil University", "degree": "Bachelor of Accounting" }
  ]
}

PUT /api/portfolio/education/:id
DELETE /api/portfolio/education/:id
```

---

## 에러 응답

모든 에러는 동일한 구조:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed" 또는 ["field1 error", "field2 error"],
  "path": "/api/...",
  "timestamp": "2026-03-21T..."
}
```

| 코드 | 의미 | 발생 상황 |
|------|------|----------|
| 400 | Bad Request | DTO 검증 실패, 지원하지 않는 locale |
| 401 | Unauthorized | 토큰 없음/만료/유효하지 않음, 잘못된 API Key |
| 403 | Forbidden | IP Whitelist 위반, 다른 IP에서 refresh 시도 |
| 404 | Not Found | 리소스 없음 |
| 409 | Conflict | slug/locale 중복 |
| 429 | Too Many Requests | Rate limit 초과 |

---

## 환경변수 (어드민 관련)

| 변수 | 설명 |
|------|------|
| `JWT_SECRET` | JWT 서명 키 |
| `ADMIN_USERNAME` | 어드민 아이디 |
| `ADMIN_PASSWORD_HASH` | bcrypt 해시 (`make hash-password PASSWORD=xxx`) |
| `API_KEY` | 공개 API 인증 키 (조회 API용) |
| `ADMIN_IP_WHITELIST` | 어드민 API 허용 IP (콤마 구분, 비어있으면 제한 없음) |

---

## Swagger UI

개발 환경: http://localhost:8000/docs
- 모든 엔드포인트, 요청/응답 스키마, 에러 응답 확인 가능
- Authorize 버튼으로 JWT 토큰 입력 후 어드민 API 테스트 가능
