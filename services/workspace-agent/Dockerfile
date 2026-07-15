# Debian (glibc), NOT Alpine (musl).
#
# Alpine was disqualifying for anything but Node: without glibc, pip finds no
# `manylinux` wheel and falls back to compiling from source — which then fails
# anyway, since the compiler is apt-deleted from the final image. numpy, pandas,
# pillow, psycopg2 and cryptography were all broken. glibc is also what the
# pre-built shared Nix store is compiled against.
FROM node:24-bookworm-slim AS runtime

# bash: REQUIRED by the terminal's jsh OSC 654 emulation (terminal-session.ts
#   spawns an interactive /bin/bash whose PROMPT_COMMAND/PS1 emit the markers the
#   Bolt client handshakes on).
# git + curl: baseline tools a user expects in an interactive dev terminal.
# xz-utils: unpacks the Nix client tarball below.
# tini: PID 1 init that reaps zombies and forwards SIGTERM. The agent spawns
#   many children (bash shells, PTYs, install/build commands); without an init
#   their exits are never reaped and they accumulate as zombies, and SIGTERM
#   isn't forwarded on pod termination.
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash git curl ca-certificates xz-utils tini procps \
  && rm -rf /var/lib/apt/lists/*

# The Nix CLIENT only (~50 MB). The STORE is not in this image: it is a shared,
# pre-built, read-only disk mounted at /nix by the pod (see
# docs/RUNTIME_NIX_PHASE0_SPIKE.md). We never write to it, so the client is used
# purely to RESOLVE store paths (`nix eval --offline`) — src/nix-env.ts then
# symlinks the already-present binaries into the project's own link farm. No
# daemon, no build, no download at runtime.
ARG NIX_VERSION=2.24.10
RUN curl -fsSL "https://releases.nixos.org/nix/nix-${NIX_VERSION}/nix-${NIX_VERSION}-x86_64-linux.tar.xz" \
      -o /tmp/nix.tar.xz \
  && tar -xJf /tmp/nix.tar.xz -C /tmp \
  && cp "/tmp/nix-${NIX_VERSION}-x86_64-linux/store/"*-nix-*/bin/nix /usr/local/bin/nix \
  && chmod 0755 /usr/local/bin/nix \
  && rm -rf /tmp/nix.tar.xz "/tmp/nix-${NIX_VERSION}-x86_64-linux" \
  && /usr/local/bin/nix --version

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
# glibc/node ABI. The build toolchain is installed, used, then purged to keep the
# runtime image lean (same intent as the previous Alpine .build-deps group).
#
# node-pty lives in optionalDependencies (so local/CI installs without a
# compiler don't hard-fail — terminal-session.ts importOptional()s it). But the
# main install below uses --omit=optional to keep the image lean, which SKIPS
# node-pty entirely → every workspace terminal silently degrades to the non-PTY
# pipe fallback ("bash: cannot set terminal process group: Not a tty / no job
# control"). The runtime IS the one place node-pty is mandatory, so install it
# explicitly here (the compiler is present for the native build).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && npm install --omit=optional --no-audit --no-fund \
  && npm install --no-save --no-audit --no-fund node-pty@^1.0.0 \
  && node -e "require('node-pty'); console.log('node-pty native module loaded OK')" \
  && apt-get purge -y python3 make g++ && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

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
