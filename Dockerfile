# syntax=docker/dockerfile:1.7
#
# Web (Remix + Vite SSR) production image.
#
# Two build modes:
#   - Cloud Build: pass --build-arg DEPS_IMAGE=<artifact-registry deps tag>.
#     The shared deps base (built once per pipeline) already has
#     node_modules + workspace metadata, so this build skips `pnpm install`
#     and goes straight to `pnpm build`.
#   - Local docker / docker-compose: omit DEPS_IMAGE. The `local-deps`
#     stage below is selected by default and bootstraps pnpm + installs
#     dependencies in-tree.

ARG DEPS_IMAGE=local-deps

# ---- local fallback deps stage ----
# Only built when DEPS_IMAGE is left at its default (i.e. no shared deps
# image is supplied). Cloud Build skips this stage entirely.
FROM node:22-bookworm-slim AS local-deps
WORKDIR /app

ENV HUSKY=0
ENV CI=true

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
        git openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml* ./
RUN pnpm fetch

# ---- build stage ----
FROM ${DEPS_IMAGE} AS build
WORKDIR /app

# CI-friendly env. Also set in the shared deps base; repeated here so the
# Dockerfile is intelligible when read in isolation.
ENV HUSKY=0
ENV CI=true

# Accept (optional) build-time public URL for Remix/Vite.
ARG VITE_PUBLIC_APP_URL
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}

# Runtime mode is resolved in the browser from `import.meta.env.VITE_RUNTIME_MODE`
# (see app/lib/runtime/RuntimeAdapterProvider.ts `getRuntimeMode`). Vite inlines
# VITE_* values at *build* time, so it MUST be a build arg here — setting it only
# in the Helm configmap is a no-op for the client bundle, which then silently
# falls back to WebContainer and never routes through workspace-manager /
# preview-proxy. Left empty by default so a bare `docker build` keeps the
# WebContainer dev default; the prod web Cloud Build (single-web.yaml) passes
# remote-kubernetes. The API base URL defaults to the same-origin `/api/runtime`
# when unset (RuntimeAdapterProvider), so it only needs overriding off-origin.
ARG VITE_RUNTIME_MODE
ENV VITE_RUNTIME_MODE=${VITE_RUNTIME_MODE}
ARG VITE_RUNTIME_API_BASE_URL
ENV VITE_RUNTIME_API_BASE_URL=${VITE_RUNTIME_API_BASE_URL}

# Managed (Replit-parity) mode: the platform admin provides the AI provider
# keys, so the IDE composer must NOT prompt end users for their own per-provider
# API key. `VITE_BYOK_DISABLED` gates that key-entry block (ChatBox.tsx), and
# like every VITE_* value it is inlined by Vite at *build* time — setting it only
# in the Helm configmap is a no-op for the client bundle. So it MUST be a build
# arg here. Left empty by default so a bare `docker build` (dev / self-host)
# keeps BYOK key entry working; the prod web Cloud Build (single-web.yaml)
# passes "true".
ARG VITE_BYOK_DISABLED
ENV VITE_BYOK_DISABLED=${VITE_BYOK_DISABLED}

# Source overlay. When DEPS_IMAGE is the shared deps base, node_modules
# is already populated and this COPY only adds source. When DEPS_IMAGE
# is local-deps, node_modules is absent and we run the install below.
COPY . .

# Install only if the base didn't already provide a linked dependency tree.
# `pnpm fetch` creates node_modules/.pnpm without root .bin links, so checking
# only for node_modules would skip the offline install and leave the framework
# CLI absent. RR7's root .bin is `react-router` (was `remix` pre-migration).
RUN if [ ! -x /app/node_modules/.bin/react-router ]; then \
      pnpm install --offline --frozen-lockfile; \
    fi

# Build the Remix app (SSR + client). Cap V8 well above the runtime
# limit since Vite + Remix peak past 4 GiB while rendering chunks on the
# current bundle (8k+ modules). The E2_HIGHCPU_8 builder has 8 GiB RAM, so
# 6 GiB leaves headroom for Node/OS overhead while clearing the OOM ceiling.
RUN NODE_OPTIONS=--max-old-space-size=6144 pnpm run build

# ---- production dependencies stage ----
FROM build AS prod-deps
RUN pnpm prune --prod --ignore-scripts

# ---- production stage ----
FROM node:22-bookworm-slim AS bolt-ai-production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# Cap V8 heap to fit a 512Mi Helm limit with headroom for native allocations.
ENV NODE_OPTIONS="--max-old-space-size=384"

ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

# curl for the Kubernetes /health probe + Docker HEALTHCHECK.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# `public/` is bundled into `build/client/` by Vite, so it's not copied separately.
COPY --from=prod-deps --chown=node:node /app/build /app/build
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/package.json /app/package.json

# CVE-2026-59873 — `tar` CRITIQUE (bombe gzip) dans le node-tar EMBARQUÉ PAR npm.
#
# Mesuré le 2026-09-03 dans l'image réellement servie :
#   7.5.11  /usr/local/lib/node_modules/npm/node_modules/tar/package.json
#   7.5.15  /app/node_modules/.pnpm/tar@.../node_modules/tar/package.json
#
# La seconde est la nôtre et se corrige par un `override` pnpm. La PREMIÈRE non :
# elle appartient à l'image de base `node:22-bookworm-slim`, ce n'est pas une
# dépendance résolue. Elle a bloqué les 7 images à la porte de vulnérabilités et
# figé toutes les livraisons.
#
# npm et corepack ne servent JAMAIS à l'exécution — le conteneur lance `node`
# directement. Les retirer est un correctif réel, pas un contournement : la
# vulnérabilité disparaît ET la surface d'attaque diminue. Préféré à une entrée
# `.trivyignore`, qui aurait affaibli une porte de sécurité pour un outil qui ne
# s'exécute pas.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Run as non-root to satisfy podSecurity `runAsNonRoot: true`.
USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD curl -fsS http://localhost:3000/health || exit 1

# RR7 ships its server runner as @react-router/serve (the Remix v2
# @remix-run/serve package was removed by the migration). Same CLI contract:
# it serves ./build/server/index.js on $PORT and exposes the app's /health route.
CMD ["node", "./node_modules/@react-router/serve/dist/cli.js", "./build/server/index.js"]


# ---- development stage ----
FROM build AS development

ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

RUN mkdir -p /app/run
CMD ["pnpm", "run", "dev", "--host"]
