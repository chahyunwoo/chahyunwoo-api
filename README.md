# 🚀 chahyunwoo API Server

> [chahyunwoo.dev](https://chahyunwoo.dev) 블로그 & 포트폴리오 백엔드 API

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white" />
  <img src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
</p>

## ✨ Features

- 📝 **블로그 API** — 포스트 CRUD, 카테고리/태그 관리, 검색, 연관 포스트 추천
- 🎨 **포트폴리오 API** — 프로필, 경력, 프로젝트, 스킬, 학력 (다국어 지원 ko/en/jp)
- 🔐 **인증** — JWT + Refresh Token (Token Rotation, IP 바인딩)
- 🖼️ **이미지 스토리지** — Cloudflare R2 (썸네일, 프로필 이미지)
- ⚡ **성능** — 인메모리 캐시, Prisma groupBy 최적화, fire-and-forget revalidation
- 🔄 **On-demand Revalidation** — CUD 시 프론트 자동 갱신
- 🛡️ **보안** — API Key, JWT, IP Whitelist, Rate Limiting, 에러 표준화

## 🏗️ Tech Stack

| Layer | Tech |
|-------|------|
| Framework | NestJS 11 + Fastify 5 |
| ORM | Prisma 7 (PrismaPg adapter) |
| Database | PostgreSQL 16 (multi-schema: auth, blog, portfolio) |
| Storage | Cloudflare R2 |
| Auth | JWT + Refresh Token + bcrypt |
| Lint/Format | Biome 2.4 |
| CI/CD | GitHub Actions + Tailscale SSH |
| Deploy | Docker Compose on Mac mini |

## 📦 Quick Start

```bash
# 의존성 설치
pnpm install

# 환경변수 설정
cp .env.example .env

# 어드민 비밀번호 해시 생성
make hash-password PASSWORD=yourpassword

# PostgreSQL 컨테이너 실행
docker run -d --name chahyunwoo-api-db \
  -e POSTGRES_USER=chwzp \
  -e POSTGRES_PASSWORD=yourpw \
  -e POSTGRES_DB=hyunwoo \
  -p 5432:5432 postgres:16

# DB 마이그레이션
pnpm db:migrate:dev --name init

# 개발 서버 시작
pnpm start:dev
```

Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)

## 🗂️ Project Structure

```
src/
├── auth/                # JWT 인증 + Refresh Token
├── blog/                # 블로그 CRUD + 검색 + 연관 포스트
├── portfolio/           # 포트폴리오 (다국어) + 캐시
├── common/              # Guards, Filters, Decorators
├── prisma/              # PrismaService (PrismaPg adapter)
├── storage/             # Cloudflare R2 StorageService
├── revalidation/        # On-demand Revalidation
└── main.ts              # Fastify + Swagger + CORS
```

## 🔗 API Endpoints

### 📝 Blog (Public — `x-api-key` required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/blog/posts` | 포스트 목록 (페이지네이션, 카테고리/태그 필터) |
| `GET` | `/api/blog/posts/recent` | 최근 포스트 |
| `GET` | `/api/blog/posts/search` | 검색 (카테고리별 그룹핑) |
| `GET` | `/api/blog/posts/:slug` | 포스트 상세 (MDX 포함) |
| `GET` | `/api/blog/posts/:slug/related` | 연관 + 추천 포스트 (항상 3개) |
| `GET` | `/api/blog/categories` | 카테고리 목록 (recent 뱃지) |
| `GET` | `/api/blog/tags` | 태그 클라우드 |

### 🎨 Portfolio (Public — `x-api-key` required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/portfolio/locales` | 지원 언어 목록 |
| `GET` | `/api/portfolio/profile` | 프로필 (`?locale=ko`) |
| `GET` | `/api/portfolio/experiences` | 경력 (`?locale=ko`) |
| `GET` | `/api/portfolio/projects` | 프로젝트 (`?locale=ko&featured=true`) |
| `GET` | `/api/portfolio/skills` | 스킬 (다국어 불필요) |
| `GET` | `/api/portfolio/education` | 학력 (`?locale=ko`) |

### 🔐 Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | 로그인 → `{ accessToken, refreshToken }` |
| `POST` | `/api/auth/refresh` | 토큰 갱신 (Token Rotation) |
| `POST` | `/api/auth/logout` | 로그아웃 |
| `POST` | `/api/auth/logout-all` | 전체 세션 폐기 (JWT 필요) |

### 🛠️ Admin (JWT `Bearer` required)

블로그/포트폴리오 CRUD — Swagger UI 참고

## 🔒 Security

- **API Key** — 공개 API 인증 (`x-api-key` 헤더)
- **JWT** — 어드민 API 인증 (`Authorization: Bearer` 헤더)
- **Refresh Token** — DB 해시 저장, Token Rotation, 7일 만료
- **IP Binding** — 다른 IP에서 refresh 시도 시 전체 세션 폐기
- **IP Whitelist** — 어드민 API 접근 IP 제한 (`ADMIN_IP_WHITELIST`)
- **Rate Limiting** — IP당 60초/100 요청
- **CORS** — 허용 도메인만 (`ALLOWED_ORIGINS`)
- **Helmet** — HTTP 보안 헤더

## 🚢 Deploy

`main` 브랜치에 push → GitHub Actions → Tailscale SSH → Mac mini Docker 자동 배포

```bash
# Mac mini에서 수동 배포
docker compose -f docker-compose.yml -f docker-compose.prod.yml build api
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 📄 License

Private — [chahyunwoo](https://github.com/chahyunwoo)
