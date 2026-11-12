# Validation packaging only. Context is git archive of the pinned product tree.
FROM node:22-bookworm-slim
WORKDIR /app
ENV CI=true HUSKY=0 ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate \
 && apt-get update && apt-get install -y --no-install-recommends git openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @vibecore/api build
ENV VITE_RUNTIME_MODE=remote-kubernetes VITE_RUNTIME_API_BASE_URL=http://127.0.0.1:3001/api/runtime
RUN NODE_OPTIONS=--max-old-space-size=6144 pnpm run build
RUN chown -R node:node /app
USER node
ENV NODE_ENV=production
CMD ["node", "server.mjs"]
