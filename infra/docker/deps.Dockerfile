# syntax=docker/dockerfile:1.7
#
# Shared monorepo dependency base.
#
# Built ONCE per Cloud Build pipeline, then consumed by every per-service
# Dockerfile as their build base (`FROM ${DEPS_IMAGE}`). This is what makes
# the 7 service builds runnable in parallel without each redoing the 3-5
# minute `pnpm install` against the 2200-package workspace.
#
# Cache-key contract:
#   The only inputs to this image's heavy `pnpm install` layer are
#   pnpm-lock.yaml, pnpm-workspace.yaml, and every workspace `package.json`.
#   Source files are intentionally NOT copied here so that a source-only
#   change keeps the layer hash stable and pulls the install layer straight
#   from `deps:latest` via --cache-from. If you add a new workspace
#   package, add its package.json to the COPY list below or the install
#   step will be missing a dep.

FROM node:22-bookworm-slim AS deps
WORKDIR /app

ENV HUSKY=0
ENV CI=true
ENV PNPM_STORE_DIR=/pnpm/store

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN pnpm config set store-dir "${PNPM_STORE_DIR}"

# git: required by some workspace install scripts and runtime tooling.
# openssl + ca-certificates: required by Prisma's binary download + TLS.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Root manifests first — these are the most stable and pin the workspace
# layout pnpm needs to resolve dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Workspace package.json files. pnpm needs them to plan the install but
# does NOT need their source — keeping these copies surgical is what
# allows the install layer to be reused across source-only changes.
#
# Order: alphabetical inside each group. If you add a workspace package,
# add its package.json line here.
COPY apps/admin/package.json   ./apps/admin/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/mobile/package.json  ./apps/mobile/
COPY apps/web/package.json     ./apps/web/

COPY packages/audit/package.json               ./packages/audit/
COPY packages/auth/package.json                ./packages/auth/
COPY packages/billing/package.json             ./packages/billing/
COPY packages/config/package.json              ./packages/config/
COPY packages/connector-sdk/package.json       ./packages/connector-sdk/
COPY packages/database/package.json            ./packages/database/
COPY packages/editor/package.json              ./packages/editor/
COPY packages/k8s-client/package.json          ./packages/k8s-client/
COPY packages/observability/package.json       ./packages/observability/
COPY packages/quota/package.json               ./packages/quota/
COPY packages/rbac/package.json                ./packages/rbac/
COPY packages/runtime-contract/package.json    ./packages/runtime-contract/
COPY packages/runtime-remote/package.json      ./packages/runtime-remote/
COPY packages/runtime-webcontainer/package.json ./packages/runtime-webcontainer/
COPY packages/security/package.json            ./packages/security/
COPY packages/shared/package.json              ./packages/shared/
COPY packages/ui/package.json                  ./packages/ui/
COPY packages/workspace-sdk/package.json       ./packages/workspace-sdk/

COPY services/ai-gateway/package.json        ./services/ai-gateway/
COPY services/api/package.json               ./services/api/
COPY services/connector-proxy/package.json   ./services/connector-proxy/
COPY services/preview-proxy/package.json     ./services/preview-proxy/
COPY services/worker/package.json            ./services/worker/
COPY services/workspace-agent/package.json   ./services/workspace-agent/
COPY services/workspace-manager/package.json ./services/workspace-manager/

COPY infra/package.json ./infra/

# Install once and persist the pnpm store in the image. Service images run
# `pnpm deploy --prefer-offline`, so package tarballs must be part of this
# shared base instead of living only in a transient BuildKit cache mount.
RUN pnpm install --frozen-lockfile
