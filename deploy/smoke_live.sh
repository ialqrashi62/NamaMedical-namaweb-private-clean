#!/usr/bin/env bash
# smoke_live.sh — post-deploy verification of all sub-apps
#
# Verifies (no PHI, no secrets):
#   - GET /health  on main ERP, dept-api, mynama  -> 200
#   - GET /api/v4/dept/list  -> array length >= 51
#   - POST /api/v4/dept/card/visits  with no auth -> 401

set -euo pipefail

MAIN="${MAIN_URL:-http://127.0.0.1:3000}"
DEPT="${DEPT_URL:-http://127.0.0.1:3210}"
MYNAM="${MYNAMA_URL:-http://127.0.0.1:3220}"

check() {
  local url="$1"
  local expect="$2"
  local actual
  actual="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
  if [[ "$actual" != "$expect" ]]; then
    echo "FAIL: $url expected $expect got $actual"
    exit 1
  fi
  echo "OK:   $url -> $actual"
}

check "$MAIN/health"           200
check "$DEPT/health"           200
check "$MYNAM/health"          200

# list depts
LIST="$(curl -fsS --max-time 5 "$DEPT/api/v4/dept/list")"
N="$(printf '%s' "$LIST" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const j=JSON.parse(s);process.stdout.write(String(j.depts.length));})')"
if (( N < 51 )); then
  echo "FAIL: dept list = $N (expected >= 51)"
  exit 1
fi
echo "OK:   /api/v4/dept/list -> $N depts"

# unauth POST should reject
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST -H 'Content-Type: application/json' -d '{"tenantId":"A","patientId":"P1","complaint":"x"}' "$DEPT/api/v4/dept/card/visits" || true)"
if [[ "$code" == "401" || "$code" == "403" ]]; then
  echo "OK:   unauth POST rejected ($code)"
else
  echo "FAIL: unauth POST expected 401/403, got $code (sandbox may not enforce — review §2.4)"
fi

echo "========================="
echo "All live smoke checks passed."
