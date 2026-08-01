#!/usr/bin/env bash
# Arena end-to-end smoke. Start the server with ADVX_ARENA_ALLOW_MOCK=true for the default non-official path.
set -euo pipefail

BASE="${ADVX_BASE:-http://127.0.0.1:3100/api/advx}"
API="$BASE/arena"
EXPECT_OFFICIAL="${ADVX_ARENA_EXPECT_OFFICIAL:-false}"
TIMEOUT_SECONDS="${ADVX_ARENA_SMOKE_TIMEOUT:-120}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

json_field() {
  python3 -c 'import json,sys
value=json.load(sys.stdin)
for part in sys.argv[1].split("."):
    value=value.get(part) if isinstance(value,dict) else None
print("" if value is None else (str(value).lower() if isinstance(value,bool) else value))' "$1"
}

echo "[arena-smoke] checking Arena health"
HEALTH="$(curl -fsS "${BASE%/advx}/health")"
echo "$HEALTH" | python3 -c 'import json,sys
d=json.load(sys.stdin); a=d.get("arena", {})
assert d.get("status")=="ok"
assert a.get("enabled") is True
assert a.get("singleServerOnly") is True
assert a.get("modelAvailable") is True'
if [ "$EXPECT_OFFICIAL" = "false" ]; then
  echo "$HEALTH" | python3 -c 'import json,sys; assert json.load(sys.stdin)["arena"]["mockEnabled"] is True'
fi

echo "[arena-smoke] ensuring a team and version"
TEAMS="$(curl -fsS "$BASE/teams")"
TEAM_ID="$(echo "$TEAMS" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')"
if [ -z "$TEAM_ID" ]; then
  TEAM_ID="$(curl -fsS -X POST "$BASE/teams" -H 'Content-Type: application/json' -d '{"name":"Arena Smoke Team","description":"Arena integration smoke"}' | json_field id)"
fi
MEMBER_COUNT="$(curl -fsS "$BASE/teams/$TEAM_ID/members" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
if [ "$MEMBER_COUNT" -eq 0 ]; then
  curl -fsS -X POST "$BASE/teams/$TEAM_ID/members" -H 'Content-Type: application/json' -d '{"name":"Smoke Builder","roleTemplate":"builder"}' >/dev/null
fi
VERSION_ID="$(curl -fsS -X POST "$BASE/teams/$TEAM_ID/versions" -H 'Content-Type: application/json' -d '{"label":"Arena smoke snapshot"}' | json_field id)"

echo "[arena-smoke] selecting the official challenge"
CHALLENGES="$(curl -fsS "$API/challenges")"
CHALLENGE_ID="$(echo "$CHALLENGES" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next((x["challengeVersionId"] for x in d if x["status"]=="open"), ""))')"
test -n "$CHALLENGE_ID"
ENCODED_CHALLENGE="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$CHALLENGE_ID")"
curl -fsS "$API/challenges/$ENCODED_CHALLENGE" >"$TMP_DIR/challenge.json"
python3 - "$TMP_DIR/challenge.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1], encoding="utf-8"))
expected=[("需求符合度",200),("规则遵循",150),("代码/实现质量",150),("创新性",150),("趣味性/体验感",100),("视觉/审美",100),("问题解决能力",100),("完成度与细节",50)]
assert [(x["name"],x["maxScore"]) for x in d["dimensions"]]==expected
assert all("weight" not in x for x in d["dimensions"])
PY

python3 - "$TMP_DIR/submission.zip" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr("index.html", "<main><h1>Todo</h1><input id='todo'><button>Add</button><ul></ul></main>")
    z.writestr("app.js", "const todos=[]; function addTodo(text){todos.push(text);localStorage.setItem('todos',JSON.stringify(todos));}")
    z.writestr("style.css", "body{font-family:system-ui;max-width:48rem;margin:auto} @media(max-width:40rem){body{padding:1rem}}")
PY

echo "[arena-smoke] uploading a team-scoped submission"
curl -fsS -X POST "$API/challenges/$ENCODED_CHALLENGE/submissions" \
  -F "file=@$TMP_DIR/submission.zip;type=application/zip" \
  -F "teamVersionId=$VERSION_ID" >"$TMP_DIR/submission.json"
SUBMISSION_ID="$(json_field id <"$TMP_DIR/submission.json")"
test -n "$SUBMISSION_ID"

echo "[arena-smoke] starting once and proving idempotent reuse"
curl -fsS -X POST "$API/submissions/$SUBMISSION_ID/runs" >"$TMP_DIR/start-1.json" &
START_PID_1=$!
curl -fsS -X POST "$API/submissions/$SUBMISSION_ID/runs" >"$TMP_DIR/start-2.json" &
START_PID_2=$!
wait "$START_PID_1"
wait "$START_PID_2"
RUN_ID="$(json_field runId <"$TMP_DIR/start-1.json")"
RUN_ID_2="$(json_field runId <"$TMP_DIR/start-2.json")"
test "$RUN_ID" = "$RUN_ID_2"
python3 - "$TMP_DIR/start-1.json" "$TMP_DIR/start-2.json" <<'PY'
import json,sys
values=[json.load(open(path, encoding="utf-8"))["reused"] for path in sys.argv[1:]]
assert sorted(values)==[False, True], values
PY

echo "[arena-smoke] polling run $RUN_ID"
STARTED_AT="$(date +%s)"
while :; do
  curl -fsS "$API/runs/$RUN_ID" >"$TMP_DIR/run.json"
  STATUS="$(json_field status <"$TMP_DIR/run.json")"
  case "$STATUS" in
    completed) break ;;
    failed|cancelled)
      echo "Arena run ended as $STATUS" >&2
      cat "$TMP_DIR/run.json" >&2
      exit 1
      ;;
  esac
  NOW="$(date +%s)"
  if [ $((NOW - STARTED_AT)) -ge "$TIMEOUT_SECONDS" ]; then
    echo "Arena run timed out in smoke" >&2
    exit 1
  fi
  sleep 1
done

echo "[arena-smoke] validating public score and evidence"
curl -fsS "$API/runs/$RUN_ID/result" >"$TMP_DIR/result.json"
python3 - "$EXPECT_OFFICIAL" "$TMP_DIR/result.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[2], encoding="utf-8"))
expected=sys.argv[1].lower()=="true"
assert d["official"] is expected
assert d["totalMaxScore"]==1000
expected=[("需求符合度",200),("规则遵循",150),("代码/实现质量",150),("创新性",150),("趣味性/体验感",100),("视觉/审美",100),("问题解决能力",100),("完成度与细节",50)]
assert [(x["name"],x["maxScore"]) for x in d["dimensions"]]==expected
assert sum(x["score"] for x in d["dimensions"])==d["totalScore"]
assert 0 <= d["totalScore"] <= 1000
for dimension in d["dimensions"]:
    assert sum(x["score"] for x in dimension["subScores"])==dimension["score"]
    assert dimension["review"]["delta"]==abs(dimension["review"]["primaryScore"]-dimension["review"]["independentScore"])
    assert dimension["review"]["adjudicated"] is True
    for sub in dimension["subScores"]:
        if sub["score"] > 0:
            assert sub["evidence"]
            assert all(e["verified"] and e["path"] and e["lineStart"] >= 1 for e in sub["evidence"])
PY

echo "[arena-smoke] checking response redaction"
cat "$TMP_DIR/challenge.json" "$TMP_DIR/submission.json" "$TMP_DIR/start-1.json" "$TMP_DIR/run.json" "$TMP_DIR/result.json" >"$TMP_DIR/public-responses.txt"
if grep -Eqi 'filePath|objectKey|agentRunLog|rawContent|modelCalls|temperature|max_tokens|baseUrl|providerUrl|budget|credits|spend|tokenUsage|costUsd' "$TMP_DIR/public-responses.txt"; then
  echo "A forbidden internal field appeared in an Arena response" >&2
  exit 1
fi

echo "[arena-smoke] checking sanitized activity"
curl -fsS "$BASE/teams/$TEAM_ID/activity?limit=200" >"$TMP_DIR/activity.json"
python3 - "$TMP_DIR/activity.json" <<'PY'
import json,sys
actions={x["action"] for x in json.load(open(sys.argv[1], encoding="utf-8"))}
for required in ["arena.submission_created", "arena.run_started", "arena.scorecard_created"]:
    assert required in actions, (required, actions)
PY

echo "[arena-smoke] PASS run=$RUN_ID official=$EXPECT_OFFICIAL"
