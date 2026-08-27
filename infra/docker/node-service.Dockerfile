# syntax=docker/dockerfile:1.7
#
# Per-service node Dockerfile.
#
# Build args:
#   DEPS_IMAGE      — fully-qualified deps base image (`...deps:${SHORT_SHA}`)
#                     built once per Cloud Build pipeline. node_modules and
#                     pnpm workspace metadata are already present, so this
#                     stage does NOT run `pnpm install`.
#   PACKAGE_FILTER  — pnpm filter, e.g. `@vibecore/api`
#   START_CMD       — shell command the runtime stage execs as PID 1
#                     (kept in an env var so we can keep a single CMD entry).
#
# Why `FROM ${DEPS_IMAGE}`: the monorepo has ~2200 packages; installing
# them per service ran the previous pipeline at 25-50 min. Sharing one
# install across all 7 services moves that work out of the per-service
# hot path entirely, which is what lets the seven service builds fan out
# in parallel without OOM'ing on E2_HIGHCPU_8 (8 GiB).

ARG DEPS_IMAGE
FROM ${DEPS_IMAGE} AS build
WORKDIR /app

ARG PACKAGE_FILTER

# Source overlay: workspace package.json files were already pinned into
# the deps base; the source trees here add the actual code on top of
# them without disturbing node_modules.
COPY apps ./apps
COPY packages ./packages
COPY services ./services

# `app/` — la source de l'application web — est copiée parce que l'alias `~/*`
# du workspace y pointe (`tsconfig` racine : baseUrl `.`, `~/* -> app/*`), et que
# `apps/admin` s'en sert : `apps/admin/src/i18n.ts` importe
# `~/lib/i18n/catalogs/admin` et `~/lib/i18n/language`, et son `vite.config`
# alias `~` vers `../../app`.
#
# Sans cette ligne le tier `admin` était INCONSTRUCTIBLE (BUG-BUILD-002) :
# `tsc --noEmit` échouait sur deux TS2307 « Cannot find module '~/lib/i18n/…' »
# et cassait `pnpm build`. Le défaut ne se voyait pas en local — le dépôt entier
# y est présent — mais seulement dans le conteneur, dont le contexte s'arrêtait à
# apps/packages/services. Conséquence : l'image admin de production était gelée
# (ef05fea502) pendant que les autres tiers avançaient.
#
# Coût : cette copie n'existe QUE dans l'étage `build`. L'étage `runtime` ne
# reprend que `/runtime` (sortie de `pnpm deploy`), donc les images finales des
# six services construits par ce Dockerfile ne grossissent pas.
COPY app ./app

RUN pnpm --filter "${PACKAGE_FILTER}" build
RUN pnpm deploy --filter "${PACKAGE_FILTER}" --prod --prefer-offline /runtime

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
ARG KUBECTL_VERSION=v1.35.3

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client \
  && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
  && curl -fsSLo /tmp/kubectl.sha256 "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256" \
  && echo "$(cat /tmp/kubectl.sha256)  /usr/local/bin/kubectl" | sha256sum -c - \
  && rm -f /tmp/kubectl.sha256 \
  && chmod 0755 /usr/local/bin/kubectl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /runtime /runtime

USER node
EXPOSE 3000

CMD ["sh", "-c", "exec $START_CMD"]
