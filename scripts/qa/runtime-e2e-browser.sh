#!/usr/bin/env bash
set -euo pipefail
export PLAYWRIGHT_SKIP_WEB_SERVER=1
scheduled_publication=false
if [[ ${GITHUB_EVENT_NAME:-} == schedule ]]; then
  scheduled_publication=true
  node tests/private-runtime-dynamic/outcome.cjs init
fi
HOST=127.0.0.1 PORT=5173 NODE_ENV=production pnpm run start:node > /tmp/vibecore-web.log 2>&1 &
web=$!
pnpm --filter @vibecore/admin dev > /tmp/vibecore-admin.log 2>&1 &
admin=$!
trap 'kill "$web" "$admin" 2>/dev/null || true' EXIT
for port in 5173 5174; do
  timeout 180 bash -c 'until curl --fail --silent --max-time 3 "http://127.0.0.1:$1/" >/dev/null; do sleep 1; done' _ "$port"
done
# The template test creates the project through the UI and reads its rendered iframe.
spec='template-created project boots and renders'
orbit_status=0
timeout --kill-after=5s 390s pnpm exec playwright test tests/e2e/preview-runtime.spec.ts --project=chromium --grep "$spec" --retries=0 --reporter=./scripts/qa/runtime-browser-proof.ts || orbit_status=$?
readme_status=0
timeout --kill-after=5s 270s pnpm exec playwright test --config=tests/private-runtime-readme/playwright.config.ts --project=chromium --reporter=./tests/private-runtime-readme/proof-reporter.ts > /tmp/vibecore-readme-proof.log 2>&1 || readme_status=$?
echo "Chromium proof exit codes: Orbit=$orbit_status README=$readme_status"
publication_status=0
if "$scheduled_publication"; then
  node tests/private-runtime-dynamic/outcome.cjs run || publication_status=$?
  echo "Dynamic publication exit code: $publication_status"
fi
# Each short proof gets its own result before the longer independent suite starts.
if (( orbit_status || readme_status )); then exit 1; fi
echo 'Starting remaining Chromium @runtime tests'
pnpm exec playwright test tests/e2e --project=chromium --grep @runtime --grep-invert "$spec" > /tmp/vibecore-browser-suite.log 2>&1
echo 'Starting IDE panel audit'
pnpm run ide:panel-audit > /tmp/vibecore-panel.log 2>&1
echo 'Starting IDE panel audit validation'
pnpm run ide:panel-audit:validate >> /tmp/vibecore-panel.log 2>&1
if (( publication_status )); then exit "$publication_status"; fi
echo 'Browser checks passed; stopping local web and admin servers'
