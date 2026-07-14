/*
 * Server-deployment runtime detection (Replit-parity Lot 3 foundation).
 *
 * A static deploy only serves files; a SERVER deploy must actually RUN the user's
 * app — and a React SPA, an Express API, a Next.js app and a NestJS service each
 * start differently. This module inspects the project (package.json + a listing of
 * the top-level files) and resolves the install / build / start commands and the
 * port, or returns a CLEAR error when it cannot — never a silent failure.
 *
 * PORT is imposed as an env var and every start command is normalized to honor it
 * (the deploy injects PORT; frameworks that accept a -p/--port flag get it, the
 * rest are expected to read process.env.PORT — the platform also probes the actually
 * opened port at boot and fails loudly if nothing listens on PORT).
 *
 * Pure + dependency-free so it is fully unit-tested without a workspace pod.
 */

export type ServerFramework =
  | 'nextjs'
  | 'nestjs'
  | 'remix'
  | 'astro-node'
  | 'express'
  | 'fastify'
  | 'koa'
  | 'hapi'
  | 'vite-preview'
  | 'node'
  | 'unknown';

export interface ServerRuntimePlan {
  framework: ServerFramework;
  /** Install step argv (npm/pnpm/yarn/bun), package-manager aware. */
  install: { command: string; args: string[] };
  /** Build command string, or null when the framework needs no build. */
  buildCommand: string | null;
  /** Start command string; PORT is injected as an env var by the deploy. */
  startCommand: string;
  /** Port the app is expected to listen on (imposed via the PORT env var). */
  port: number;
  /** True when this is really a static site (SPA) that should NOT be a server deploy. */
  staticHint: boolean;
  /** Human-readable notes about how the plan was resolved (surfaced in logs). */
  notes: string[];
}

export interface ServerRuntimeDetectionError {
  error: string;
  code:
    | 'NO_PACKAGE_JSON'
    | 'INVALID_PACKAGE_JSON'
    | 'NO_START_COMMAND'
    | 'STATIC_ONLY';
  /** When the project is a static SPA, tell the user to use a static deploy. */
  staticHint?: boolean;
}

export type ServerRuntimeDetection = ServerRuntimePlan | ServerRuntimeDetectionError;

export function isDetectionError(d: ServerRuntimeDetection): d is ServerRuntimeDetectionError {
  return (d as ServerRuntimeDetectionError).code !== undefined;
}

const DEFAULT_PORT = 3000;

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  main?: string;
  type?: string;
  bin?: string | Record<string, string>;
}

/** Detect the package manager from top-level lockfiles (mirrors the build path). */
export function detectPackageManagerInstall(topLevelFiles: string[]): { command: string; args: string[] } {
  const names = new Set(topLevelFiles.map((p) => p.split('/').pop() ?? p));

  if (names.has('pnpm-lock.yaml')) return { command: 'pnpm', args: ['install', '--prod=false'] };
  if (names.has('yarn.lock')) return { command: 'yarn', args: ['install', '--production=false'] };
  if (names.has('bun.lockb')) return { command: 'bun', args: ['install'] };

  // `--legacy-peer-deps`: AI-generated apps routinely ship peer-dep conflicts that
  // npm v7+ turns into a hard ERESOLVE (the dev server tolerates them); match that.
  return { command: 'npm', args: ['install', '--include=dev', '--no-audit', '--no-fund', '--legacy-peer-deps'] };
}

function hasDep(pkg: PackageJson, name: string): boolean {
  return Boolean((pkg.dependencies && pkg.dependencies[name]) || (pkg.devDependencies && pkg.devDependencies[name]));
}

/**
 * Ensure a start command carries the PORT. Frameworks that take an explicit flag get
 * it appended when absent; everything else relies on process.env.PORT (which the
 * deploy always sets) — we don't rewrite an arbitrary command's internals.
 */
function withPortFlag(command: string, flag: string): string {
  if (/(^|\s)(-p|--port)(\s|=)/.test(command)) return command; // already specifies a port
  return `${command} ${flag} $PORT`;
}

/**
 * Resolve how to install / build / start a server app from its manifest + file list.
 * Returns a ServerRuntimeDetectionError (never throws) when it cannot start the app.
 */
export function detectServerRuntime(input: {
  packageJson: string | null | undefined;
  /** Top-level file names (or relative paths) in the project root. */
  topLevelFiles?: string[];
}): ServerRuntimeDetection {
  const topLevelFiles = input.topLevelFiles ?? [];
  const install = detectPackageManagerInstall(topLevelFiles);

  if (!input.packageJson || !input.packageJson.trim()) {
    return { error: 'No package.json found — cannot determine how to start this app.', code: 'NO_PACKAGE_JSON' };
  }

  let pkg: PackageJson;

  try {
    const parsed = JSON.parse(input.packageJson);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'package.json is not a JSON object.', code: 'INVALID_PACKAGE_JSON' };
    }

    pkg = parsed as PackageJson;
  } catch {
    return { error: 'package.json is not valid JSON.', code: 'INVALID_PACKAGE_JSON' };
  }

  const scripts = pkg.scripts ?? {};
  const notes: string[] = [];
  const port = DEFAULT_PORT;

  // ---- Framework-specific plans (ordered: most specific first) ------------------

  // Next.js — needs a build; `next start` serves it. `-p` sets the port.
  if (hasDep(pkg, 'next')) {
    notes.push('Detected Next.js (next dependency).');
    return {
      framework: 'nextjs',
      install,
      buildCommand: scripts.build?.trim() || 'next build',
      startCommand: withPortFlag(scripts.start?.trim() || 'next start', '-p'),
      port,
      staticHint: false,
      notes,
    };
  }

  // NestJS — compiled to dist; `node dist/main`. Build via nest/tsc.
  if (hasDep(pkg, '@nestjs/core')) {
    notes.push('Detected NestJS (@nestjs/core).');
    return {
      framework: 'nestjs',
      install,
      buildCommand: scripts.build?.trim() || 'nest build',
      startCommand: scripts['start:prod']?.trim() || scripts.start?.trim() || 'node dist/main.js',
      port,
      staticHint: false,
      notes,
    };
  }

  // Remix (built app served by its own server) — build then start.
  if (hasDep(pkg, '@remix-run/serve') || hasDep(pkg, '@remix-run/node')) {
    notes.push('Detected Remix.');
    return {
      framework: 'remix',
      install,
      buildCommand: scripts.build?.trim() || 'remix build',
      startCommand: scripts.start?.trim() || 'remix-serve ./build/index.js',
      port,
      staticHint: false,
      notes,
    };
  }

  // Astro with the Node adapter — SSR server.
  if (hasDep(pkg, 'astro') && hasDep(pkg, '@astrojs/node')) {
    notes.push('Detected Astro (Node adapter, SSR).');
    return {
      framework: 'astro-node',
      install,
      buildCommand: scripts.build?.trim() || 'astro build',
      startCommand: scripts.start?.trim() || 'node ./dist/server/entry.mjs',
      port,
      staticHint: false,
      notes,
    };
  }

  // ---- Static SPA guard --------------------------------------------------------
  // A Vite/CRA app with NO server dependency and no custom `start` is a STATIC site,
  // not a server deploy. Tell the user to use a static deploy instead of silently
  // starting `vite preview` (which is a dev tool, not a production server).
  const serverDeps = ['express', 'fastify', 'koa', '@hapi/hapi', 'hapi', 'http', 'node:http'];
  const hasServerDep = serverDeps.some((d) => hasDep(pkg, d));
  const isVite = hasDep(pkg, 'vite') || topLevelFiles.some((f) => /^vite\.config\./.test(f.split('/').pop() ?? f));
  const isCra = hasDep(pkg, 'react-scripts');

  if ((isVite || isCra) && !hasServerDep && !scripts.start) {
    return {
      error:
        'This looks like a static single-page app (Vite/CRA with no server). Deploy it as a Static site — ' +
        'a server deploy needs a process that listens on a port.',
      code: 'STATIC_ONLY',
      staticHint: true,
    };
  }

  // Express / Fastify / Koa / Hapi — a real HTTP server. Use its `start` script, or
  // fall back to the framework's conventional entry, honoring PORT via env.
  const frameworkByDep: Array<[string, ServerFramework]> = [
    ['express', 'express'],
    ['fastify', 'fastify'],
    ['koa', 'koa'],
    ['@hapi/hapi', 'hapi'],
  ];

  for (const [dep, framework] of frameworkByDep) {
    if (hasDep(pkg, dep)) {
      notes.push(`Detected ${framework} server (${dep}).`);
      const start = resolveNodeStart(pkg, scripts, topLevelFiles);

      if (!start) {
        return {
          error:
            `Detected ${framework} but couldn't find an entry point. Add a "start" script (e.g. "node server.js") ` +
            'or a "main" field to package.json.',
          code: 'NO_START_COMMAND',
        };
      }

      return {
        framework,
        install,
        buildCommand: scripts.build?.trim() || null,
        startCommand: start,
        port,
        staticHint: false,
        notes,
      };
    }
  }

  // ---- Generic Node fallback ---------------------------------------------------
  // Any project with a start script (or a main/entry file) can run as a server.
  const genericStart = resolveNodeStart(pkg, scripts, topLevelFiles);

  if (genericStart) {
    notes.push('Generic Node app (start script / entry file).');
    return {
      framework: 'node',
      install,
      buildCommand: scripts.build?.trim() || null,
      startCommand: genericStart,
      port,
      staticHint: false,
      notes,
    };
  }

  return {
    error:
      'Could not determine how to start this app: no "start" script, no "main" entry, and no recognized framework. ' +
      'Add a "start" script to package.json (e.g. "node server.js").',
    code: 'NO_START_COMMAND',
  };
}

/**
 * Resolve a start command for a plain Node app: an explicit `start` script wins;
 * otherwise `node <main>` when `main` points at a real file; otherwise a common
 * entry file (server.js, app.js, index.js, src/…) present in the listing.
 */
function resolveNodeStart(pkg: PackageJson, scripts: Record<string, string>, topLevelFiles: string[]): string | null {
  if (scripts.start && scripts.start.trim()) {
    return scripts.start.trim();
  }

  const names = new Set(topLevelFiles.map((p) => p.replace(/^\.\//, '')));

  if (pkg.main && typeof pkg.main === 'string' && pkg.main.trim()) {
    return `node ${pkg.main.trim()}`;
  }

  for (const entry of ['server.js', 'app.js', 'index.js', 'server.mjs', 'index.mjs', 'src/server.js', 'src/index.js']) {
    if (names.has(entry)) {
      return `node ${entry}`;
    }
  }

  return null;
}

/*
 * Boot command for the durable server-deploy pod. The pod runs the platform
 * runtime image (has node + npm, NOT the user's app), so the boot script fetches
 * the app SOURCE artifact (a signed URL to the tarball snapshotted from the
 * workspace), installs deps (dev deps INCLUDED — the image runs NODE_ENV=production,
 * so a plain `npm install` would drop the build toolchain like vite), runs the
 * detected build, then execs the detected start command with PORT set. This is the
 * exact flow proven live against real Express / Next.js / SPA-server apps.
 *
 * fail-fast: any install/build failure exits non-zero so the Deployment surfaces it
 * (pod not Ready) instead of silently serving nothing.
 */
export function buildServerBootScript(plan: {
  install: { command: string; args: string[] };
  buildCommand: string | null;
  startCommand: string;
}): string {
  const installCmd = [plan.install.command, ...plan.install.args].join(' ');
  const lines = [
    'set -e',
    // APP_SRC_URL is a signed URL to the source tarball; APP_SRC_B64 is an inline
    // fallback for tiny apps. Whichever is set wins.
    'mkdir -p /tmp/app',
    'if [ -n "$APP_SRC_URL" ]; then echo "[boot] fetching app artifact"; curl -fsSL "$APP_SRC_URL" -o /tmp/app.tgz;',
    'elif [ -n "$APP_SRC_B64" ]; then echo "$APP_SRC_B64" | base64 -d > /tmp/app.tgz;',
    'else echo "[boot] no app artifact (APP_SRC_URL/APP_SRC_B64)"; exit 1; fi',
    'tar -xzf /tmp/app.tgz -C /tmp/app',
    'cd /tmp/app',
    `echo "[boot] install"; ${installCmd}`,
    plan.buildCommand ? `echo "[boot] build"; ${plan.buildCommand}` : 'echo "[boot] no build step"',
    `echo "[boot] start on PORT=$PORT"; exec sh -c ${JSON.stringify(plan.startCommand)}`,
  ];
  return lines.join('\n');
}

/*
 * ---------------------------------------------------------------------------
 * Deploy-target auto-detection (Replit-parity: the user does NOT choose).
 *
 * Replit picks Autoscale (server) by default and never asks the user to guess:
 * an app with a backend deploys as a server; a static SPA/site deploys static.
 * `detectDeployTarget` is the single decision layer both the Deploy panel (to
 * SHOW the detected mode) and the deploy handler (to ROUTE to the right path)
 * use, so the shown mode and the executed mode can never disagree.
 * ---------------------------------------------------------------------------
 */
export type DeployMode = 'server' | 'static' | 'unknown';

export interface DeployTargetDetection {
  mode: DeployMode;
  /** e.g. 'nextjs', 'express', 'static', 'unknown' — shown in the panel. */
  framework: string;
  /** Human-readable one-liner: "Detected a Next.js server", "Static site (no server)". */
  reason: string;
  /** Present only when mode==='server': the concrete runtime plan to boot. */
  plan?: ServerRuntimePlan;
  /** Present only when mode==='unknown': why detection could not decide. */
  error?: string;
}

/**
 * Decide how a project should deploy from its package.json + top-level files.
 * Never throws — an undecidable project returns mode 'unknown' with a clear
 * `error` (the panel shows it; the handler fails cleanly) rather than guessing.
 */
export function detectDeployTarget(input: {
  packageJson: string | null | undefined;
  topLevelFiles?: string[];
}): DeployTargetDetection {
  const topLevelFiles = input.topLevelFiles ?? [];
  const detection = detectServerRuntime(input);

  if (!isDetectionError(detection)) {
    return {
      mode: 'server',
      framework: detection.framework,
      reason: detection.notes[0] ?? `Detected a ${detection.framework} server`,
      plan: detection,
    };
  }

  // A Vite/CRA SPA with no server (STATIC_ONLY) is a static deploy, not an error.
  if (detection.code === 'STATIC_ONLY') {
    return { mode: 'static', framework: 'static', reason: 'Static single-page app (no server) — deploy as a static site.' };
  }

  // No package.json (or no start) but a static entry present → a plain static site.
  const hasIndexHtml = topLevelFiles.some((file) => (file.replace(/^\.\//, '').split('/').pop() ?? file) === 'index.html');

  if (hasIndexHtml) {
    return { mode: 'static', framework: 'static', reason: 'Static site (index.html, no server).' };
  }

  return { mode: 'unknown', framework: 'unknown', reason: detection.error, error: detection.error };
}
