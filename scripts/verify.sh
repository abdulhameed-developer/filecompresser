#!/usr/bin/env bash
# Full verification pass against a FRESH build.
#
# This exists because a long-running `next start` will happily keep serving an
# old build: the audit scripts then report on code that is no longer on disk,
# which is worse than not running them at all. So this script refuses to audit
# anything unless the served build matches the build on disk.
#
#   ./scripts/verify.sh              # build, start, audit, tear down
#   ./scripts/verify.sh --no-browser # skip the Playwright-driven audits
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
PW_TOOLS="${PW_TOOLS:-$HOME/pwtools}"
# `set -u` is on, so TMPDIR has to be defaulted rather than assumed exported.
LOG="${TMPDIR:-/tmp}/filecompresser-verify.log"
SKIP_BROWSER=0
[ "${1:-}" = "--no-browser" ] && SKIP_BROWSER=1

step() { printf '\n=== %s ===\n' "$1"; }

step "lint"
npm run lint

step "typecheck"
npx tsc --noEmit
echo "typecheck OK"

step "unit tests"
npm test

step "npm audit (production dependencies)"
# Audited with --omit=dev on purpose. What ships to users is the production
# tree; devDependencies never reach a browser or the server bundle, and several
# lint-tool advisories (braces/micromatch/fast-glob via eslint-config-next) are
# unfixable without downgrading Next or abandoning lint. Failing the run on
# those would train people to ignore the audit, which is worse than reporting
# the split honestly. The full `npm audit` output is printed for visibility.
npm audit --omit=dev
echo
echo "  dev-only advisories (not shipped, see package.json):"
# `npm audit --json` exits non-zero when it finds any, which under `set -e`
# would abort the run — so the exit code is ignored deliberately. The production
# audit above is the one that gates the build.
set +e
npm audit --json 2>/dev/null |
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      try {
        const v = JSON.parse(s).vulnerabilities || {};
        const names = Object.entries(v)
          .filter(([, d]) => d.severity === "high" || d.severity === "critical")
          .map(([n]) => n);
        if (!names.length) console.log("    none");
        else console.log(`    ${names.join(", ")} — all devDependencies`);
      } catch {
        console.log("    (could not parse)");
      }
    });
  '
set -e

step "build"
npm run build

# The build ID changes on every build, so it is a reliable fingerprint of what
# is on disk. The running server exposes it in the HTML it serves.
build_id() { cat .next/BUILD_ID 2>/dev/null || echo "unknown"; }

# Refuse to audit a server that is serving a different build.
assert_fresh() {
  local served on_disk_css
  # `set -e` is lifted here too: a grep that matches nothing returns 1, which
  # would abort the script before it could print a diagnosis.
  set +e

  served="$(curl -s --max-time 5 "$BASE/" | grep -o '/_next/static/chunks/[a-z0-9_-]*\.css' | head -1)"
  on_disk_css="$(ls -t .next/static/chunks/*.css 2>/dev/null | head -1 | xargs -r basename)"

  echo "  build id on disk: $(build_id)"
  echo "  css on disk:      $on_disk_css"
  echo "  css being served: ${served:-<none found>}"

  if [ -z "$served" ]; then
    echo "  could not read a stylesheet URL from the served HTML" >&2
    set -e
    exit 1
  fi
  if [ "$served" != "/_next/static/chunks/$on_disk_css" ]; then
    echo "  STALE SERVER: serving $served but disk has $on_disk_css" >&2
    echo "  Run: pkill -f next-server   (then re-run this script)" >&2
    set -e
    exit 1
  fi
  echo "  server is serving the current build"
  set -e
}

step "start server on :$PORT"
# `set -e` is lifted for this whole block: every conditional here depends on a
# command that is *expected* to fail sometimes (a curl against a server that is
# not up yet, a pkill that matches nothing), and `set -e` would abort the run on
# the first one instead of letting the logic handle it.
set +e

# Anything already holding the port is a stale server; kill it rather than
# silently auditing the wrong build.
if curl -s -o /dev/null --max-time 2 "$BASE/"; then
  echo "  a server is already running on :$PORT — stopping it"
  pkill -f "next-server" 2>/dev/null || true
  pkill -f "next start" 2>/dev/null || true
  sleep 2
fi

npm run start -- --port "$PORT" >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
}
trap cleanup EXIT

# Poll for readiness.
ready=0
for _ in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 1 "$BASE/"; then
    ready=1
    break
  fi
  # If the process died outright, fail with its log rather than looping.
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "  server exited during startup:" >&2
    tail -20 "$LOG" >&2
    exit 1
  fi
  sleep 0.5
done
set -e

if [ "$ready" -ne 1 ]; then
  echo "  server did not become ready in 30s:" >&2
  tail -20 "$LOG" >&2
  exit 1
fi
echo "  server ready"

assert_fresh

step "route crawl"
node scripts/route-crawl.mjs "$BASE"

if [ "$SKIP_BROWSER" -eq 0 ] && [ -d "$PW_TOOLS/node_modules/playwright-core" ]; then
  step "navigation audit"
  PW_TOOLS="$PW_TOOLS" node scripts/navigation-audit.mjs "$BASE"

  step "responsive audit"
  PW_TOOLS="$PW_TOOLS" node scripts/responsive-audit.mjs "$BASE"

  step "role audit (security, a11y, contrast, performance)"
  PW_TOOLS="$PW_TOOLS" node scripts/role-audit.mjs "$BASE"

  step "accessibility audit (keyboard, reflow, motion, targets)"
  PW_TOOLS="$PW_TOOLS" node scripts/a11y-manual-audit.mjs "$BASE"

  if [ -f public/anim.gif ]; then
    step "functionality audit"
    CASE_TIMEOUT_MS=60000 PW_TOOLS="$PW_TOOLS" node scripts/functionality-audit.mjs "$BASE"
    # The fixtures are QA-only and were copied into public/ purely so the
    # browser could fetch them. They are removed here so a passing run leaves
    # the tree deployable, and so the hygiene check below has something to say.
    step "removing QA fixtures from public/"
    rm -f public/anim.gif public/traversal.zip public/absolute.zip \
          public/normal.zip public/not-really.zip public/sample.pdf public/tone.wav
    echo "  cleaned"
  else
    echo
    echo "skipping functionality audit: fixtures not in public/"
    echo "  run: node scripts/make-gif.mjs && COPY_TO_PUBLIC=1 node scripts/make-fixtures.mjs"
  fi
else
  echo
  echo "skipping browser audits (PW_TOOLS=$PW_TOOLS, or --no-browser)"
fi

step "public/ hygiene"
# A passing run must leave public/ holding site assets only. Anything left here
# would be deployed, so this is a hard failure rather than a warning.
set +e
leaked="$(ls public/*.gif public/*.wav public/*.pdf public/*.zip 2>/dev/null)"
set -e
if [ -n "$leaked" ]; then
  echo "  QA fixtures are present in public/ and would be deployed:" >&2
  echo "$leaked" | sed 's/^/    /' >&2
  echo "  Remove them, or re-run with COPY_TO_PUBLIC=0." >&2
  exit 1
fi
echo "  public/ contains site assets only"

printf '\n=== ALL CHECKS PASSED ===\n'
