#!/usr/bin/env bash

set -euo pipefail

target_sha="${1:-}"
main_ref="${2:-refs/remotes/origin/main}"

if [[ ! "${target_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "deploy target must be a full lowercase 40-hex commit SHA" >&2
  exit 2
fi

if ! git cat-file -e "${target_sha}^{commit}" 2>/dev/null; then
  echo "deploy target ${target_sha} is not available as a commit" >&2
  exit 2
fi

if ! git rev-parse --verify --quiet "${main_ref}^{commit}" >/dev/null; then
  echo "main ref ${main_ref} is not available as a commit" >&2
  exit 2
fi

if ! git merge-base --is-ancestor "${target_sha}" "${main_ref}"; then
  echo "deploy target ${target_sha} is not an ancestor of ${main_ref}" >&2
  exit 1
fi

main_sha="$(git rev-parse "${main_ref}^{commit}")"

if [[ "${target_sha}" == "${main_sha}" ]]; then
  echo "deploy target is the current main commit: ${target_sha}"
  exit 0
fi

# A documentation-only attestation may advance main without triggering the
# continuous deployment workflow. Accept that exact case, matching this
# workflow's paths-ignore contract. Any application, infrastructure, workflow,
# test, lockfile, or configuration delta means the older target could regress
# production and must be refused; rollback uses the separately gated manual
# workflow instead.
runtime_pathspec=(
  .
  ':(exclude,glob)docs/**'
  ':(exclude,glob)**/*.md'
)

if ! git diff --quiet "${target_sha}..${main_ref}" -- "${runtime_pathspec[@]}"; then
  echo "deploy target ${target_sha} is stale: ${main_ref} contains non-documentation changes" >&2
  git diff --name-only "${target_sha}..${main_ref}" -- "${runtime_pathspec[@]}" >&2
  exit 1
fi

echo "deploy target ${target_sha} differs from ${main_ref} only by ignored documentation paths"
