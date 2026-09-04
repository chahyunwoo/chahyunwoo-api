#!/usr/bin/env bash
# SMTP 설정이 실제로 동작하는지 확인한다.
# 문의 1건을 보내고 서버 로그에서 535 인증 오류가 사라졌는지 본다.
set -euo pipefail

# 배포 서버 호스트는 저장소에 두지 않는다(공개 저장소). SSH config 의 Host 별칭을
# 환경변수로 넘긴다.  예)  SMTP_TARGET_HOST=<별칭> bash scripts/...
HOST="${SMTP_TARGET_HOST:?SMTP_TARGET_HOST 를 지정하라 (예: SMTP_TARGET_HOST=myserver)}"
DOCKER="/usr/local/bin/docker"
API="https://api.chahyunwoo.dev"

echo "→ 포트폴리오 번들에서 API 키 추출..."
KEY=$(curl -s -m 25 https://portfolio.chahyunwoo.dev/ \
  | grep -oE '/_next/static/[a-zA-Z0-9./_-]+\.js' | sort -u \
  | while read -r c; do
      curl -s -m 20 "https://portfolio.chahyunwoo.dev$c" \
        | grep -oE '"x-api-key":"[0-9a-f]{64}"' | head -1
    done | head -1 | sed -E 's/.*"x-api-key":"([0-9a-f]{64})".*/\1/')

if [ -z "$KEY" ]; then echo "✗ API 키를 찾지 못했다" >&2; exit 1; fi
echo "  키 확보 (${#KEY}자)"

STAMP=$(date +%s)
echo "→ 테스트 문의 전송..."
CODE=$(curl -s -m 25 -o /dev/null -w '%{http_code}' -X POST "$API/api/portfolio/contact" \
  -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -H 'Origin: https://portfolio.chahyunwoo.dev' \
  -d "{\"name\":\"SMTP 검증\",\"email\":\"smtp-check-$STAMP@example.com\",\"subject\":\"[TEST] SMTP 검증 $STAMP\",\"message\":\"앱 비밀번호 교체 후 메일 발송이 정상인지 확인하는 테스트입니다. 확인 후 삭제해 주세요.\"}")
echo "  HTTP $CODE"

echo "→ 발송 결과 대기 (10초)..."
sleep 10

echo "→ 서버 로그 확인..."
LOG=$(ssh "$HOST" "$DOCKER logs api-server-api-1 --since 2m 2>&1 | grep -iE 'mail|535|contact' | tail -5" || true)
if printf '%s' "$LOG" | grep -q '535'; then
  echo "  ✗ 여전히 인증 실패:"
  printf '%s\n' "$LOG" | sed 's/^/    /'
  exit 1
elif [ -z "$LOG" ]; then
  echo "  ✓ 메일 관련 오류 로그 없음 (발송 성공으로 판단)"
else
  printf '%s\n' "$LOG" | sed 's/^/    /'
fi

echo "→ DB 저장 확인..."
ssh "$HOST" "$DOCKER exec api-server-db-1 psql -U chwzp -d hyunwoo -t -c \
  \"SELECT id || ' | ' || name || ' | ' || subject FROM portfolio.contact_messages ORDER BY id DESC LIMIT 3;\""

echo
echo "✓ 검증 끝. 받은편지함에 '[TEST] SMTP 검증 $STAMP' 메일이 왔는지 확인하세요."
echo "  왔다면 테스트 문의 정리:"
echo "    ssh $HOST \"$DOCKER exec api-server-db-1 psql -U chwzp -d hyunwoo -c \\\"DELETE FROM portfolio.contact_messages WHERE email LIKE 'smtp-check-%';\\\"\""
