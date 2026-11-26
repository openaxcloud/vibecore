#!/usr/bin/env bash
set -euo pipefail
proof_dir=$(cd "$(dirname "$0")" && pwd)
cd "$(git rev-parse --show-toplevel)"
QA_ROOT=$(mktemp -d)
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
export QA_ROOT
export QA_API="http://127.0.0.1:${API_PROOF_PORT:-19317}"
export QA_WEB="http://127.0.0.1:${WEB_PROOF_PORT:-19587}"
export PROJECT_STORAGE_DIR="$QA_ROOT/projects"
export GIT_IMPORT_SCRATCH_DIR="$QA_ROOT/scratch"
mkdir "$QA_ROOT/bin"
install -m 755 "$proof_dir/git-transport.py" "$QA_ROOT/bin/git"
git init -q -b main "$QA_ROOT/seed"
for change in first second third; do
  echo "$change" > "$QA_ROOT/seed/proof.txt"
  git -C "$QA_ROOT/seed" add proof.txt
  git -C "$QA_ROOT/seed" -c user.email=qa@example.invalid -c user.name=Fixture commit -qm "$change"
done
git clone --quiet --bare "$QA_ROOT/seed" "$QA_ROOT/origin.git"
API_BASE_URL="$QA_API" SAAS_API_URL="$QA_API" node_modules/.bin/react-router dev --strictPort --host 127.0.0.1 --port "${WEB_PROOF_PORT:-19587}" >"$QA_ROOT/web.log" 2>&1 &
web_pid=$!
trap 'kill "$web_pid" 2>/dev/null || true; rm -rf -- "$QA_ROOT"' EXIT
for n in {1..120}; do
  kill -0 "$web_pid"
  if (echo > /dev/tcp/127.0.0.1/${WEB_PROOF_PORT:-19587}) 2>/dev/null; then break; fi
  sleep 1
done
node "$proof_dir/browser.mjs" | tee "$QA_ROOT/browser.log"
