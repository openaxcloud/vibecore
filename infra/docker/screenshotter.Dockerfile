# syntax=docker/dockerfile:1.7
#
# screenshotter service image.
#
# Unlike the other platform node services (infra/docker/node-service.Dockerfile,
# which runs on a bare node:slim base) this service needs a real Chromium, so the
# RUNTIME stage is the official Playwright image — it ships Chromium + all system
# libraries and sets PLAYWRIGHT_BROWSERS_PATH, so `playwright-core` launches the
# bundled browser with no per-build download. The BUILD stage is identical to the
# shared one (reuses the pre-built DEPS_IMAGE + `pnpm deploy`), so this Dockerfile
# only diverges in its runtime base.
#
# Build args:
#   DEPS_IMAGE     — fully-qualified deps base image (`...deps:${SHORT_SHA}`)
#   PACKAGE_FILTER — pnpm filter, e.g. `@vibecore/screenshotter`
#   START_CMD      — shell command the runtime stage execs as PID 1
#   PLAYWRIGHT_TAG — must match the `playwright-core` version in package.json

ARG DEPS_IMAGE
FROM ${DEPS_IMAGE} AS build
WORKDIR /app

ARG PACKAGE_FILTER

COPY apps ./apps
COPY packages ./packages
COPY services ./services

RUN pnpm --filter "${PACKAGE_FILTER}" build
RUN pnpm deploy --filter "${PACKAGE_FILTER}" --prod --prefer-offline /runtime

# Keep this tag in lock-step with `playwright-core` in
# services/screenshotter/package.json — a mismatch means the bundled browser
# revision won't match what playwright-core expects and launch fails.
ARG PLAYWRIGHT_TAG=v1.59.1-noble
FROM mcr.microsoft.com/playwright:${PLAYWRIGHT_TAG} AS runtime
WORKDIR /runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3030
ENV PATH=/runtime/node_modules/.bin:${PATH}
ARG START_CMD
ENV START_CMD=${START_CMD}

COPY --from=build /runtime /runtime

# The Playwright base ships a non-root `pwuser`; run as it (matches the platform's
# runAsNonRoot policy — the pod securityContext also pins runAsUser 1000).
USER pwuser
EXPOSE 3030

CMD ["sh", "-c", "exec $START_CMD"]
