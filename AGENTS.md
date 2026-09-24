# AGENTS.md — chahyunwoo API Server

에이전트 공용 규칙(Claude Code·Codex 공통). Claude 전용 지시는 `CLAUDE.md` 에 있다.

## 프로젝트 개요
chahyunwoo.dev 블로그 & 포트폴리오 백엔드 API.
맥미니 홈서버에 Docker로 배포. GitHub Actions + Tailscale SSH 자동 배포.

## 정본 위치
스택·구조·엔드포인트·환경변수는 여기 옮겨 적지 않는다 — 옮겨 적은 사본이 낡아서 틀렸었다.
- 스택·버전: `package.json` / 스키마: `prisma/schema.prisma`
- 엔드포인트: `openapi.json` / 환경변수: `.env.example` / 로컬 실행: `README.md`
- Prisma migration 은 컨테이너 시작 시 자동 실행된다(`scripts/start.sh`)

## API 문서
Swagger UI 는 개발 환경에서만 노출: `http://localhost:4000/docs` (JSON은 `/docs-json`)

`openapi.json` — 프론트(`hyunwoo-dev`)가 이 파일에서 API 타입을 생성한다. 저장소가 분리돼 있어 파일로 커밋해 둔다.

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

## 작업 사이클

전역 표준을 따른다 — **이슈 → `feature/{이슈번호}-{설명}` → conventional commits(**제목은 명사형** — `~한다` 서술형 금지) → PR `Closes #N` → 리뷰 → 병합 → `/handoff`**.
(정본: `~/.claude/rules/git-workflow.md`. Codex 는 전역 규칙을 못 읽으므로 이 저장소의 값을 여기 적어 둔다.)

| | |
|---|---|
| 트래커 | GitHub Issues (`chahyunwoo/chahyunwoo-api`) |
| 분기 기준 | `dev` |
| 승격 경로 | `feature/* → dev → main` |
| 병합 위임 | **전부 위임** |
| 리뷰어 | 전역 `code-reviewer` |
| 검증 | `.claude/verify.sh` |
| 푸시 = 배포? | 🔴 **예 — `main` 푸시가 곧 프로덕션 배포다**(Actions → Tailscale SSH → 맥미니 Docker). 되돌릴 곳이 없으니 `dev` 검증 후에만 |

⚠️ `stg` 는 **의도적으로 없다**(빠뜨린 게 아니다) — 기여자 1명·동시 feature 없음이라 단계를 늘리면 병합만 는다.
대신 `main` 승격 전 `dev` 검증이 유일한 관문이다(`.github/workflows/deploy.yml`).
