# chahyunwoo API Server

## 프로젝트 개요
chahyunwoo.dev 블로그 & 포트폴리오 백엔드 API.
맥미니 홈서버에 Docker로 배포. GitHub Actions + Tailscale SSH 자동 배포.

## 기술 스택
- **Runtime**: Node.js 22
- **Framework**: NestJS 11 + Fastify 어댑터
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
개발 환경에서만 노출: `http://localhost:4000/docs` (JSON은 `/docs-json`)

### OpenAPI 스펙 (`openapi.json`)
프론트(`hyunwoo-dev`)가 이 파일에서 API 타입을 생성한다. 저장소가 분리돼 있어 파일로 커밋해 둔다.

```bash
pnpm openapi:generate    # scripts/generate-openapi.ts → 루트 openapi.json
```

- 앱을 listen하지 않고 문서만 만든다 → `onModuleInit`이 안 돌아 **DB 접속이 없다**. 다만 provider
  생성자의 `config.getOrThrow` 때문에 env 값 자체는 있어야 한다(로컬 `.env`, CI는 더미).
- Swagger 설정은 `src/common/swagger/swagger.config.ts` 한 곳에서만 만든다. `/docs`와
  `openapi.json`이 각자 `DocumentBuilder`를 들면 스펙이 조용히 갈라진다.
- **DTO를 바꾸면 `pnpm openapi:generate` 후 같이 커밋해야 한다.** CI의 `OpenAPI spec drift check`가
  검사한다.
- 생성물이라 biome 검사 대상에서 제외돼 있다(`biome.json`의 `!openapi.json`).

## 브랜치 전략
- `main` — 프로덕션
- `dev` — 통합 브랜치
- `feature/{ISSUE-KEY}` — 기능 브랜치 (dev에서 분기)

`stg`는 의도적으로 두지 않는다(빠뜨린 게 아니다). 기여자가 1명이고 feature가 동시에 진행되지
않아 단계를 하나 더 두면 병합만 늘고 얻는 게 없다. 대신 **`main` 푸시가 곧 프로덕션 배포**이므로
(`.github/workflows/deploy.yml`), `dev`에서 검증을 끝내고 승인받은 뒤에만 `main`으로 올린다.
검증 없이 `main`에 올리면 되돌릴 곳이 없다.

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
- [x] 프론트 연동 후 openapi-typescript 타입 생성 설정 — 파이프라인 구축 완료 (#102)
- [ ] **나머지 라우트의 Response DTO** — 72개 오퍼레이션 중 성공 응답 스키마가 있는 건
      `GET /api/blog/posts` 1개뿐이다. 나머지는 프론트가 타입을 생성해도 응답이 비어 쓸 수 없다.
      확인: `jq -r '[.paths | to_entries[] | .key as $p | .value | to_entries[] | select(.value.responses["200"].content) | "\($p) \(.key)"] | .[]' openapi.json`
- [ ] 테스트 0건 — `pnpm test`가 `--passWithNoTests`라 CI Test 스텝이 항상 초록인데 아무것도 검사하지 않는다
