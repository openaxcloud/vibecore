FROM node:24-alpine AS runtime

# bash: REQUIRED by the terminal's jsh OSC 654 emulation (terminal-session.ts
#   spawns an interactive /bin/bash whose PROMPT_COMMAND/PS1 emit the markers the
#   Bolt client handshakes on). node:24-alpine ships only busybox ash, so without
#   this the terminal and every AI shell/start/build action fail to start a shell.
# git + curl: baseline tools a user expects in an interactive dev terminal.
# tini: PID 1 init that reaps zombies and forwards SIGTERM. The agent spawns
#   many children (bash shells, PTYs, install/build commands); without an init
#   their exits are never reaped and they accumulate as zombies, and SIGTERM
#   isn't forwarded on pod termination.
RUN apk add --no-cache bash git curl tini

WORKDIR /app

COPY packages/workspace-sdk ./packages/workspace-sdk
COPY packages/observability ./packages/observability
COPY packages/runtime-contract ./packages/runtime-contract
COPY packages/security ./packages/security
COPY services/workspace-agent ./services/workspace-agent

WORKDIR /app/services/workspace-agent

# Rewrite workspace:* references to file: paths and move tsx to dependencies
RUN node -e "\
const fs=require('fs');\
const p=require('./package.json');\
p.dependencies['@vibecore/workspace-sdk']='file:../../packages/workspace-sdk';\
p.dependencies['@vibecore/observability']='file:../../packages/observability';\
p.dependencies['@vibecore/runtime-contract']='file:../../packages/runtime-contract';\
p.dependencies['@vibecore/security']='file:../../packages/security';\
p.dependencies.tsx=p.devDependencies.tsx;\
delete p.devDependencies;\
fs.writeFileSync('package.json', JSON.stringify(p, null, 2));"
# node-pty is a native module: it must be compiled against this image's
# musl/node ABI. Alpine has no compiler by default, so install a virtual
# build-deps group, build, then remove it to keep the runtime image lean.
# Without this, `npm install` fails (node-pty is a regular, non-optional
# dependency) or the terminal silently degrades to the non-PTY pipe fallback.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm install --omit=optional --no-audit --no-fund \
  && apk del .build-deps

# Run as the unprivileged `node` user (uid 1000), matching the pod's
# runAsNonRoot/runAsUser:1000 securityContext. Ensure /app is owned by it so
# npx and any tooling that needs a writable HOME/cache work at runtime.
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV WORKSPACE_ROOT=/workspace

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# tini as PID 1 reaps the agent's spawned children and forwards signals.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "src/server.ts"]
