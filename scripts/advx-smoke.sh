#!/usr/bin/env bash
# ADVX 端到端冒烟脚本：验证安全会话 → 建队 → 加 4 队员 → 配工具 → 试跑 → 封存版本 → 列版本
set -euo pipefail

BASE="${ADVX_BASE:-http://127.0.0.1:3100/api/advx}"
HEALTH_URL="${ADVX_HEALTH_URL:-${BASE%/api/advx}/api/health}"
: "${ADVX_SMOKE_TEST_ONLY:?Set ADVX_SMOKE_TEST_ONLY=1 for an isolated non-production smoke}"
[ "$ADVX_SMOKE_TEST_ONLY" = "1" ] || { echo "FAIL: test-only guard must equal 1" >&2; exit 1; }
: "${ADVX_SMOKE_COOKIE_FILE:?Inject a synthetic non-production session cookie file}"
[ -f "$ADVX_SMOKE_COOKIE_FILE" ] && [ -r "$ADVX_SMOKE_COOKIE_FILE" ] || { echo "FAIL: session cookie file is not readable" >&2; exit 1; }

COOKIE_MODE=$(python3 - "$ADVX_SMOKE_COOKIE_FILE" <<'PY'
import os
import stat
import sys

print(oct(stat.S_IMODE(os.stat(sys.argv[1]).st_mode))[2:])
PY
)
[ "$COOKIE_MODE" = "600" ] || { echo "FAIL: session cookie file must have mode 0600" >&2; exit 1; }

python3 - "$BASE" "$HEALTH_URL" <<'PY'
import sys
from urllib.parse import urlsplit

base = urlsplit(sys.argv[1])
health = urlsplit(sys.argv[2])
allowed_host = base.hostname in {"localhost", "127.0.0.1", "::1"} or (base.hostname or "").endswith(".test")
valid = base.scheme in {"http", "https"} and allowed_host and not base.username and not base.password
valid = valid and base.path.rstrip("/").endswith("/api/advx") and not base.query and not base.fragment
valid = valid and health.scheme == base.scheme and health.netloc == base.netloc and health.path == "/api/health"
valid = valid and not health.query and not health.fragment
if not valid:
    raise SystemExit("FAIL: ADVX smoke origins must be loopback or a reserved .test host")
PY

PASS=0
FAIL=0

step() { printf "\n\033[1;36m=== %s ===\033[0m\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }

get_json_field() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1',''))"; }
member_id_for_role() { python3 -c "import json,sys; role='$1'; print(next((m.get('id','') for m in json.load(sys.stdin) if m.get('roleTemplate') == role), ''))"; }
curl_json() { curl --silent --show-error --cookie "$ADVX_SMOKE_COOKIE_FILE" -H 'Accept: application/json' "$@"; }
ensure_member() {
  local role="$1" name="$2" existing
  existing=$(curl_json "$BASE/teams/$TEAM/members" | member_id_for_role "$role")
  if [ -n "$existing" ]; then
    printf '%s' "$existing"
  else
    curl_json -X POST "$BASE/teams/$TEAM/members" -H 'Content-Type: application/json' -d "{\"name\":\"$name\",\"roleTemplate\":\"$role\"}" | get_json_field "id"
  fi
}

step "1. 验证队长安全会话"
SESSION_VALID=$(curl_json "$BASE/session" | python3 -c "import json,sys; d=json.load(sys.stdin); valid=d.get('authenticated') is True and d.get('authMode') in ('signed_in','local_demo') and isinstance(d.get('captain'),dict); print('true' if valid else 'false')")
[ "$SESSION_VALID" = "true" ] && ok "队长安全会话有效" || bad "安全会话失败"

step "2. 创建队伍"
TEAM=$(curl_json -X POST "$BASE/teams" -H 'Content-Type: application/json' -d '{"name":"冒烟测试队","description":"smoke"}' | get_json_field "id")
[ -n "$TEAM" ] && ok "建队成功" || bad "建队失败"

step "3. 加 4 个队员（四角色模板）"
SCOUT=$(ensure_member "scout" "小雷达")
INVENTOR=$(ensure_member "inventor" "主意王")
BUILDER=$(ensure_member "builder" "小工匠")
CRITIC=$(ensure_member "critic" "挑刺猫")
[ -n "$SCOUT" ] && [ -n "$INVENTOR" ] && [ -n "$BUILDER" ] && [ -n "$CRITIC" ] && ok "4 队员已加" || bad "加队员失败"

step "4. 给侦察员改工具"
curl_json -X PATCH "$BASE/teams/$TEAM/members/$SCOUT" -H 'Content-Type: application/json' -d '{"tools":["search","read-file","browse"]}' | get_json_field "name" | grep -q "小雷达" && ok "改工具" || bad "改工具失败"

step "5. 列出队员"
COUNT=$(curl_json "$BASE/teams/$TEAM/members" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
[ "$COUNT" -ge 4 ] && ok "队员数=$COUNT" || bad "队员数=$COUNT"

step "6. 检查响应无预算/成本字段"
BODY=$(curl_json "$BASE/teams/$TEAM")
if echo "$BODY" | grep -qiE "budget|cost|credit|spend"; then bad "响应含预算字段"; else ok "响应无预算字段"; fi
MEMBERS_BODY=$(curl_json "$BASE/teams/$TEAM/members")
if echo "$MEMBERS_BODY" | grep -qiE "budget|cost|credit|spend"; then bad "队员响应含预算字段"; else ok "队员响应无预算字段"; fi

step "7. 检查响应不暴露模型配置"
if echo "$BODY" | grep -qiE '"model"|temperature|max_tokens'; then bad "响应含模型配置"; else ok "响应无模型配置"; fi

step "8. 发起 hello-team 试跑"
RUN_ID=$(curl_json -X POST "$BASE/teams/$TEAM/test-runs" -H 'Content-Type: application/json' -d '{"testTaskSlug":"hello-team"}' | get_json_field "runId")
[ "$RUN_ID" != "null" ] && [ -n "$RUN_ID" ] && ok "试跑已排队" || bad "试跑未排队"

step "9. 查询试跑结果"
sleep 2
RUN_STATUS=$(curl_json "$BASE/test-runs/$RUN_ID" | get_json_field "status")
[ -n "$RUN_STATUS" ] && ok "试跑查询 status=$RUN_STATUS" || bad "试跑查询失败"

step "10. 封存版本"
VERSION_ID=$(curl_json -X POST "$BASE/teams/$TEAM/versions" -H 'Content-Type: application/json' -d '{"label":"冒烟v1"}' | get_json_field "id")
[ -n "$VERSION_ID" ] && ok "封存版本" || bad "封存版本失败"

step "11. 列出版本"
VCOUNT=$(curl_json "$BASE/teams/$TEAM/versions" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
[ "$VCOUNT" -ge 1 ] && ok "版本数=$VCOUNT" || bad "版本数=$VCOUNT"

step "12. 活动记录"
ACOUNT=$(curl_json "$BASE/teams/$TEAM/activity?limit=20" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
[ "$ACOUNT" -ge 1 ] && ok "活动记录数=$ACOUNT" || bad "活动记录为空"

step "13. 健康检查"
curl_json "$HEALTH_URL" | grep -q '"status":"ok"' && ok "health ok" || bad "health fail"

printf "\n\033[1m冒烟结果：通过 %d / 失败 %d\033[0m\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
