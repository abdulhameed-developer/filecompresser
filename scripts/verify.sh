#!/usr/bin/env bash
# Builds once and audits only the server started by this invocation.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3198}"
BASE="http://127.0.0.1:${PORT}"
PW_TOOLS="${PW_TOOLS:-$HOME/pwtools}"
LOG="${TMPDIR:-/tmp}/filecompresser-verify.log"
SKIP_BROWSER=0
[ "${1:-}" = '--no-browser' ] && SKIP_BROWSER=1
if curl -s -o /dev/null --max-time 2 "$BASE/"; then
  echo "Port $PORT is occupied. Choose another PORT; no existing process was stopped." >&2
  exit 1
fi
npm run typecheck
npm test
npm audit --omit=dev
node scripts/check-public.mjs
npm run build
node scripts/package-site.mjs
PREVIEW_HOST=127.0.0.1 PORT="$PORT" node scripts/serve-static.mjs >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT
ready=0
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$BASE/"; then ready=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then cat "$LOG"; exit 1; fi
  sleep 0.5
done
[ "$ready" -eq 1 ] || { cat "$LOG"; exit 1; }
node scripts/route-crawl.mjs "$BASE"
if [ "$SKIP_BROWSER" -eq 0 ]; then
  [ -d "$PW_TOOLS/node_modules/playwright-core" ] || { echo 'Browser tools missing. Set PW_TOOLS or explicitly use --no-browser.' >&2; exit 1; }
  for audit in navigation responsive role a11y-manual design-system premium-ui functionality; do
    PW_TOOLS="$PW_TOOLS" node "scripts/${audit}-audit.mjs" "$BASE"
  done
else
  echo 'Browser verification explicitly skipped; this is not a full verification pass.'
fi
node scripts/check-public.mjs
