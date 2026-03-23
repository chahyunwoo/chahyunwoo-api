# chahyunwoo API Server

## 프로젝트 개요
chahyunwoo.dev 블로그 & 포트폴리오 백엔드 API.
맥미니 홈서버에 Docker로 배포. GitHub Actions + Tailscale SSH 자동 배포.

## 기술 스택
- **Runtime**: Node.js 22
- **Framework**: NestJS 10 + Fastify 어댑터
- **ORM**: Prisma 6 (multi-schema: blog / portfolio)
- **DB**: PostgreSQL 16
- **Auth**: JWT (단일 어드민, env vars로 관리)
- **Storage**: Cloudflare R2 (이미지, 맥미니 정전 대비)
- **Package manager**: pnpm

## 로컬 개발 시작
```bash
pnpm install
cp .env.example .env         # 환경변수 채우기
make hash-password PASSWORD=yourpassword  # ADMIN_PASSWORD_HASH 생성
pnpm db:migrate:dev --name init           # 첫 마이그레이션 (DB 필요)
pnpm start:dev
```

## 폴더 구조
```
src/
├── main.ts                  # 앱 진입점 (Fastify, Swagger, CORS)
├── app.module.ts
├── health.controller.ts     # GET /health
├── blog/                    # 블로그 도메인 (완전 구현)
│   ├── blog.module.ts
│   ├── blog.controller.ts
│   ├── blog.service.ts
│   └── dto/
├── portfolio/               # 포트폴리오 도메인 (GET 뼈대)
├── auth/                    # JWT 로그인
├── prisma/                  # Global PrismaService
├── storage/                 # Global StorageService (R2)
└── common/                  # JwtAuthGuard, @Public(), ExceptionFilter
prisma/
└── schema.prisma            # blog + portfolio 스키마
```

## API 엔드포인트
### 공개
- `GET /health`
- `GET /api/blog/posts` — 목록 (page, limit, category, tag)
- `GET /api/blog/posts/search` — 검색 (?q=)
- `GET /api/blog/posts/:slug` — 상세 (MDX 포함)
- `GET /api/blog/categories` — 카테고리 + 태그
- `GET /api/portfolio/experiences`
- `GET /api/portfolio/projects` (?featured=true)
- `GET /api/portfolio/skills`
- `GET /api/portfolio/education`

### 어드민 (JWT Bearer 필요)
- `POST /api/auth/login` (2FA 활성화 시 → `{ requiresTwoFactor, twoFactorToken }`)
- `POST /api/auth/2fa/verify` (twoFactorToken + TOTP 코드 → JWT 발급)
- `POST /api/auth/2fa/setup` (QR 코드 + secret 반환, 어드민 전용)
- `POST /api/blog/posts`
- `PUT /api/blog/posts/:slug`
- `DELETE /api/blog/posts/:slug`
- `POST /api/blog/posts/:slug/thumbnail` (multipart)

### Swagger UI
개발 환경에서만 노출: `http://localhost:4000/docs`

## 브랜치 전략
- `main` — 프로덕션
- `dev` — 통합 브랜치
- `feature/{ISSUE-KEY}` — 기능 브랜치 (dev에서 분기)

## 배포
- Push to main → GitHub Actions → Tailscale SSH → 맥미니 Docker
- Prisma migration은 컨테이너 시작 시 자동 실행 (`scripts/start.sh`)

## 환경변수 (.env.example 참고)
| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL 커넥션 스트링 |
| `JWT_SECRET` | JWT 서명 키 (32바이트 랜덤) |
| `ADMIN_USERNAME` | 어드민 아이디 |
| `ADMIN_PASSWORD_HASH` | bcrypt 해시 (`make hash-password`) |
| `R2_*` | Cloudflare R2 자격증명 |
| `ALLOWED_ORIGINS` | CORS 허용 오리진 (콤마 구분) |

## 현재 남은 작업
- [ ] 포트폴리오 어드민 CRUD (나중에)
- [ ] 검색 성능 개선: pg_trgm 인덱스 마이그레이션 (필요 시)
- [ ] 프론트 연동 후 openapi-typescript 타입 생성 설정
