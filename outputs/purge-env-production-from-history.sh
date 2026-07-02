#!/usr/bin/env bash
#
# Purge `.env.production` from the ENTIRE git history of vibecore.
#
# ⚠️  PREPARED, NOT AUTO-RUN. This script performs only the SAFE local steps
#     (fresh mirror clone + history rewrite in a scratch dir) and then STOPS,
#     printing the exact destructive command for a human to run after review.
#     It NEVER pushes and NEVER touches the shared remote by itself.
#
#     Rewriting shared history requires Avi's EXPLICIT GO — it is destructive:
#     it changes every commit SHA, needs a force-push, breaks every existing
#     clone/fork/open-PR, and would race the automated process that manages
#     `main`. See outputs/SECURITY_ENV_LEAK_REMEDIATION.md §4.
#
# ── ROTATION FIRST ──────────────────────────────────────────────────────────
#   Rotating any leaked value makes the copy in history worthless, so rotation
#   SUPERSEDES this purge. (Audit found NO real secret value in the historical
#   `.env.production` — empty template values only — so this purge is optional
#   cleanup, not an incident response.) Do §3 of the runbook before considering
#   this.
#
# Usage (safe — does the rewrite in a scratch dir, then stops):
#   bash outputs/purge-env-production-from-history.sh
#
# Env overrides:
#   REMOTE   git URL to mirror           (default: git@github.com:openaxcloud/vibecore.git)
#   WORKDIR  scratch dir for the mirror  (default: /tmp/vibecore-history-purge.git)
#
set -euo pipefail

REMOTE="${REMOTE:-git@github.com:openaxcloud/vibecore.git}"
WORKDIR="${WORKDIR:-/tmp/vibecore-history-purge.git}"
TARGET_PATH=".env.production"

echo "▶ ROTATION comes first — this purge is worthless unless leaked values are already"
echo "  rotated (runbook §3). No real value was found in history, so purge is optional."
echo "  Remote : $REMOTE"
echo "  Scratch: $WORKDIR"
echo

# 1) Fresh MIRROR clone — never operate on a working checkout.
rm -rf "$WORKDIR"
git clone --mirror "$REMOTE" "$WORKDIR"
cd "$WORKDIR"

# 2) Rewrite history: drop the path from every commit. Prefer git-filter-repo.
if command -v git-filter-repo >/dev/null 2>&1 || python3 -c 'import git_filter_repo' 2>/dev/null; then
  # --invert-paths + --path removes exactly this file across all refs & commits.
  # If a stray real value ever needs scrubbing too, add:
  #   --replace-text <(printf '%s==>REDACTED\n' 'the-literal-value')
  git filter-repo --force --invert-paths --path "$TARGET_PATH"
else
  echo "✗ git-filter-repo not installed." >&2
  echo "  Install:  pipx install git-filter-repo   (or) pip install git-filter-repo" >&2
  echo "  BFG alternative (Java): bfg --delete-files .env.production \"$WORKDIR\" && \\" >&2
  echo "                          git reflog expire --expire=now --all && git gc --prune=now --aggressive" >&2
  exit 3
fi

# 3) Verify the path is gone from ALL history.
if git log --all --oneline -- "$TARGET_PATH" | grep -q .; then
  echo "✗ $TARGET_PATH is STILL present after rewrite — do NOT push. Investigate." >&2
  exit 4
fi
echo
echo "✓ $TARGET_PATH removed from all history in the scratch mirror."
echo "  Verify:  git -C \"$WORKDIR\" log --all --oneline -- $TARGET_PATH   # (expect: empty)"

# 4) STOP. Do NOT push. Print the exact destructive command for a human.
cat <<EOF

════════════════════════════════════════════════════════════════════════════
  DESTRUCTIVE STEP — NOT EXECUTED BY THIS SCRIPT. Requires Avi's explicit GO.

  After reviewing the rewritten mirror, a human runs MANUALLY:

      cd "$WORKDIR"
      git push --force --mirror        # rewrites shared history on $REMOTE

  BEFORE the force-push:
    - Confirm rotation of anything ever real (runbook §3) - rotation > purge.
    - Announce a freeze; every collaborator MUST re-clone afterwards.
    - Expect open PRs/forks to break; ask GitHub Support to purge cached refs.
    - Coordinate with the automation that force-manages 'main' so it doesn't race.
════════════════════════════════════════════════════════════════════════════
EOF
