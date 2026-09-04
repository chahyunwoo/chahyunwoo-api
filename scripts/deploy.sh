#!/bin/sh
# 맥미니에서 도는 배포 스크립트. deploy.yml 이 ssh 로 이 파일을 실행한다.
#
# 왜 이 파일이 따로 있는가:
#   워크플로 YAML 안의 heredoc 은 문법 검사도, 로컬 실행도 안 된다.
#   배포 로직이 길어지면(롤백·백업·헬스체크) 거기 두는 것은 위험하다.
#
# 되돌리기 전략:
#   1. 빌드 전에 현재 이미지를 :previous 로 태그해 둔다.
#      (예전에는 `docker image prune -f` 가 빌드 직후 무조건 돌아
#       되돌릴 이미지를 지웠다 — 그래서 롤백 자체가 불가능했다)
#   2. 헬스체크가 실패하면 :previous 로 되돌리고 다시 띄운다.
#   3. 되돌린 뒤 한 번 더 헬스체크해서, 롤백이 성공했는지까지 확인한다.
#
# ⚠️ 스키마는 되돌리지 않는다. 컨테이너 기동 시 `prisma migrate deploy` 가
#    돌기 때문에, 이미지를 되돌려도 **DB 는 새 스키마 그대로**다. 파괴적
#    마이그레이션(컬럼 삭제 등)이 섞인 배포는 이 스크립트로 온전히 복구되지
#    않는다. 그래서 배포 전 pg_dump 를 남긴다 — 복원은 사람이 판단해서 한다.
set -eu

APP_DIR="${APP_DIR:-$HOME/api-server}"
HEALTH_URL="${HEALTH_URL:-http://localhost:4000/health}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/api-server-backups}"
IMAGE="${IMAGE:-api-server-api}"
DB_CONTAINER="${DB_CONTAINER:-api-server-db-1}"
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"

COMPOSE="docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml"

cd "$APP_DIR"

log() { echo "[deploy] $*"; }

wait_healthy() {
  # 20회 × 3초 = 최대 60초.
  i=1
  while [ "$i" -le 20 ]; do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      log "health OK (${i}회째)"
      return 0
    fi
    i=$((i + 1))
    sleep 3
  done
  return 1
}

# ─── 1. DB 백업 ──────────────────────────────────────────────────────────────
# 운영 DB 11MB / 덤프 약 300KB 라 비용이 사실상 없다.
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$BACKUP_DIR/hyunwoo-$STAMP.sql.gz"

log "DB 백업 -> $DUMP"

# 파이프로 바로 gzip 하면 안 된다. `pg_dump | gzip` 의 종료 상태는 **gzip 의 것**이라
# pg_dump 가 죽어도 성공으로 읽힌다. 게다가 빈 입력을 gzip 하면 20바이트짜리
# 파일이 나와서 `[ -s ]` 검사마저 통과한다(실측). 그래서 먼저 압축하지 않고 받아
# 종료 상태와 크기를 각각 확인한 뒤 압축한다.
RAW="$DUMP.tmp"
# shellcheck disable=SC2016
if ! docker exec "$DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$RAW" 2>/dev/null; then
  log "!! pg_dump 실패 — 배포를 중단한다"
  rm -f "$RAW"
  exit 1
fi

if [ ! -s "$RAW" ]; then
  log "!! 덤프가 비었다 — 배포를 중단한다"
  rm -f "$RAW"
  exit 1
fi

gzip -c "$RAW" > "$DUMP"
rm -f "$RAW"
log "백업 완료 ($(wc -c < "$DUMP" | tr -d ' ') bytes)"

# 오래된 백업 정리 (최근 KEEP_BACKUPS개만 남긴다)
ls -1t "$BACKUP_DIR"/hyunwoo-*.sql.gz 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | while read -r old; do
  log "오래된 백업 삭제: $(basename "$old")"
  rm -f "$old"
done

# ─── 2. 현재 이미지를 :previous 로 보존 ──────────────────────────────────────
if docker image inspect "$IMAGE:latest" >/dev/null 2>&1; then
  docker tag "$IMAGE:latest" "$IMAGE:previous"
  log "현재 이미지를 $IMAGE:previous 로 보존"
  HAVE_PREVIOUS=1
else
  log "이전 이미지가 없다 (첫 배포로 보인다) — 롤백 대상 없음"
  HAVE_PREVIOUS=0
fi

# ─── 3. 코드 갱신 후 빌드 ────────────────────────────────────────────────────
git pull origin main
$COMPOSE build --no-cache api
$COMPOSE up -d

# ─── 4. 헬스체크, 실패하면 되돌린다 ──────────────────────────────────────────
if wait_healthy; then
  log "배포 성공"
  # prune 은 태그 없는(dangling) 이미지만 지운다. :previous 는 태그가 있어 남는다.
  # 예전의 `docker image prune -f` 는 되돌릴 이미지까지 지우고 있었다.
  docker image prune -f >/dev/null 2>&1 || true
  exit 0
fi

log "!! 헬스체크 실패 (60초)"
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml logs --tail 50 api || true

if [ "$HAVE_PREVIOUS" -eq 0 ]; then
  log "!! 되돌릴 이미지가 없다 — 수동 조치가 필요하다"
  exit 1
fi

log "이전 이미지로 되돌린다"
docker tag "$IMAGE:previous" "$IMAGE:latest"
$COMPOSE up -d --force-recreate api

if wait_healthy; then
  log "롤백 성공 — 이전 버전으로 서비스 중이다"
  log "⚠️ 스키마는 되돌리지 않았다. 마이그레이션이 섞인 배포였다면 $DUMP 로 복원을 검토할 것"
  exit 1   # 배포 자체는 실패다. 초록으로 끝내면 안 된다.
fi

log "!! 롤백까지 실패했다 — 수동 조치가 필요하다"
log "   백업: $DUMP"
exit 1
