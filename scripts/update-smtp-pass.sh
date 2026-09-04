#!/usr/bin/env bash
# Gmail 앱 비밀번호를 맥미니 운영 서버에 안전하게 반영한다.
#
# 값은 이 셸 안에서만 존재한다 — 화면에 찍히지 않고(read -s), 셸 히스토리에도
# 남지 않으며(인자가 아니라 표준입력), 어떤 로그에도 기록되지 않는다.
#
# 사용법:  bash scripts/update-smtp-pass.sh
set -euo pipefail

# 배포 서버 호스트는 저장소에 두지 않는다(공개 저장소). SSH config 의 Host 별칭을
# 환경변수로 넘긴다.  예)  SMTP_TARGET_HOST=<별칭> bash scripts/...
HOST="${SMTP_TARGET_HOST:?SMTP_TARGET_HOST 를 지정하라 (예: SMTP_TARGET_HOST=myserver)}"
DOCKER="/usr/local/bin/docker"
ENVFILE="~/api-server/.env.prod"

echo "대상 서버: $HOST"
echo "Gmail 앱 비밀번호를 입력하세요 (화면에 표시되지 않습니다)."
echo "  https://myaccount.google.com/apppasswords 에서 발급한 16자"
echo "  공백이 포함돼 있어도 됩니다 — 자동으로 제거합니다."
printf "앱 비밀번호: "
read -rs RAW
echo

# 공백 제거 후 검증
PASS="${RAW// /}"
if [ ${#PASS} -ne 16 ]; then
  echo "✗ 공백을 제거한 길이가 ${#PASS}자입니다. Gmail 앱 비밀번호는 16자여야 합니다." >&2
  exit 1
fi
if ! printf '%s' "$PASS" | grep -qE '^[a-z]{16}$'; then
  echo "✗ 형식이 예상과 다릅니다(소문자 16자여야 함). 오타가 없는지 확인하세요." >&2
  exit 1
fi
echo "✓ 형식 확인: 16자"

# 백업 (타임스탬프)
STAMP=$(date +%Y%m%d-%H%M%S)
echo "→ 백업 생성 중..."
ssh "$HOST" "cp -p $ENVFILE $ENVFILE.bak-$STAMP && ls -la $ENVFILE.bak-$STAMP"

# 값을 표준입력으로만 넘긴다 (ssh 명령 인자로 노출되지 않음)
echo "→ SMTP_PASS 교체 중..."
printf '%s' "$PASS" | ssh "$HOST" "cat > /tmp/.smtp_new && \
  python3 - <<'PY'
import re, os
p = os.path.expanduser('~/api-server/.env.prod')
new = open('/tmp/.smtp_new').read().strip()
s = open(p, encoding='utf-8').read()
m = re.search(r'^SMTP_PASS=(.*)\$', s, re.M)
assert m, 'SMTP_PASS 줄을 찾지 못했다'
old_line = m.group(0)
assert s.count(old_line) == 1, '앵커가 유일하지 않다'
s = s.replace(old_line, 'SMTP_PASS=' + new)
open(p, 'w', encoding='utf-8').write(s)
print('치환 완료: 길이', len(new))
PY
  rm -f /tmp/.smtp_new"

# 반영 확인 (값이 아니라 길이만)
echo "→ 파일 반영 확인..."
ssh "$HOST" "awk -F= '/^SMTP_PASS=/{v=substr(\$0,index(\$0,\"=\")+1); print \"  파일 내 길이: \" length(v) \"자, 공백 \" gsub(/ /,\"\",v) \"개\"}' $ENVFILE"

# 재시작
echo "→ api 컨테이너 재시작..."
ssh "$HOST" "cd ~/api-server && $DOCKER compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml up -d api" 2>&1 | tail -3

echo "→ 기동 대기..."
ssh "$HOST" "for i in \$(seq 1 30); do
  st=\$($DOCKER inspect api-server-api-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo starting)
  [ \"\$st\" = healthy ] && echo '  healthy' && exit 0
  sleep 2
done; echo '  ✗ healthy 되지 않음'; exit 1"

echo
echo "✓ 반영 완료. 이제 다음을 실행해 실제 메일 발송까지 확인하세요:"
echo "    bash scripts/verify-smtp.sh"
