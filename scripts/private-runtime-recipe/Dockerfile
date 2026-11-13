# Test harness image only. Real API/manager sources run via their existing tsx entrypoints.
# No production Dockerfile, guard, published image or remote registry is changed.
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS platform
ENV HUSKY=0 CI=true COREPACK_HOME=/opt/corepack
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git python3 make g++ tini \
    && rm -rf /var/lib/apt/lists/*
ARG KUBECTL_VERSION=v1.34.0
RUN curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
    && curl -fsSLo /tmp/kubectl.sha256 "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256" \
    && echo "$(cat /tmp/kubectl.sha256)  /usr/local/bin/kubectl" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/kubectl && rm /tmp/kubectl.sha256
RUN corepack enable && corepack prepare pnpm@9.14.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages ./packages
COPY services ./services
COPY app ./app
COPY scripts ./scripts
# Keep all workspace manifests available; frozen installation must never rewrite the lock.
COPY apps ./apps
COPY infra/package.json ./infra/package.json
RUN pnpm install --frozen-lockfile --filter '!@vibecore/mobile' \
    && pnpm --filter @vibecore/database db:generate
USER node
