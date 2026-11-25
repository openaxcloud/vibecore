#!/usr/bin/env bash
set -euo pipefail
export PLAYWRIGHT_SKIP_WEB_SERVER=1
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
pnpm exec playwright test tests/e2e/preview-runtime.spec.ts --project=chromium --grep "$spec" --retries=0 --reporter=./scripts/qa/runtime-browser-proof.ts > /tmp/vibecore-browser.log 2>&1
echo 'Chromium passed: template project created, workspace running, generated app rendered.'
pnpm exec playwright test tests/e2e --project=chromium --grep @runtime --grep-invert "$spec" > /tmp/vibecore-browser-suite.log 2>&1
pnpm run ide:panel-audit > /tmp/vibecore-panel.log 2>&1
pnpm run ide:panel-audit:validate >> /tmp/vibecore-panel.log 2>&1
