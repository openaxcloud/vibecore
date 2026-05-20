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

# Source overlay. When DEPS_IMAGE is the shared deps base, node_modules
# is already populated and this COPY only adds source. When DEPS_IMAGE
# is local-deps, node_modules is absent and we run the install below.
COPY . .

# Install only if the base didn't already provide node_modules. With the
# shared Cloud Build deps base this is a no-op; with the local-deps
# fallback it does the offline install using the prefetched store.
RUN if [ ! -d /app/node_modules ]; then \
      pnpm install --offline --frozen-lockfile; \
    fi

# Build the Remix app (SSR + client). Cap V8 well above the runtime
# limit since Vite + Remix routinely peak near 3 GiB during SSR bundle.
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm run build

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

# Run as non-root to satisfy podSecurity `runAsNonRoot: true`.
USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD curl -fsS http://localhost:3000/health || exit 1

CMD ["node", "./node_modules/@remix-run/serve/dist/cli.js", "./build/server/index.js"]


# ---- development stage ----
FROM build AS development

ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

RUN mkdir -p /app/run
CMD ["pnpm", "run", "dev", "--host"]
