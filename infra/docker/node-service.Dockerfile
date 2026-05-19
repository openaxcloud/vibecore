FROM node:22-bookworm-slim AS build
WORKDIR /app

ARG PACKAGE_FILTER
ENV HUSKY=0
ENV CI=true

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN apt-get update && apt-get install -y --no-install-recommends git openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services

RUN pnpm install --frozen-lockfile
RUN pnpm --filter "${PACKAGE_FILTER}" build
RUN pnpm deploy --filter "${PACKAGE_FILTER}" --prod /runtime

FROM node:22-bookworm-slim AS runtime
WORKDIR /runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Put workspace-local binaries (tsx, prisma, etc.) on PATH so START_CMD can
# call them by name. pnpm deploy lands them in /runtime/node_modules/.bin
# but only pnpm/npm script invocations get that on PATH by default.
ENV PATH=/runtime/node_modules/.bin:${PATH}
ARG START_CMD
ENV START_CMD=${START_CMD}

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /runtime /runtime

USER node
EXPOSE 3000

CMD ["sh", "-lc", "$START_CMD"]
