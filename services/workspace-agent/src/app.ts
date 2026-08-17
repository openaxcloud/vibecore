import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import websocket from '@fastify/websocket';
import { createPrometheusRegistry } from '@vibecore/observability';
import { normalizeShellCommandArgs } from '@vibecore/runtime-contract';
import { detectCommandAbuse, requireProductionSecret } from '@vibecore/security';
import { verifyAgentToken } from '@vibecore/workspace-sdk';
import Fastify, { type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isBinaryBuffer } from './binary-detection.js';
import { createPreviewWsBridgeHandler } from './preview-ws-proxy.js';
import {
  localizedWorkspaceAgentError,
  workspaceAgentError,
  workspaceAgentLocaleFromHeader,
  workspaceAgentMessage,
  workspaceAgentMessageKeyForEnglish,
  type WorkspaceAgentLocale,
  type WorkspaceAgentPublicError,
} from './public-i18n.js';
import { TerminalSessionManager, type TerminalSession } from './terminal-session.js';

export interface WorkspaceAgentOptions {
  workspaceRoot?: string;
  tokenSecret?: string;
  workspaceId?: string;
  maxFileBytes?: number;
  maxOutputBytes?: number;
  commandTimeoutMs?: number;
  maxProcesses?: number;

  /*
   * Running-process registry. Defaults to a fresh Map; injectable so tests can
   * seed process records and assert the /busy classification deterministically
   * without spawning real children.
   */
  processes?: Map<string, ProcessRecord>;
}

export interface ProcessRecord {
  id: string;
  command: string;
  startedAt: string;
  process: ChildProcessWithoutNullStreams;
  output?: string;
}

/*
 * Reject NUL and other control bytes in any path. A path like "foobar"
 * passes a bare z.string().min(1) and node:path.resolve, but fs then throws a
 * raw TypeError ("must be a string without null bytes") that surfaced as an
 * opaque 500/502. Validate up-front so it becomes a clean 400.
 */
const safePathString = z
  .string()
  .min(1)

  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
    message: workspaceAgentMessage('pathControlCharacters'),
  });

const filePathSchema = z.object({ path: safePathString });

// `encoding` lets callers send binary files as base64; absent = utf8 text.
const writeSchema = z.object({
  path: safePathString,
  content: z.string(),
  encoding: z.enum(['utf8', 'base64']).optional(),
});

/**
 * Decode a write payload to the bytes to persist. base64 content (binary files
 * from zip import / snapshots) must be decoded, not written as a utf8 string,
 * or every image/font/wasm lands corrupted.
 */
function decodeWriteContent(content: string, encoding?: 'utf8' | 'base64'): Buffer {
  return Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
}

const createSchema = writeSchema
  .partial({ content: true })
  .extend({ path: safePathString, directory: z.boolean().default(false) });

const renameSchema = z.object({ from: safePathString, to: safePathString });

const commandSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),

  /*
   * Optional working directory RELATIVE to the workspace root. The client sends
   * this for projects whose package.json lives in a subdirectory (monorepo /
   * "app in a subfolder"): without it every command ran in the root and
   * `npm install` / `npm run dev` hit `ENOENT: package.json`. Resolved through
   * resolveWorkspacePath so it can never escape the workspace.
   */
  cwd: safePathString.optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const snapshotSchema = z.object({ files: z.array(writeSchema).default([]) });

/*
 * The agent's own signing secret must NEVER reach user-controlled child
 * processes (terminals, run_command, streamed commands). Passing process.env
 * verbatim leaked WORKSPACE_AGENT_TOKEN_SECRET into every shell the tenant runs,
 * letting their code read it and forge agent tokens for OTHER workspaces
 * (cross-tenant filesystem/command takeover). Strip the agent-private control
 * vars before spawning; the user's own project env/secrets (injected into the
 * pod by the workspace-manager) are preserved.
 */
const AGENT_PRIVATE_ENV_KEYS = ['WORKSPACE_AGENT_TOKEN_SECRET'];

/*
 * Whether a spawned command is a production BUILD (as opposed to a dev server /
 * install / REPL). Used to decide if a leaked `NODE_ENV=production` should be
 * preserved (builds legitimately want it — Vite/webpack derive the bundle's
 * `process.env.NODE_ENV` define + minification from it) or coerced to
 * development (dev servers REQUIRE it — see sanitizedChildEnv). Matches a
 * standalone `build` token in the command or its args, so `vite build`,
 * `npm run build`, `next build`, `react-scripts build`, `nest build`, etc. are
 * recognized, while `vite`, `npm run dev`, `next dev` are not.
 */
export function isProductionBuildCommand(command: string, args: readonly string[] = []): boolean {
  return /\bbuild\b/.test([command, ...args].join(' ').toLowerCase());
}

/*
 * Classify a TRANSIENT package-manager install/add/ci as a "busy" command, used
 * by the /busy endpoint so the workspace GC never stops a pod mid-`npm install`.
 * Conservative on purpose: only a KNOWN package manager (npm/pnpm/yarn/bun)
 * followed by an install/add/ci subcommand — plus a bare `yarn`, which installs.
 * A dev server or REPL (`vite`, `npm run dev`, `pnpm start`, `next dev`,
 * `npm run preview`) has no install subcommand and is NOT matched, so a
 * long-lived dev server never keeps a workspace pinned as busy. The receiver
 * passes the full recorded command string (executable + args joined), so the
 * package-manager token is the first token and the subcommand the second.
 */
export function isTransientPackageCommand(command: string): boolean {
  const tokens = command.toLowerCase().trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return false;
  }

  // Strip any leading path (e.g. /usr/local/bin/npm) so `pnpm`, `yarn`, … match.
  const manager = (tokens[0].split('/').pop() ?? tokens[0]).replace(/\.(cmd|exe)$/, '');
  const subcommand = tokens[1];

  /*
   * A bare `yarn` (no subcommand) runs an install; every other manager needs an
   * explicit install/add/ci subcommand to touch node_modules.
   */
  if (manager === 'yarn' && subcommand === undefined) {
    return true;
  }

  if (manager !== 'npm' && manager !== 'pnpm' && manager !== 'yarn' && manager !== 'bun') {
    return false;
  }

  return subcommand === 'install' || subcommand === 'i' || subcommand === 'ci' || subcommand === 'add';
}

export function sanitizedChildEnv(
  base: NodeJS.ProcessEnv = process.env,
  spawnCommand?: { command: string; args: readonly string[] },
): NodeJS.ProcessEnv {
  const env = { ...base };

  for (const key of AGENT_PRIVATE_ENV_KEYS) {
    delete env[key];
  }

  /*
   * These are DEVELOPMENT workspaces: every child the tenant runs for "Run to
   * preview" is a dev server / install / REPL, never a production deploy. The pod
   * image inherits NODE_ENV=production from the platform base, which silently
   * breaks dev tooling — most destructively Vite: under NODE_ENV=production,
   * `react/jsx-dev-runtime` resolves to its PRODUCTION stub where `jsxDEV` is
   * `void 0`, so Vite pre-bundles it that way and every compiled JSX module hits
   * `_jsxDEV is not a function` → React never mounts → the app is BLANK even
   * though the dev server serves HTTP 200. (It also makes `npm install` omit
   * devDependencies like vite / @vitejs/plugin-react.) Coerce a leaked production
   * value to development for dev-server / install / terminal children. A genuine
   * production BUILD keeps it — Vite/webpack drive the output bundle's NODE_ENV
   * define + minification off this value, so a build must stay production.
   */
  if (
    env.NODE_ENV === 'production' &&
    !(spawnCommand && isProductionBuildCommand(spawnCommand.command, spawnCommand.args))
  ) {
    env.NODE_ENV = 'development';
  }

  /*
   * The agent's own control port (PORT — baked into the agent image as 8080)
   * leaks into every child via process.env. A dev server that HONORS PORT
   * (Express, CRA, Next, a bare node:http `listen(process.env.PORT)`) would then
   * try to bind the agent's control port and crash-loop on EADDRINUSE — never
   * listening, never appearing in /ports, so the preview never comes up. (A Vite
   * app escapes only because Vite ignores PORT and we pin it to 5173 via args.)
   * In the preview env (VITE_HMR_CLIENT_PORT is injected there) DELETE the
   * inherited control port so a PORT-honoring framework falls back to its own
   * default (3000, etc.) — surfaced by /ports and reachable via its own preview
   * host — instead of colliding with the agent. We must NOT repoint it at Vite's
   * pinned port (5173): a project that runs BOTH Vite and a PORT-honoring helper
   * (or any second server) would then have the helper bind 5173 first and make
   * the Vite `--strictPort` launch die with "Port 5173 is already in use". An
   * explicit `--port`/`-p` flag still wins because frameworks read PORT only as a
   * default. No-op outside the preview env.
   */
  const agentControlPort = Number(process.env.PORT) || 8080;
  const childPort = Number(env.PORT);

  if (env.VITE_HMR_CLIENT_PORT && Number.isFinite(childPort) && childPort === agentControlPort) {
    delete env.PORT;
  }

  /*
   * Activate the shared Nix toolchain (Nix v2 signed catalog) so a Python/Go
   * project's `python`, `uv`, `pip`, `virtualenv`, `go` resolve automatically —
   * no manual venv-path munging, no per-project setup. The alpine base image has
   * none of these; the RO /nix store bundles them per-runtime under
   * /nix/ecode/catalog.json's `envs[].profile`. We APPEND the profile bin dirs so
   * the base image's own tools (node/npm) keep priority and behavior is unchanged
   * for Node projects — Nix only ADDS the runtimes the base lacks. No-op when
   * /nix isn't mounted (the mount is gated upstream), so this is byte-for-byte
   * inert on a non-Nix workspace.
   */
  const nixBins = nixToolchainBinDirs();

  if (nixBins.length > 0) {
    const current = env.PATH ?? '';
    const parts = current ? current.split(':') : [];
    const toAppend = nixBins.filter((dir) => !parts.includes(dir));

    if (toAppend.length > 0) {
      env.PATH = current ? `${current}:${toAppend.join(':')}` : toAppend.join(':');
    }
  }

  return env;
}

/*
 * Resolve the Nix v2 activation-bundle bin dirs from the signed catalog, once.
 * Returns [] (cached) when /nix isn't mounted or the catalog is absent/malformed,
 * so a non-Nix workspace pays nothing and behaves exactly as before.
 */
let nixToolchainBinDirsCache: string[] | undefined;
const NIX_CATALOG_PATH = '/nix/ecode/catalog.json';

export function nixToolchainBinDirs(catalogPath: string = NIX_CATALOG_PATH): string[] {
  // Cache ONLY the real production path (read once per agent process). An explicit
  // path is a test override and is always recomputed so tests stay isolated.
  const useCache = catalogPath === NIX_CATALOG_PATH;

  if (useCache && nixToolchainBinDirsCache !== undefined) {
    return nixToolchainBinDirsCache;
  }

  let bins: string[] = [];

  try {
    if (existsSync(catalogPath)) {
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
        envs?: Record<string, { profile?: string }>;
      };

      for (const entry of Object.values(catalog.envs ?? {})) {
        const bin = entry.profile ? `${entry.profile}/bin` : undefined;

        if (bin && existsSync(bin) && !bins.includes(bin)) {
          bins.push(bin);
        }
      }
    }
  } catch {
    // A malformed/unreadable catalog must never break spawning a shell.
    bins = [];
  }

  if (useCache) {
    nixToolchainBinDirsCache = bins;
  }

  return bins;
}

/*
 * Layer B of the "generated project must serve Vite on 5173" guarantee (Layer A is
 * the vite.config port pin in app/lib/runtime/vite-hmr-config.ts). A Vite CLI
 * `--port`/`--strictPort`/`--host` flag OVERRIDES `server.port` in the config, so
 * forcing it AT LAUNCH pins 5173 regardless of what the config ended up saying —
 * covering the cases Layer A can't (a config it couldn't safely wrap, or a dev
 * command whose config was never processed). Without this, a model config binding
 * its own port (e.g. 3000) leaves Vite listening where the preview proxy never
 * polls → endless `preview.proxy.unreachable port:5173`.
 *
 * SCOPED so it never disturbs a non-Vite runtime: only the preview env
 * (VITE_HMR_CLIENT_PORT set) and only a recognized Vite DEV invocation get the
 * flags. `next dev`, `astro dev`, `remix dev`, webpack, etc. — whose proxies target
 * their own ports and which would choke on `--strictPort` — are left untouched, as
 * are `vite build`/`vite preview` and any command already carrying an explicit port.
 */
/**
 * The port the preview proxy targets for a Vite app and where the dev server is
 * pinned. Single-sourced so the `--port` pin and the child-env `PORT` repoint
 * (sanitizedChildEnv) can never drift apart.
 */
export const PREVIEW_DEV_PORT = 5173;

export const VITE_DEV_PIN_ARGS = ['--port', String(PREVIEW_DEV_PORT), '--strictPort', '--host'] as const;

const PACKAGE_MANAGER_BINS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const RUNNER_SUBCOMMANDS = new Set(['exec', 'dlx', 'x']);
const VITE_NON_DEV_SUBCOMMANDS = new Set(['build', 'preview', 'optimize']);

/*
 * Package-manager positionals that are NOT a runnable script name (so `pnpm dev`
 * resolves to the "dev" script but `pnpm install` / `yarn add` are ignored).
 */
const PM_NON_SCRIPT_POSITIONALS = new Set([
  'install',
  'i',
  'add',
  'remove',
  'rm',
  'uninstall',
  'update',
  'up',
  'upgrade',
  'ci',
  'run',
  'exec',
  'dlx',
  'x',
  'create',
  'init',
  'link',
  'unlink',
  'audit',
  'why',
  'list',
  'ls',
  'outdated',
  'store',
  'dedupe',
  'import',
  'prune',
]);

function commandBaseName(command: string): string {
  return command.split(/[\\/]/).pop()?.toLowerCase() ?? command.toLowerCase();
}

// Drop leading npx/bunx flags to reach the executed package name (`npx --yes vite` → `vite`).
function skipNpxFlags(args: readonly string[]): string[] {
  const valueFlags = new Set(['-p', '--package', '-c', '--call']);

  let index = 0;

  while (index < args.length && args[index].startsWith('-')) {
    const flag = args[index];
    index += 1;

    if (valueFlags.has(flag) && index < args.length && !args[index].startsWith('-')) {
      index += 1; // consume the flag's separate value (e.g. `--package vite`)
    }
  }

  return args.slice(index);
}

/*
 * Is a package.json `scripts` body a PLAIN Vite dev server (`vite`, `vite --host`,
 * `npx vite`, `cross-env FOO=bar vite`), as opposed to `vite build`, a non-Vite
 * runtime (`next dev`), or a composite (`concurrently "vite" ...`) where a
 * passed-through `--` flag would land on the wrong process? Mirrors the client's
 * workbench `#isSimpleViteDevScript` so both layers agree on what counts as Vite.
 */
function isSimpleViteDevScript(script: string): boolean {
  const trimmed = script.trim();

  // Any shell metacharacter means the flag can't be safely passed through to vite.
  if (!trimmed || /[;&|<>$`]/.test(trimmed)) {
    return false;
  }

  const tokens = trimmed.split(/\s+/);
  const viteIndex = tokens.findIndex((token) => token === 'vite' || token.endsWith('/vite'));

  if (viteIndex < 0) {
    return false;
  }

  // Everything before `vite` must be a harmless runner prefix or an ENV=value setter.
  const prefixOk = tokens
    .slice(0, viteIndex)
    .every(
      (token) =>
        ['npx', 'pnpm', 'yarn', 'bun', 'exec', 'dlx', 'x', 'cross-env', '--yes', '-y'].includes(token) ||
        /^[A-Za-z_][A-Za-z0-9_]*=/.test(token),
    );

  if (!prefixOk) {
    return false;
  }

  const sub = tokens[viteIndex + 1];

  return !(sub && VITE_NON_DEV_SUBCOMMANDS.has(sub));
}

type ViteDevAnalysis = { kind: 'direct' } | { kind: 'script' } | { kind: 'none' };

// Classify a (command, args) as a direct Vite dev binary, a package-manager script that runs Vite dev, or neither.
function analyzeViteDevCommand(
  command: string,
  args: readonly string[],
  readScript?: (name: string) => string | undefined,
): ViteDevAnalysis {
  let bin = commandBaseName(command);
  let rest: string[] = [...args];

  // Unwrap runners so `npx vite` / `pnpm exec vite` are seen as the `vite` binary.
  if (bin === 'npx' || bin === 'bunx') {
    rest = skipNpxFlags(rest);
    bin = commandBaseName(rest[0] ?? '');
    rest = rest.slice(1);
  } else if (PACKAGE_MANAGER_BINS.has(bin) && rest.length > 0 && RUNNER_SUBCOMMANDS.has(rest[0])) {
    bin = commandBaseName(rest[1] ?? '');
    rest = rest.slice(2);
  }

  // Direct Vite binary → dev, unless it's a `build`/`preview`/`optimize` subcommand.
  if (bin === 'vite') {
    const sub = rest.find((arg) => !arg.startsWith('-'))?.toLowerCase();

    return sub && VITE_NON_DEV_SUBCOMMANDS.has(sub) ? { kind: 'none' } : { kind: 'direct' };
  }

  // Package-manager run: `npm run dev`, `pnpm dev`, `yarn dev`, `bun run dev`.
  if (PACKAGE_MANAGER_BINS.has(bin)) {
    const positionals = rest.filter((arg) => !arg.startsWith('-'));

    let scriptName: string | undefined;

    if (positionals[0] === 'run') {
      scriptName = positionals[1];
    } else if (bin !== 'npm' && positionals[0] && !PM_NON_SCRIPT_POSITIONALS.has(positionals[0])) {
      // pnpm/yarn/bun allow the `pnpm dev` shorthand; npm requires an explicit `run`.
      scriptName = positionals[0];
    }

    if (scriptName && readScript && isSimpleViteDevScript(readScript(scriptName) ?? '')) {
      return { kind: 'script' };
    }
  }

  return { kind: 'none' };
}

/*
 * Return `args` with the Vite 5173 pin appended when — and only when — this is a
 * Vite dev launch in the preview env. Idempotent (a command already carrying an
 * explicit `--port` is returned unchanged) and a no-op for every non-Vite runtime.
 * For a package-manager `run` the flags are passed through to the script via `--`
 * (reusing an existing `--` rather than adding a second one).
 */
export function injectViteDevArgs(
  command: string,
  args: readonly string[],
  options: { previewEnv: boolean; readScript?: (name: string) => string | undefined },
): string[] {
  const original = [...args];

  if (!options.previewEnv) {
    return original;
  }

  // Respect an explicit port already on the command (user intent + injection idempotency).
  if (original.some((arg) => arg === '--port' || arg.startsWith('--port='))) {
    return original;
  }

  const analysis = analyzeViteDevCommand(command, original, options.readScript);

  if (analysis.kind === 'direct') {
    return [...original, ...VITE_DEV_PIN_ARGS];
  }

  if (analysis.kind === 'script') {
    // `--` forwards flags to the underlying script; if one is already present, append after it.
    return original.includes('--') ? [...original, ...VITE_DEV_PIN_ARGS] : [...original, '--', ...VITE_DEV_PIN_ARGS];
  }

  return original;
}

/*
 * Read a package.json `scripts` map at `cwd` for the dev-launch pin, so `npm run
 * dev` can be resolved to its real script body (only vite dev scripts get the
 * flag). Best-effort and synchronous: a missing/invalid manifest yields no scripts
 * → injectViteDevArgs treats the command as non-Vite and leaves it untouched.
 */
function readPackageScripts(cwd: string): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    return parsed && typeof parsed.scripts === 'object' && parsed.scripts ? parsed.scripts : {};
  } catch {
    return {};
  }
}

/*
 * Apply the Vite 5173 launch pin to a spawn's args, reading package.json scripts
 * only in the preview env (VITE_HMR_CLIENT_PORT set) so non-preview runs pay
 * nothing and are never altered. Shared by runCommand + runCommandStream.
 */
function pinViteDevArgs(cwd: string, command: string, args: string[]): string[] {
  if (!process.env.VITE_HMR_CLIENT_PORT) {
    return args;
  }

  const scripts = readPackageScripts(cwd);

  return injectViteDevArgs(command, args, {
    previewEnv: true,
    readScript: (name) => scripts[name],
  });
}

/**
 * The pinned port a set of spawn args targets, or null when the args are not a
 * pinned Vite dev launch (`--port <n> --strictPort`, injected by pinViteDevArgs).
 * Only a pinned launch can crash on "port already in use", so only those trigger
 * the conflict-heal below.
 */
export function pinnedDevServerPort(spawnArgs: readonly string[]): number | null {
  if (!spawnArgs.includes('--strictPort')) {
    return null;
  }

  const idx = spawnArgs.indexOf('--port');

  if (idx < 0 || idx + 1 >= spawnArgs.length) {
    return null;
  }

  const port = Number(spawnArgs[idx + 1]);

  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

/*
 * Per-port serialization for pinned dev-server starts. Two dev-server launches
 * that race (the auto-run-preview boot AND an explicit "Run", or a reseed restart
 * overlapping a user start) can BOTH pass the conflict-heal while the port is
 * momentarily free and then BOTH reach the `--strictPort` bind → one crashes with
 * "Port <n> already in use". Chaining each pinned start for a given port behind
 * the previous one turns a concurrent double-start into a clean sequential
 * restart. Keyed by port; the map holds at most a couple of entries.
 */
const pinnedDevPortLocks = new Map<number, Promise<void>>();

/*
 * Authoritative "is this port free?" check: briefly bind it ourselves. Works on
 * every platform (no /proc dependency) and, unlike reading /proc/net/tcp, reflects
 * the true bindability the strictPort dev-server launch is about to test — including
 * the short post-SIGKILL window where a dead holder's socket is not yet released.
 * Binds to 0.0.0.0 so it collides with a dev server bound on any local interface.
 */
async function isPortBindable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '0.0.0.0', () => {
      probe.close(() => resolve(true));
    });
  });
}

export async function acquirePinnedDevPortLock(port: number): Promise<() => void> {
  const prior = pinnedDevPortLocks.get(port) ?? Promise.resolve();

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  // The next acquirer waits until THIS holder releases.
  const chained = prior.then(() => held);
  pinnedDevPortLocks.set(port, chained);

  await prior.catch(() => undefined);

  return () => {
    release();
    // Drop the entry once we are the tail, so the map never grows unbounded.
    if (pinnedDevPortLocks.get(port) === chained) {
      pinnedDevPortLocks.delete(port);
    }
  };
}

/**
 * Guarantee the pinned dev-server port is FREE before a `--strictPort` launch.
 *
 * A Vite dev command is pinned to 5173 with `--strictPort`, so if ANYTHING still
 * holds the port the new spawn dies immediately with "Port 5173 already in use" —
 * the crash that turns the IDE's preview retry into an endless reload with a blank
 * app (the dev server never comes back). Two classes of holder cause it:
 *   1. a TRACKED prior dev server (normal restart) — killed by command marker;
 *   2. an UNTRACKED holder the marker misses — an orphan left when the agent
 *      process restarted (pod alive), a dev server started from the terminal, or
 *      a command whose marker didn't match. killStale used to ignore these, so the
 *      restart crash-looped.
 * Kill the tracked ones (whole process group, so vite's esbuild children die too),
 * then ACTIVELY confirm the socket is released — and if an untracked holder
 * remains, resolve its pid from /proc and SIGKILL it — retrying briefly until the
 * port is free. Linux-only for step 2 (/proc); on a dev host readListeningPorts
 * yields nothing, so it falls back to the tracked kill + settle.
 */
export async function killStalePinnedDevServers(
  processes: Map<string, ProcessRecord>,
  spawnArgs: readonly string[],
): Promise<(() => void) | undefined> {
  const port = pinnedDevServerPort(spawnArgs);

  if (port === null) {
    return undefined;
  }

  /*
   * Take the per-port lock BEFORE freeing the port and hold it across the caller's
   * spawn (the caller releases it a beat after spawning), so a concurrent pinned
   * start can't free-then-bind the same port in the window between our free and
   * our bind. On any failure here, release before rethrowing so the lock can't leak.
   */
  const release = await acquirePinnedDevPortLock(port);

  try {
    const marker = `--port ${port} --strictPort`;
    const stale = [...processes.values()].filter((record) => record.command.includes(marker));

    for (const record of stale) {
      try {
        if (record.process.pid) {
          process.kill(-record.process.pid, 'SIGKILL');
        } else {
          record.process.kill('SIGKILL');
        }
      } catch {
        try {
          record.process.kill('SIGKILL');
        } catch {
          // already exited
        }
      }

      processes.delete(record.id);
    }

    /*
     * Confirm the socket is actually BINDABLE before returning (the strictPort bind
     * is about to run). We probe by briefly binding the port ourselves — authoritative
     * and cross-platform, and it also absorbs the short window after a SIGKILL where
     * the holder is dead but the socket has not been released yet (the old fixed
     * 600ms settle). While it is still held, resolve the owning pid from /proc and
     * SIGKILL that untracked orphan too. Bounded (~1.8s) so a launch never hangs; the
     * agent runs alone in its pod, so the only thing that binds this port is a user
     * dev server, safe to reclaim.
     */
    for (let attempt = 0; attempt < 12; attempt++) {
      if (await isPortBindable(port)) {
        break; // free — safe to bind
      }

      // Still held: find whoever LISTENs on it (Linux /proc) and kill the orphan.
      const listening = await readListeningPorts();
      const inode = listening.get(port);
      const pid = inode !== undefined ? (await readSocketInodeToPid()).get(inode) : undefined;

      if (pid !== undefined && pid !== process.pid) {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // already gone; the next probe will confirm the socket is free
          }
        }
      }

      // Give the kernel a beat to release the socket before re-probing / binding.
      await new Promise((settle) => setTimeout(settle, 150));
    }

    // Held on success — the caller releases it shortly after the strictPort spawn.
    return release;
  } catch (error) {
    release();
    throw error;
  }
}

export function buildWorkspaceAgentApp(options: WorkspaceAgentOptions = {}) {
  const root = resolve(options.workspaceRoot ?? process.env.WORKSPACE_ROOT ?? '/workspace');

  const tokenSecret = requireProductionSecret(
    'WORKSPACE_AGENT_TOKEN_SECRET',
    options.tokenSecret ?? process.env.WORKSPACE_AGENT_TOKEN_SECRET,
    'dev-workspace-agent-secret',
  );

  const workspaceId = options.workspaceId ?? process.env.WORKSPACE_ID;

  const numericEnv = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const maxFileBytes = options.maxFileBytes ?? numericEnv(process.env.WORKSPACE_MAX_FILE_BYTES, 2 * 1024 * 1024);
  const maxOutputBytes = options.maxOutputBytes ?? numericEnv(process.env.WORKSPACE_MAX_OUTPUT_BYTES, 1024 * 1024);
  const commandTimeoutMs = options.commandTimeoutMs ?? numericEnv(process.env.WORKSPACE_COMMAND_TIMEOUT_MS, 30_000);

  /*
   * Streamed commands (dev servers etc.) legitimately run long, but must still
   * be bounded so a never-exiting child can't pin a maxProcesses slot forever
   * after the socket closes. Default 30 min; override via env.
   */
  const streamTimeoutMs = numericEnv(process.env.WORKSPACE_STREAM_TIMEOUT_MS, 30 * 60_000);
  const maxProcesses = options.maxProcesses ?? numericEnv(process.env.WORKSPACE_MAX_PROCESSES, 8);
  const processes = options.processes ?? new Map<string, ProcessRecord>();
  const metrics = createPrometheusRegistry();

  const terminalManager = new TerminalSessionManager({
    cwd: root,
    env: sanitizedChildEnv(),
    maxSessions: maxProcesses,

    /*
     * The Bolt client opens terminals as `/bin/jsh --osc` and the action-runner
     * handshakes on OSC 654 markers; emulate that protocol over the real shell
     * so the terminal and AI shell/start/build actions don't hang. See
     * terminal-session.ts and app/utils/shell.ts.
     */
    osc: true,
  });

  let terminalSessions = 0;

  /*
   * Fastify 5 defaults bodyLimit to 1 MiB. maxFileBytes defaults to 2 MiB, so
   * without raising this any /files/write, /patch/apply, or /snapshots/restore
   * body between 1 and 2 MiB is rejected with a 413 at the body-parse layer
   * before the handler's own size check runs — silently breaking medium file
   * writes. Size comfortably above maxFileBytes to account for JSON overhead.
   */
  const app = Fastify({ logger: false, bodyLimit: maxFileBytes * 2 + 64 * 1024 });

  /*
   * Catch-all parser so the preview proxy can forward binary/multipart/other
   * POST bodies as raw bytes instead of rejecting them with 415. This only
   * handles content types Fastify has no built-in parser for — application/json
   * and the urlencoded/text bodies the agent's own API routes rely on are still
   * parsed by the built-in parsers.
   */
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.addHook('onRequest', async (request, reply) => {
    const locale = workspaceAgentLocaleFromHeader(request.headers['accept-language']);
    reply.header('content-language', locale);
    reply.header('vary', 'Accept-Language');
  });

  app.setErrorHandler((error, request, reply) => {
    const locale = workspaceAgentLocaleFromHeader(request.headers['accept-language']);

    if (error instanceof z.ZodError) {
      const message = workspaceAgentMessage('validationFailed', locale);

      return reply.code(400).send({ statusCode: 400, error: message, message, code: 'VALIDATION_ERROR' });
    }

    const typed = error as WorkspaceAgentPublicError;
    const statusCode = typeof typed.statusCode === 'number' ? typed.statusCode : 500;
    const exactKey = workspaceAgentMessageKeyForEnglish(typed.message);
    const message =
      typed.publicMessageKey || exactKey
        ? workspaceAgentMessage(typed.publicMessageKey ?? exactKey!, locale, typed.publicMessageValues)
        : workspaceAgentMessage(statusCode >= 500 ? 'internalServerError' : 'requestFailed', locale);

    if (statusCode >= 500) {
      request.log.error({ err: error, code: typed.code }, 'workspace-agent request failed');
    }

    return reply.code(statusCode).send({
      statusCode,
      error: message,
      message,
      code: typed.code ?? 'WORKSPACE_AGENT_ERROR',
    });
  });

  app.addHook('onRequest', async (request, reply) => {
    /*
     * /health and /busy are unauthenticated, cluster-internal liveness/activity
     * probes for the workspace-manager (start-gate + GC busy guard). Both are
     * reached over the per-workspace k8s Service before any agent token is
     * minted and expose no tenant data (/busy returns only counts + a boolean).
     */
    if (request.url === '/health' || request.url === '/busy') {
      return;
    }

    /*
     * Fail CLOSED in production when the agent has no workspace identity. The token
     * binding check in verifyAgentToken is `!workspaceId || parsed.workspaceId ===
     * workspaceId`, so an unset workspaceId DISABLES the per-workspace binding and a
     * token minted for ANY workspace would be accepted. The manager always injects
     * WORKSPACE_ID (k8s-client), so this only fires on a misconfig — reject rather
     * than silently fall open. Dev/local (no WORKSPACE_ID) stays lenient.
     */
    if (!workspaceId && process.env.NODE_ENV === 'production') {
      const locale = workspaceAgentLocaleFromHeader(request.headers['accept-language']);
      const message = workspaceAgentMessage('workspaceIdentityNotConfigured', locale);

      return reply.code(503).send({ error: message, message, code: 'WORKSPACE_IDENTITY_NOT_CONFIGURED' });
    }

    const token = readBearerToken(request);
    const verified = token ? verifyAgentToken(token, tokenSecret, workspaceId) : false;

    if (!verified) {
      const locale = workspaceAgentLocaleFromHeader(request.headers['accept-language']);
      const message = workspaceAgentMessage('unauthorized', locale);

      return reply.code(401).send({ error: message, message, code: 'WORKSPACE_AGENT_UNAUTHORIZED' });
    }
  });

  app.get('/health', async () => ({ status: 'ok', workspaceRoot: root }));

  app.get('/files/tree', async (request) => {
    /*
     * Honor an optional `path` to return just that subtree (was silently ignored,
     * always returning the full root tree). resolveWorkspacePath enforces that the
     * target stays inside the workspace root.
     */
    const requestedPath = (request.query as { path?: unknown }).path;

    let start = root;

    if (typeof requestedPath === 'string' && requestedPath.trim()) {
      start = resolveWorkspacePath(root, requestedPath);

      /*
       * resolveWorkspacePath is a LEXICAL check only. Without resolving symlinks,
       * an intra-workspace symlink at `start` would let readdir() enumerate a
       * directory OUTSIDE the workspace root (host-filesystem disclosure). Re-check
       * the real path is contained, like /files/read and the write paths do.
       */
      await assertRealPathContained(root, start);
    }

    /*
     * Map fs errors to proper status (a ?path pointing at a file → ENOTDIR → 400,
     * a removed path → ENOENT → 404) instead of an opaque 500/502.
     */
    return await listTree(root, start).catch(rethrowFsError);
  });
  app.get('/files/read', async (request) => {
    const { path } = filePathSchema.parse(request.query);
    const safePath = resolveWorkspacePath(root, path);

    /*
     * Resolve symlinks and re-check containment so a link inside the workspace
     * can't be followed to read a file outside the workspace root.
     */
    const realPath = await realpath(safePath).catch(rethrowFsError);
    const realRel = relative(await canonicalRoot(root), realPath);

    if (realRel === '..' || realRel.startsWith(`..${sep}`)) {
      throw workspaceAgentError('pathEscapesRoot', { statusCode: 400, code: 'EACCES' });
    }

    const fileStat = await stat(realPath).catch(rethrowFsError);

    if (fileStat.size > maxFileBytes) {
      throw workspaceAgentError('fileTooLargeToRead', { statusCode: 413, code: 'FILE_TOO_LARGE' });
    }

    if (fileStat.isDirectory()) {
      throw workspaceAgentError('pathIsDirectory', { statusCode: 400, code: 'EISDIR' });
    }

    /*
     * Only read regular files. A FIFO/named pipe reports size 0 (passing the
     * size cap) and isDirectory() === false, so without this check readFile()
     * would block a libuv thread-pool worker forever waiting for a writer that
     * never comes — a trivial DoS on the agent's file I/O. Sockets and device
     * nodes are likewise rejected.
     */
    if (!fileStat.isFile()) {
      throw workspaceAgentError('pathNotRegularFile', { statusCode: 400, code: 'EINVAL' });
    }

    /*
     * Read the raw bytes (NOT utf8) so binary files (images/fonts/wasm) survive
     * the round-trip. utf8-decoding a binary buffer replaces every invalid byte
     * sequence with U+FFFD, irreversibly corrupting it. Detect binary git-style
     * (a NUL byte in the first ~8KB) and base64-encode those; text stays utf8 so
     * the common code-read path is byte-identical to before.
     */
    const buffer = await readFile(realPath).catch(rethrowFsError);

    if (isBinaryBuffer(buffer)) {
      return { path, content: buffer.toString('base64'), encoding: 'base64' as const, size: fileStat.size };
    }

    return { path, content: buffer.toString('utf8'), encoding: 'utf8' as const, size: fileStat.size };
  });

  app.post('/files/write', async (request) => {
    const body = writeSchema.parse(request.body);
    assertContentSize(body.content, maxFileBytes, body.encoding);

    const safePath = resolveWorkspacePath(root, body.path);

    /*
     * Check containment BEFORE mkdir. assertRealPathContained realpaths the
     * deepest existing ancestor, so a symlink inside the workspace pointing out of
     * root is caught here — running mkdir first would create directories outside
     * the workspace root along the symlinked path before the check ran.
     */
    await assertRealPathContained(root, safePath);
    await mkdir(dirname(safePath), { recursive: true });
    await assertRealPathContained(root, safePath);

    const writeBuffer = decodeWriteContent(body.content, body.encoding);
    await writeFile(safePath, writeBuffer).catch(rethrowFsError);

    return { path: body.path, bytes: writeBuffer.byteLength };
  });

  app.post('/files/create', async (request) => {
    const body = createSchema.parse(request.body);
    const safePath = resolveWorkspacePath(root, body.path);

    if (body.directory) {
      await assertRealPathContained(root, safePath);
      await mkdir(safePath, { recursive: true });

      return { path: body.path, type: 'directory' };
    }

    const content = body.content ?? '';
    assertContentSize(content, maxFileBytes, body.encoding);

    // Check containment before mkdir so a symlink can't make mkdir create dirs outside root.
    await assertRealPathContained(root, safePath);
    await mkdir(dirname(safePath), { recursive: true });
    await assertRealPathContained(root, safePath);

    // Decode base64 like every other write path, or binary files land on disk as literal base64 text.
    await writeFile(safePath, decodeWriteContent(content, body.encoding), { flag: 'wx' }).catch(rethrowFsError);

    return { path: body.path, type: 'file' };
  });

  app.post('/files/delete', async (request) => {
    const { path } = filePathSchema.parse(request.body);
    const safePath = resolveWorkspacePath(root, path);
    await assertRealPathContained(root, dirname(safePath));
    await rm(safePath, { recursive: true, force: true });

    return { path };
  });

  app.post('/files/rename', async (request) => {
    const body = renameSchema.parse(request.body);
    const from = resolveWorkspacePath(root, body.from);
    const to = resolveWorkspacePath(root, body.to);

    /*
     * Verify containment of the destination before mkdir (a symlink could
     * otherwise make mkdir create dirs outside root).
     */
    await assertRealPathContained(root, to);
    await mkdir(dirname(to), { recursive: true });
    await assertRealPathContained(root, dirname(from));
    await assertRealPathContained(root, to);
    await rename(from, to);

    return { from: body.from, to: body.to };
  });

  app.post('/patch/apply', async (request) => {
    const body = z.object({ files: z.array(writeSchema) }).parse(request.body);

    for (const file of body.files) {
      assertContentSize(file.content, maxFileBytes, file.encoding);

      const safePath = resolveWorkspacePath(root, file.path);

      // Containment before mkdir — see /files/write.
      await assertRealPathContained(root, safePath);
      await mkdir(dirname(safePath), { recursive: true });
      await assertRealPathContained(root, safePath);
      await writeFile(safePath, decodeWriteContent(file.content, file.encoding)).catch(rethrowFsError);
    }

    return { changedFiles: body.files.map((file) => file.path) };
  });

  app.post('/commands/run', async (request) => {
    const body = commandSchema.parse(request.body);

    /*
     * Run in the requested subdirectory (validated to stay within root) so a
     * subfolder project's install/build resolves its own package.json.
     */
    const commandCwd = body.cwd ? resolveWorkspacePath(root, body.cwd) : root;

    return runCommand(commandCwd, body.command, body.args, {
      timeoutMs: Math.min(body.timeoutMs ?? commandTimeoutMs, commandTimeoutMs),
      maxOutputBytes,
      maxProcesses,
      processes,
    });
  });

  app.get('/processes', async () => ({
    processes: [...processes.values()].map((record) => ({
      id: record.id,
      command: record.command,
      startedAt: record.startedAt,
      pid: record.process.pid,
    })),
  }));

  /*
   * Busy signal for the workspace garbage-collector. The manager probes this
   * before stopping an idle RUNNING pod so it never tears one down mid-build /
   * mid-install / mid-deploy (which would corrupt node_modules or a partial
   * dist/). "Busy" is a running child whose command is a TRANSIENT production
   * build or a package install/add/ci — NOT a long-lived dev server (a vite dev
   * process lives in `processes` for the whole session and must never block a
   * stop). Returns only counts + a boolean, never the command strings, so a
   * cluster-internal probe can't leak tenant command lines.
   */
  app.get('/busy', async () => {
    let buildCount = 0;

    for (const record of processes.values()) {
      if (isProductionBuildCommand(record.command) || isTransientPackageCommand(record.command)) {
        buildCount += 1;
      }
    }

    return { busy: buildCount > 0, buildCount };
  });

  app.post('/processes/:id/kill', async (request) => {
    const id = (request.params as { id: string }).id;
    const record = processes.get(id);

    /*
     * Streamed commands are spawned detached (own process group), so signal the
     * GROUP (negative pid) to take down the dev server's children too; the direct
     * .kill() left grandchildren orphaned (leaked processes + held ports).
     */
    if (record?.process.pid) {
      try {
        process.kill(-record.process.pid, 'SIGTERM');
      } catch {
        try {
          record.process.kill('SIGTERM');
        } catch {
          // already exited
        }
      }
    }

    processes.delete(id);

    return { killed: Boolean(record), id };
  });

  app.get('/ports', async () => ({ ports: await detectPorts(processes) }));

  app.all('/preview/:port/*', async (request, reply) => {
    const port = Number((request.params as { port: string; '*': string }).port);
    const targetPath = (request.params as { '*': string })['*'] ?? '';

    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      const locale = workspaceAgentLocaleFromHeader(request.headers['accept-language']);
      const message = workspaceAgentMessage('invalidPort', locale);

      return reply.code(400).send({ error: message, message, code: 'INVALID_PORT' });
    }

    /*
     * Never proxy to the agent's own control port — that would let an authed
     * caller loop the proxy back onto the agent's API surface. User dev servers
     * never bind the control port.
     */
    const selfPort = numericEnv(process.env.PORT, 8080);

    if (port === selfPort) {
      const locale = workspaceAgentLocaleFromHeader(request.headers['accept-language']);
      const message = workspaceAgentMessage('invalidPort', locale);

      return reply.code(400).send({ error: message, message, code: 'INVALID_PORT' });
    }

    const queryIndex = request.url.indexOf('?');
    const search = queryIndex >= 0 ? request.url.slice(queryIndex) : '';

    /*
     * Dev servers (Vite `host: true`, CRA, etc.) commonly bind the IPv6 wildcard
     * `[::]` and lean on dual-stack to also accept IPv4. Two things break the
     * naive loopback assumption on the gVisor sandbox the workspace pods run in:
     *   1. there is NO IPv6 loopback (`::1` → EADDRNOTAVAIL), so an `[::1]`
     *      attempt can never connect — it is dead weight, not a real fallback;
     *   2. gVisor's netstack does not reliably deliver a 127.0.0.1 *loopback*
     *      connection to a `[::]`-bound socket (IPv4-mapped-IPv6 over loopback),
     *      so the connect ECONNREFUSEs even though the dev server is up — which
     *      surfaced as a repeated `preview.proxy.unreachable` and a blank preview.
     * A connection to the pod's OWN routable IPv4 (the address the dev server
     * prints as its `Network:` URL) IS delivered to the `[::]` socket, so we try
     * loopback first, then every non-internal interface IPv4, then IPv6 loopback
     * last. On total failure return a clear, logged 502 (dev server starting /
     * crashed) instead of an unhandled 500.
     */
    const candidateHosts = localPreviewHosts();

    let response: Response | undefined;
    let lastError: unknown;

    /*
     * Hoisted to handler scope so the streaming send below can abort the upstream
     * dev-server fetch when the client disconnects mid-stream.
     */
    let previewController: AbortController | undefined;

    for (const host of candidateHosts) {
      const target = new URL(`http://${host}:${port}/${targetPath}`);
      target.search = search;

      /*
       * Bound only the connect/headers phase, then clear the timer. AbortSignal.
       * timeout(30s) governs the ENTIRE response lifetime, so a long-lived preview
       * response — SSE/HMR streams, slow or large assets — was aborted and truncated
       * mid-stream at 30s. A manual controller lets the body stream unbounded once
       * headers have arrived.
       */
      previewController = new AbortController();

      const activeController = previewController;
      const previewConnectTimeout = setTimeout(() => activeController.abort(), 30_000);

      try {
        response = await fetch(target, {
          method: request.method,
          headers: previewProxyHeaders(request.headers),
          body:
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : serializePreviewBody(request.body, request.headers['content-type']),
          redirect: 'manual',
          signal: previewController.signal,
        });
        break;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(previewConnectTimeout);
      }
    }

    if (!response) {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'workspace-agent',
          event: 'preview.proxy.unreachable',
          port,
          error: lastError instanceof Error ? lastError.message : String(lastError),
        }),
      );

      return reply.code(502).send({
        error: workspaceAgentMessage(
          'previewUnavailable',
          workspaceAgentLocaleFromHeader(request.headers['accept-language']),
          { port },
        ),
        message: workspaceAgentMessage(
          'previewUnavailable',
          workspaceAgentLocaleFromHeader(request.headers['accept-language']),
          { port },
        ),
        code: 'PREVIEW_UPSTREAM_UNREACHABLE',
      });
    }

    const upstreamContentType = response.headers.get('content-type') ?? '';

    for (const [key, value] of response.headers.entries()) {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        reply.header(key, value);
      }
    }

    if (!response.body) {
      return reply.code(response.status).send();
    }

    /*
     * HTML documents are small (the index) — buffer and inject the HMR-safety shim
     * so a Vite app with a broken HMR config still mounts (see PREVIEW_HMR_SHIM).
     * Everything else (JS modules, assets, SSE/HMR streams) is streamed untouched.
     */
    if (upstreamContentType.includes('text/html')) {
      const html = await response.text();

      /*
       * Repair a generated index.html that dropped its entry script (blank preview
       * despite a healthy 200 dev server), THEN inject the HMR-safety shim. Both
       * ADD, never replace. `root` is the workspace/Vite project root the dev server
       * serves index.html from.
       */
      return reply.code(response.status).send(injectPreviewHmrShim(ensureViteEntryScript(html, root)));
    }

    /*
     * Stream the upstream body straight to the client instead of buffering the
     * whole response into memory with arrayBuffer(). A large preview asset
     * (build output, media) would otherwise be fully materialized in the agent's
     * heap and could OOM the workspace pod.
     */

    /*
     * Abort the upstream dev-server fetch if the client disconnects mid-stream.
     * Otherwise the fetch keeps draining the dev server's socket + CPU to
     * completion with no consumer. Disconnect-only, so long-lived SSE/HMR streams
     * are unaffected.
     */
    const streamController = previewController;
    reply.raw.on('close', () => {
      if (streamController && !reply.raw.writableFinished) {
        streamController.abort();
      }
    });

    return reply.code(response.status).send(Readable.fromWeb(response.body as ReadableStream<Uint8Array>));
  });

  app.post('/snapshots/create', async () => ({
    id: createHash('sha256').update(`${Date.now()}:${root}`).digest('hex').slice(0, 16),
    createdAt: new Date().toISOString(),
    files: await listSnapshotFiles(root, root),
  }));

  app.post('/snapshots/restore', async (request) => {
    const body = snapshotSchema.parse(request.body);

    for (const file of body.files) {
      assertContentSize(file.content, maxFileBytes, file.encoding);

      const safePath = resolveWorkspacePath(root, file.path);

      // Containment before mkdir — see /files/write.
      await assertRealPathContained(root, safePath);
      await mkdir(dirname(safePath), { recursive: true });
      await assertRealPathContained(root, safePath);
      await writeFile(safePath, decodeWriteContent(file.content, file.encoding)).catch(rethrowFsError);
    }

    return { restoredFiles: body.files.length };
  });

  app.get('/metrics', async (_request, reply) => {
    metrics.setGauge('active_workspaces', { workspaceId: workspaceId ?? 'local' }, 1);
    metrics.setGauge('terminal_sessions', { workspaceId: workspaceId ?? 'local' }, terminalSessions);

    return reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8').send(metrics.render());
  });

  app.register(async (terminalApp) => {
    await terminalApp.register(websocket);
    terminalApp.get('/commands/stream', { websocket: true }, (rawSocket, request) => {
      const socket = normalizeWebSocket(rawSocket);
      const locale = workspaceAgentLocaleFromHeader(request.headers['accept-language']);

      /*
       * Track EVERY child spawned on this socket, not just the most recent one. A client
       * can send multiple `hello` frames (or reconnect/re-handshake); previously only the
       * last child was referenced, so earlier ones were orphaned on disconnect and — since
       * streamed commands have no timeout — leaked until they exited on their own, filling
       * the maxProcesses budget cluster-wide.
       */
      const activeChildren = new Set<ChildProcessWithoutNullStreams>();

      let socketClosed = false;

      terminalSessions += 1;
      socket.onMessage((message) => {
        const payload = parseCommandStreamMessage(message);

        if (!payload || socketClosed) {
          return;
        }

        /*
         * Resolve the optional subdirectory cwd within root (a monorepo / subfolder
         * project installs+runs where ITS package.json is). resolveWorkspacePath
         * throws if the path escapes the workspace — surface that as an error frame
         * instead of crashing the socket handler.
         */
        let commandCwd: string;

        try {
          commandCwd = payload.cwd ? resolveWorkspacePath(root, payload.cwd) : root;
        } catch (error) {
          try {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: {
                  message: localizedWorkspaceAgentError(error, locale, 'commandStreamFailed'),
                  code: (error as WorkspaceAgentPublicError | undefined)?.code ?? 'COMMAND_STREAM_FAILED',
                },
                timestamp: new Date().toISOString(),
              }),
            );
          } catch {
            // socket already closing — drop the frame
          }

          return;
        }

        runCommandStream(commandCwd, payload.command, payload.args ?? [], {
          maxOutputBytes,
          maxProcesses,
          streamTimeoutMs,
          locale,
          processes,
          socket,
          isOpen: () => !socketClosed,
          onActiveProcess: (process) => {
            activeChildren.add(process);
          },
          onComplete: (process) => {
            activeChildren.delete(process);
          },
        }).catch((error) => {
          if (socketClosed) {
            return;
          }

          try {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: {
                  message: localizedWorkspaceAgentError(error, locale, 'commandStreamFailed'),
                  code: (error as WorkspaceAgentPublicError | undefined)?.code ?? 'COMMAND_STREAM_FAILED',
                },
                timestamp: new Date().toISOString(),
              }),
            );
          } catch {
            /*
             * The socket can transition to CLOSING after the socketClosed check
             * above; sending then throws synchronously. Drop the late error frame.
             */
          }
        });
      });
      socket.onClose(() => {
        socketClosed = true;

        /*
         * Streamed commands are spawned detached (own process group), so a bare
         * child.kill() signals only the shell/launcher and leaves its children
         * (a dev server, a `make`-spawned compiler, etc.) orphaned — leaking
         * processes and holding maxProcesses slots + ports. Signal the whole
         * process group via the negative pid, exactly like runCommandStream's
         * killTree; fall back to a direct kill if the group send fails (e.g. the
         * leader already reaped).
         */
        const killChildGroup = (child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals) => {
          if (child.pid === undefined) {
            return;
          }

          try {
            process.kill(-child.pid, signal);
          } catch {
            try {
              child.kill(signal);
            } catch {
              // Already exited — nothing to kill.
            }
          }
        };

        for (const child of activeChildren) {
          killChildGroup(child, 'SIGTERM');

          /*
           * A child that traps/ignores SIGTERM (dev servers, shells) would
           * otherwise orphan and keep holding a maxProcesses slot. Escalate to
           * SIGKILL after a grace period — but CLEAR the timer once the child
           * exits. Otherwise the SIGKILL fires 5s later against -child.pid, and
           * if the OS has recycled that pid the group kill hits the WRONG group.
           */
          const sigkillTimer = setTimeout(() => {
            killChildGroup(child, 'SIGKILL');
          }, 5000);
          sigkillTimer.unref();
          child.once('exit', () => clearTimeout(sigkillTimer));
        }

        activeChildren.clear();
        terminalSessions = Math.max(0, terminalSessions - 1);
      });
    });

    /*
     * Real, persistent terminal. Each connection attaches to a shell session
     * (one long-lived shell process) so cwd, exported env and history persist
     * across commands. Reconnecting with the same ?sessionId reattaches to the
     * running shell and repaints recent scrollback. Backed by a true PTY when
     * node-pty is available, otherwise a process-group shell.
     */
    terminalApp.get('/terminal', { websocket: true }, (rawSocket, request) => {
      const socket = normalizeWebSocket(rawSocket);
      const locale = workspaceAgentLocaleFromHeader(request.headers['accept-language']);
      const requestUrl = new URL(request.url ?? '/terminal', 'http://workspace.local');
      const requestedSessionId = (requestUrl.searchParams.get('sessionId') ?? '').trim();

      const sessionId =
        requestedSessionId ||
        createHash('sha256').update(`terminal:${Date.now()}:${terminalSessions}`).digest('hex').slice(0, 16);

      const cols = clampTerminalDimension(requestUrl.searchParams.get('cols'), 80);
      const rows = clampTerminalDimension(requestUrl.searchParams.get('rows'), 24);

      terminalSessions += 1;

      let session: TerminalSession | undefined;
      let detach: (() => void) | undefined;
      let disposeExitListener: (() => void) | undefined;
      let closed = false;

      /*
       * Input that arrives before the PTY/pipe session is ready is buffered here
       * and flushed once it exists. Bound it: if session creation lags or fails, a
       * client streaming input could otherwise grow this array without limit and
       * exhaust the agent's memory.
       */
      const earlyInput: string[] = [];
      const EARLY_INPUT_MAX_BYTES = 256 * 1024;

      let earlyInputBytes = 0;

      // Latest resize received before the shell session is ready (applied on attach).
      let earlyResize: { cols: number; rows: number } | undefined;

      /*
       * The remote-runtime client (packages/runtime-remote) consumes this socket as a
       * stream of JSON `CommandEvent`s ({ type, data, timestamp }). Sending raw terminal
       * bytes makes the client's JSON.parse throw on every chunk, which both loses all
       * output and tears the socket down, producing an endless "[terminal reconnected]"
       * flap. Always frame output as a stdout CommandEvent.
       */
      const sendOutput = (data: string) => {
        if (!data) {
          return;
        }

        /*
         * The PTY's attach() callback can fire after the client disconnects
         * (scrollback flush, in-flight chunk). socket.send then throws on the
         * closed socket; swallow it so the terminal teardown stays clean.
         */
        try {
          socket.send(JSON.stringify({ type: 'stdout', data, timestamp: new Date().toISOString() }));
        } catch {
          // Socket closed; drop the chunk.
        }
      };

      terminalManager
        .getOrCreate(sessionId, { cols, rows })
        .then((created) => {
          if (closed) {
            /*
             * The client disconnected while the shell was still starting. The
             * reattach-grace dispose timer is only armed by detach(), which we
             * never reached — so without this the unviewed shell leaks forever.
             * Do a no-op attach/detach to arm the grace timer; the session is then
             * reaped after the grace window if nobody reattaches.
             */
            const detachImmediately = created.attach(() => {});
            detachImmediately();

            return;
          }

          session = created;

          /*
           * Apply the reattaching client's viewport: getOrCreate returns the
           * EXISTING shared PTY on a reconnect, which keeps the PREVIOUS client's
           * cols/rows — so without this the shell renders at a stale size until the
           * next manual resize. Guard against 0/NaN from a client that omitted them.
           */
          if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0) {
            created.resize(cols, rows);
          }

          // Repaint the screen for a reattaching client.
          sendOutput(created.scrollback());

          detach = created.attach((chunk) => sendOutput(chunk));

          /*
           * Forward the shell's own exit (user typed `exit`, shell crashed, rc
           * error). The manager removes the session on exit, but without telling
           * the client its terminal silently wedges — no output, no prompt, no
           * close. Emit an exit frame and close the socket so the UI can react.
           */
          disposeExitListener = created.backend.onExit((exitCode) => {
            try {
              socket.send(JSON.stringify({ type: 'exit', exitCode, timestamp: new Date().toISOString() }));
            } catch {
              // Socket already closing — nothing to send.
            }

            try {
              rawSocket.close();
            } catch {
              // Already closed.
            }
          });

          // Flush any keystrokes that arrived before the shell was ready.
          for (const data of earlyInput.splice(0)) {
            created.write(data);
          }

          earlyInputBytes = 0;

          /*
           * Apply the latest resize that arrived before the shell was ready, so
           * the PTY starts at the client's actual viewport instead of the default.
           */
          if (earlyResize) {
            created.resize(earlyResize.cols, earlyResize.rows);
            earlyResize = undefined;
          }
        })
        .catch((error) => {
          sendOutput(
            `\r\n[${workspaceAgentMessage('terminalErrorPrefix', locale)}] ${localizedWorkspaceAgentError(
              error,
              locale,
              'terminalSessionFailed',
            )}\r\n`,
          );

          /*
           * Shell session creation failed: close the socket instead of leaving a
           * zombie WS open with no backing shell (no output, no exit frame, no
           * teardown — the client would just see a dead terminal forever).
           */
          closed = true;

          try {
            rawSocket.close();
          } catch {
            // Already closed.
          }
        });

      socket.onMessage((message) => {
        try {
          const payload = parseTerminalMessage(message);

          if (payload.type === 'resize') {
            const nextCols = clampTerminalDimension(payload.cols, cols);
            const nextRows = clampTerminalDimension(payload.rows, rows);

            if (session) {
              session.resize(nextCols, nextRows);
            } else {
              /*
               * Shell not ready yet — remember the latest dims to apply on attach
               * (a dropped early resize left the PTY at the default size).
               */
              earlyResize = { cols: nextCols, rows: nextRows };
            }

            return;
          }

          if (payload.type === 'kill') {
            terminalManager.dispose(sessionId);
            return;
          }

          if (payload.type === 'signal' || payload.signal) {
            const signal = payload.signal ?? 'SIGINT';

            if (signal === 'SIGINT') {
              session?.interrupt();
            } else {
              /*
               * Only forward a known set of job-control signals. A
               * client-supplied arbitrary/invalid signal name would otherwise
               * reach process.kill and throw ERR_UNKNOWN_SIGNAL.
               */
              const allowedSignals = new Set<NodeJS.Signals>(['SIGTERM', 'SIGHUP', 'SIGQUIT', 'SIGKILL']);

              if (allowedSignals.has(signal as NodeJS.Signals)) {
                session?.backend.kill(signal as NodeJS.Signals);
              }
            }

            return;
          }

          const data = payload.data ?? '';

          if (!data) {
            return;
          }

          if (!session) {
            // Drop buffered input once the cap is hit rather than growing unbounded.
            if (earlyInputBytes < EARLY_INPUT_MAX_BYTES) {
              earlyInput.push(data);
              earlyInputBytes += Buffer.byteLength(data);
            }

            return;
          }

          /*
           * For the no-PTY fallback, a bare Ctrl+C (ETX) can't raise SIGINT on its
           * own, so deliver it to the foreground process group explicitly.
           */
          if (session.backend.mode === 'pipe' && data.includes('\x03')) {
            session.interrupt();
          }

          session.write(data);
        } catch (error) {
          /*
           * Writing to / signalling a PTY whose shell has already exited can throw
           * synchronously (e.g. node-pty "Cannot write to a closed pty"). This runs
           * inside a raw WebSocket event listener with no request-level error
           * boundary, so an uncaught throw would crash the whole agent and every
           * other session in this workspace. Surface it to this client and continue.
           */
          try {
            socket.send(
              JSON.stringify({
                type: 'stdout',
                data: `\r\n[${workspaceAgentMessage('terminalErrorPrefix', locale)}] ${workspaceAgentMessage(
                  'terminalOperationFailed',
                  locale,
                )}\r\n`,
                timestamp: new Date().toISOString(),
              }),
            );
          } catch {
            // Socket already gone; nothing to report.
          }
        }
      });

      socket.onClose(() => {
        closed = true;

        // Detach the viewer but keep the shell alive briefly for reattach.
        detach?.();

        /*
         * Remove THIS connection's onExit listener from the shared, long-lived
         * session. Sessions outlive individual WebSocket connections (reattach by
         * sessionId), and onExit only ever appended — so without removal every
         * reattach leaked a listener (and would emit on a stale/closed socket).
         */
        disposeExitListener?.();
        disposeExitListener = undefined;

        terminalSessions = Math.max(0, terminalSessions - 1);
      });
    });

    /*
     * Vite HMR WebSocket bridge. The preview-proxy forwards the browser's HMR
     * upgrade here at /preview/<port>/*; bridge it to the dev server's own ws on
     * localhost:<port> so HMR stays connected (no "server connection lost" loop).
     * Registered inside the @fastify/websocket scope so it coexists with the
     * terminal ws instead of fighting a raw server 'upgrade' handler.
     */
    terminalApp.get(
      '/preview-hmr/:port/*',
      { websocket: true },
      createPreviewWsBridgeHandler({
        selfPort: numericEnv(process.env.PORT, 8080),
        logger: { warn: (message) => app.log.warn(message) },
      }),
    );

    terminalApp.addHook('onClose', async () => {
      terminalManager.disposeAll();
    });
  });

  return app;
}

function normalizeWebSocket(rawSocket: unknown) {
  const socket = (rawSocket as { socket?: unknown }).socket ?? rawSocket;

  const candidate = socket as {
    send?: (message: string) => void;
    addEventListener?: (event: string, listener: (event: { data?: unknown }) => void) => void;
    on?: (event: string, listener: (message: Buffer) => void) => void;
  };

  if (
    typeof candidate.send !== 'function' ||
    (typeof candidate.on !== 'function' && typeof candidate.addEventListener !== 'function')
  ) {
    throw workspaceAgentError('unsupportedWebSocket');
  }

  return {
    send: candidate.send.bind(candidate),

    /*
     * Expose the raw socket's send-buffer depth so streaming handlers can apply
     * backpressure. The backpressure code previously read bufferedAmount off THIS
     * wrapper object (always undefined), making it dead code.
     */
    bufferedAmount: () => (candidate as { bufferedAmount?: number }).bufferedAmount ?? 0,
    onMessage: (listener: (message: Buffer) => void) => {
      if (typeof candidate.on === 'function') {
        candidate.on('message', listener);
      } else {
        candidate.addEventListener?.('message', (event) => listener(Buffer.from(String(event.data ?? ''))));
      }
    },
    onClose: (listener: () => void) => {
      if (typeof candidate.on === 'function') {
        candidate.on('close', listener);
      } else {
        candidate.addEventListener?.('close', listener);
      }
    },
  };
}

function readBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;

  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length);
  }

  /*
   * Query-param tokens are honored ONLY for WebSocket upgrades (terminal /
   * commands-stream): browsers can't set Authorization on a WS handshake. For
   * plain HTTP a ?token= would leak the bearer credential into proxy/access
   * logs, Referer headers and history, so require the Authorization header —
   * every REST caller (the API runtime proxy) already sends it.
   */
  const isWebSocketUpgrade = String(request.headers.upgrade ?? '').toLowerCase() === 'websocket';

  if (isWebSocketUpgrade) {
    if (typeof (request.query as { token?: unknown } | undefined)?.token === 'string') {
      return (request.query as { token: string }).token;
    }

    return new URL(request.url, 'http://workspace-agent.local').searchParams.get('token') ?? undefined;
  }

  return undefined;
}

/*
 * Map common fs errors to proper HTTP statuses (Fastify honours error.statusCode) so a
 * missing file returns 404 instead of an opaque 500 with a raw Node error message.
 */
function rethrowFsError(error: unknown): never {
  const code = (error as NodeJS.ErrnoException)?.code;

  if (code === 'ENOENT') {
    throw workspaceAgentError('fileNotFound', { statusCode: 404, code: 'ENOENT' });
  }

  if (code === 'EISDIR') {
    throw workspaceAgentError('pathIsDirectory', { statusCode: 400, code: 'EISDIR' });
  }

  if (code === 'ENOTDIR') {
    throw workspaceAgentError('pathNotDirectory', { statusCode: 400, code: 'ENOTDIR' });
  }

  /*
   * `/files/create` writes with flag 'wx', so creating a name that already
   * exists is an ordinary, expected conflict — not a server fault. Left
   * uncoded it escaped as a 500 and the API relabelled it
   * WORKSPACE_AGENT_REQUEST_FAILED (502), which is the *dead pod* signal: the
   * IDE showed "Internal server error" for "New file" on an existing name, and
   * the 502 also trips the local-runtime fallback in dev.
   */
  if (code === 'EEXIST') {
    throw workspaceAgentError('fileAlreadyExists', { statusCode: 409, code: 'EEXIST' });
  }

  /*
   * Disk full / quota exceeded must surface as a distinct, actionable status —
   * otherwise an uncoded 500 bubbles up as a generic WORKSPACE_AGENT_REQUEST_FAILED
   * 502 on the API side (indistinguishable from a dead pod, and it wrongly
   * triggers the local-runtime fallback in dev).
   */
  if (code === 'ENOSPC' || code === 'EDQUOT') {
    throw workspaceAgentError('workspaceDiskFull', { statusCode: 507, code: 'WORKSPACE_DISK_FULL' });
  }

  throw error;
}

function resolveWorkspacePath(root: string, unsafePath: string) {
  const resolved = resolve(root, unsafePath.replace(/^\/+/, ''));
  const rel = relative(root, resolved);

  if (rel.startsWith('..') || rel === '..' || (resolve(root) === resolved && unsafePath.includes('..'))) {
    throw workspaceAgentError('pathEscapesRoot', { statusCode: 400, code: 'EACCES' });
  }

  return resolved;
}

/*
 * Canonical (symlink-resolved) workspace root, used for all containment checks.
 * The lexical root may itself sit under a symlink (e.g. macOS /var -> /private/var),
 * so comparing a resolved real path against the lexical root would spuriously
 * report an escape. Resolved once and cached; falls back to the lexical root
 * until the directory exists on disk.
 */
async function canonicalRoot(root: string): Promise<string> {
  return realpath(root).catch(() => root);
}

/*
 * The lexical resolveWorkspacePath() check can be defeated by a symlink inside
 * the workspace pointing outside it: a user can `ln -s /etc evil`, then a write
 * to `evil/passwd` resolves lexically to `root/evil/passwd` (which passes) but
 * follows the link on disk to escape the root. Re-check the resolved real path:
 * realpath() the deepest existing ancestor (the target itself may not exist yet
 * for a create/write) and confirm it is still contained. Mirrors the symlink
 * guard already applied on the read path.
 */
async function assertRealPathContained(root: string, safePath: string): Promise<void> {
  const realRoot = await canonicalRoot(root);

  /*
   * Reject when the FINAL component is itself a symlink. The loop below
   * realpath()s the deepest existing ancestor, but a DANGLING symlink target
   * (link exists, target doesn't) makes realpath(safePath) throw ENOENT — which
   * the loop mistakes for "not created yet" and approves, after which writeFile
   * FOLLOWS the link and writes outside the workspace root (sandbox escape).
   * A legitimate write/patch/restore never needs to follow a symlink at the
   * target; create (flag 'wx') and rename are already immune. lstat does not
   * follow the link, so it detects the symlink itself.
   */
  const finalStat = await lstat(safePath).catch((error) => {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  });

  if (finalStat?.isSymbolicLink()) {
    throw workspaceAgentError('pathSymbolicLink', { statusCode: 400, code: 'EACCES' });
  }

  let probe = safePath;

  for (;;) {
    const real = await realpath(probe).catch((error) => {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return undefined;
      }

      throw error;
    });

    if (real !== undefined) {
      const rel = relative(realRoot, real);

      if (rel === '..' || rel.startsWith(`..${sep}`)) {
        throw workspaceAgentError('pathEscapesRoot', { statusCode: 400, code: 'EACCES' });
      }

      return;
    }

    const parent = dirname(probe);

    if (parent === probe) {
      return;
    }

    probe = parent;
  }
}

/*
 * Clamp a terminal dimension to a sane positive integer. payload.cols/rows and
 * the ?cols/?rows query come from the client and are only checked for typeof
 * number — Infinity, 1e9, negatives and non-integers all slipped through to
 * pty.resize(), which can throw or allocate absurd buffers.
 */
function clampTerminalDimension(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numeric) || numeric < 1) {
    return fallback;
  }

  return Math.min(Math.floor(numeric), 1000);
}

function assertContentSize(content: string, maxFileBytes: number, encoding?: 'utf8' | 'base64') {
  /*
   * Measure the DECODED byte length, not the length of the (base64) string.
   * A base64 payload is ~4/3 larger than the bytes actually written to disk via
   * decodeWriteContent, so checking Buffer.byteLength(content) false-rejected
   * in-limit binary writes/restores (a ~1.5MiB image base64-encodes to >2MiB and
   * tripped the 2MiB cap) with a spurious 413 FILE_TOO_LARGE.
   */
  const byteLength =
    encoding === 'base64' ? decodeWriteContent(content, encoding).byteLength : Buffer.byteLength(content);

  if (byteLength > maxFileBytes) {
    throw workspaceAgentError('fileTooLarge', { statusCode: 413, code: 'FILE_TOO_LARGE' });
  }
}

function parseTerminalMessage(message: Buffer) {
  const text = message.toString();

  try {
    const parsed = JSON.parse(text) as {
      type?: string;
      data?: string;
      cols?: number;
      rows?: number;
      signal?: string;
    };
    return {
      type: parsed.type ?? 'stdin',
      data: typeof parsed.data === 'string' ? parsed.data : '',
      cols: typeof parsed.cols === 'number' ? parsed.cols : undefined,
      rows: typeof parsed.rows === 'number' ? parsed.rows : undefined,
      signal: typeof parsed.signal === 'string' ? parsed.signal : undefined,
    };
  } catch {
    return { type: 'stdin', data: text, cols: undefined, rows: undefined, signal: undefined };
  }
}

function parseCommandStreamMessage(message: Buffer): { command: string; args?: string[]; cwd?: string } | undefined {
  try {
    const parsed = JSON.parse(message.toString()) as {
      type?: string;
      payload?: { command?: string; args?: string[]; cwd?: string };
    };

    if (parsed.type === 'hello' && typeof parsed.payload?.command === 'string') {
      return {
        command: parsed.payload.command,
        args: parsed.payload.args ?? [],
        cwd: typeof parsed.payload.cwd === 'string' && parsed.payload.cwd.length > 0 ? parsed.payload.cwd : undefined,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/**
 * Turn a parsed Fastify request body back into bytes/string suitable for
 * `fetch`. Without this, a parsed JSON/form object was passed straight to fetch,
 * which coerced it to the literal string "[object Object]" — corrupting every
 * non-GET request (form submissions, API calls) the previewed app makes.
 */
function serializePreviewBody(body: unknown, contentType: string | undefined): string | Buffer | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  // Already raw (binary/multipart via the catch-all parser, or text/plain).
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return body;
  }

  const ct = (contentType ?? '').toLowerCase();

  if (ct.includes('application/x-www-form-urlencoded') && typeof body === 'object') {
    return new URLSearchParams(body as Record<string, string>).toString();
  }

  // application/json (and any other object body) → faithful JSON.
  return JSON.stringify(body);
}

function previewProxyHeaders(headers: FastifyRequest['headers']) {
  const forwarded = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();

    if (['host', 'authorization', 'cookie', 'connection', 'content-length'].includes(lower)) {
      continue;
    }

    if (typeof value === 'string') {
      forwarded.set(key, value);
    } else if (Array.isArray(value)) {
      forwarded.set(key, value.join(','));
    }
  }

  return forwarded;
}

/*
 * Bounds for the materialized tree so a workspace with a giant node_modules /
 * deeply-nested or symlink-looped tree can't exhaust memory/CPU building one
 * in-memory JSON blob. Mirrors listSnapshotFiles' ignore set.
 */
const TREE_MAX_DEPTH = 24;
const TREE_MAX_ENTRIES = 20_000;

async function listTree(
  root: string,
  current: string,
  depth = 0,
  budget: { count: number } = { count: 0 },
): Promise<{ path: string; type: 'file' | 'directory'; children?: unknown[] }[]> {
  if (current === root) {
    await mkdir(root, { recursive: true });
  }

  if (depth >= TREE_MAX_DEPTH) {
    return [];
  }

  const entries = await readdir(current, { withFileTypes: true });
  const nodes = [];

  for (const entry of entries) {
    /*
     * Skip heavy/derived dirs (node_modules, .git, dist, …) — they balloon the
     * tree and are never useful in the file explorer.
     */
    if (entry.isDirectory() && SNAPSHOT_IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    if (budget.count >= TREE_MAX_ENTRIES) {
      break;
    }

    budget.count += 1;

    const fullPath = resolve(current, entry.name);
    const path = relative(root, fullPath);
    const type: 'file' | 'directory' = entry.isDirectory() ? 'directory' : 'file';
    nodes.push({
      path,
      type,

      /*
       * Only recurse into REAL directories (not symlinked ones) to avoid following
       * a symlink loop off-tree or into an ignored target.
       */
      children: entry.isDirectory() ? await listTree(root, fullPath, depth + 1, budget) : undefined,
    });
  }

  return nodes;
}

/*
 * Directories that are regenerable / VCS-internal and must never be walked into
 * a snapshot or export: they routinely blow past the zip-entry cap (a single
 * node_modules easily exceeds the 5000-entry limit, failing the whole export)
 * and waste hundreds of MB reading files that the build reproduces anyway.
 */
const SNAPSHOT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.vite',
  '.next',
  '.cache',
  'dist',
  '.turbo',
  /*
   * `lost+found` is not a project dir: ext4 creates it at the root of every
   * formatted volume, so it surfaced at the top of every PVC-backed workspace.
   * The user saw it in the file tree and then got a 400 on read (root-owned),
   * i.e. an entry they can neither use nor open. Filtered where the tree is
   * produced, rather than papering over the 400 downstream.
   */
  'lost+found',
]);

async function listSnapshotFiles(
  root: string,
  current: string,
): Promise<Array<{ path: string; sha256: string; size: number }>> {
  if (current === root) {
    await mkdir(root, { recursive: true });
  }

  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(current, entry.name);

    if (entry.isDirectory()) {
      if (SNAPSHOT_IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      files.push(...(await listSnapshotFiles(root, fullPath)));
      continue;
    }

    /*
     * Only snapshot regular files. readdir(withFileTypes) does not follow
     * symlinks, so a symlink (e.g. a dangling `ln -s /nonexistent broken` from
     * the terminal) has isFile()===false here — including it would make stat()/
     * createReadStream() throw ENOENT and reject the whole /snapshots/create
     * request (500). Skip non-regular entries, and guard stat/read so one bad
     * entry can't abort the snapshot.
     */
    if (!entry.isFile()) {
      continue;
    }

    try {
      const fileStat = await stat(fullPath);
      const hash = createHash('sha256');

      await new Promise<void>((resolvePromise, reject) => {
        createReadStream(fullPath)
          .on('data', (chunk) => hash.update(chunk))
          .on('error', reject)
          .on('end', () => resolvePromise());
      });

      files.push({ path: relative(root, fullPath), sha256: hash.digest('hex'), size: fileStat.size });
    } catch {
      // Unreadable/vanished entry (dangling symlink, race) — skip it.
      continue;
    }
  }

  return files;
}

async function runCommand(
  cwd: string,
  command: string,
  args: string[],
  options: {
    timeoutMs: number;
    maxOutputBytes: number;
    maxProcesses: number;
    processes: Map<string, ProcessRecord>;
  },
) {
  if (options.processes.size >= options.maxProcesses) {
    throw workspaceAgentError('processLimitReached', { statusCode: 429, code: 'PROCESS_LIMIT_REACHED' });
  }

  const normalizedArgs = normalizeShellCommandArgs(command, args);
  const signal = detectCommandAbuse(command, normalizedArgs);

  if (signal) {
    throw workspaceAgentError('commandBlocked', {
      statusCode: 409,
      code: `ABUSE_${signal.type.toUpperCase()}`,
    });
  }

  // Force a Vite dev server onto 5173 in the preview env (no-op otherwise). See injectViteDevArgs.
  const spawnArgs = pinViteDevArgs(cwd, command, normalizedArgs);

  // Idempotent restart: free the pinned port from a prior/orphan dev server, under a
  // per-port lock held across the spawn below (see runCommandStream + killStalePinnedDevServers).
  const releasePinnedLock = await killStalePinnedDevServers(options.processes, spawnArgs);

  // Release the port lock a beat after the spawn so this child claims the port before
  // a concurrent pinned start's port-free check runs. Scheduled now so it fires even if
  // spawn throws (no deadlock).
  if (releasePinnedLock) {
    setTimeout(releasePinnedLock, 1200);
  }

  const id = createHash('sha256')
    /*
     * randomUUID() (not just Date.now()) so two identical commands started within
     * the same millisecond can't collide and corrupt the process-map accounting.
     */
    .update(`${command}:${spawnArgs.join('\0')}:${Date.now()}:${randomUUID()}`)
    .digest('hex')
    .slice(0, 12);

  /*
   * detached: own process group, so timeout/output-cap termination can signal the
   * WHOLE tree (process.kill(-pid)). Without it a bare child.kill() left a spawned
   * child's grandchildren (e.g. a shell launching a server) orphaned, leaking
   * processes that hold a maxProcesses slot. Mirrors runCommandStream.
   */
  const child = spawn(command, spawnArgs, {
    cwd,
    shell: false,
    env: sanitizedChildEnv(process.env, { command, args: spawnArgs }),
    detached: true,
  });

  const killGroup = (sig: NodeJS.Signals) => {
    if (child.pid === undefined) {
      return;
    }

    try {
      process.kill(-child.pid, sig);
    } catch {
      try {
        child.kill(sig);
      } catch {
        // already exited
      }
    }
  };

  const record = {
    id,
    command: [command, ...spawnArgs].join(' '),
    startedAt: new Date().toISOString(),
    process: child,
    output: '',
  };
  options.processes.set(id, record);

  let stdout = '';
  let stderr = '';
  let truncated = false;

  const timer = setTimeout(() => killGroup('SIGTERM'), options.timeoutMs);

  /*
   * Decode through a StringDecoder per stream, not chunk.toString('utf8'): a
   * multi-byte UTF-8 sequence (emoji/CJK/box-drawing/spinner glyphs in npm/Vite
   * output) split across two 'data' chunks would otherwise decode to U+FFFD
   * replacement chars. The decoder buffers the incomplete tail across chunks.
   * Mirrors runCommandStream and terminal-session.ts.
   */
  const decoders: Record<'stdout' | 'stderr', StringDecoder> = {
    stdout: new StringDecoder('utf8'),
    stderr: new StringDecoder('utf8'),
  };

  const append = (target: 'stdout' | 'stderr', text: string) => {
    if (!text) {
      return;
    }

    const next = (target === 'stdout' ? stdout : stderr) + text;

    if (Buffer.byteLength(next) > options.maxOutputBytes) {
      truncated = true;

      const limited = next.slice(0, options.maxOutputBytes);

      if (target === 'stdout') {
        stdout = limited;
      } else {
        stderr = limited;
      }

      killGroup('SIGTERM');

      return;
    }

    if (target === 'stdout') {
      stdout = next;
    } else {
      stderr = next;
    }

    record.output = `${stdout}\n${stderr}`.slice(-options.maxOutputBytes);
  };

  child.stdout.on('data', (chunk: Buffer) => append('stdout', decoders.stdout.write(chunk)));
  child.stderr.on('data', (chunk: Buffer) => append('stderr', decoders.stderr.write(chunk)));

  // Flush any incomplete multi-byte tail buffered in the decoders when the child exits.
  const flushDecoders = () => {
    append('stdout', decoders.stdout.end());
    append('stderr', decoders.stderr.end());
  };

  /*
   * Guard the pipe Readables: an 'error' event on stdout/stderr with no listener
   * becomes an uncaughtException that crashes the whole agent (and every other
   * session). The ChildProcess 'error'/'exit' handlers don't cover stream errors.
   */
  child.stdout.on('error', () => {});
  child.stderr.on('error', () => {});

  return new Promise((resolvePromise) => {
    /*
     * Escalate to SIGKILL if the child ignores/traps SIGTERM, so a wedged
     * process cannot permanently hold a slot and hang the request.
     */
    const sigkillTimer = setTimeout(() => {
      killGroup('SIGKILL');
    }, options.timeoutMs + 5_000);

    if (typeof sigkillTimer.unref === 'function') {
      sigkillTimer.unref();
    }

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(sigkillTimer);
      flushDecoders();
      options.processes.delete(id);
      resolvePromise({ id, code, signal, stdout, stderr, truncated });
    });

    /*
     * spawn() emits 'error' (e.g. ENOENT for an unknown command) without a
     * matching 'close'. With no listener Node turns this into an uncaught
     * exception that crashes the agent and leaves this promise unresolved,
     * hanging the request. Surface it as a normal failed-command result.
     */
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(sigkillTimer);
      options.processes.delete(id);
      resolvePromise({
        id,
        code: 1,
        signal: null,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`,
        truncated,
      });
    });
  });
}

async function runCommandStream(
  cwd: string,
  command: string,
  args: string[],
  options: {
    maxOutputBytes: number;
    maxProcesses: number;
    streamTimeoutMs: number;
    locale: WorkspaceAgentLocale;
    processes: Map<string, ProcessRecord>;
    socket: ReturnType<typeof normalizeWebSocket>;
    isOpen: () => boolean;
    onActiveProcess: (process: ChildProcessWithoutNullStreams) => void;
    onComplete: (process: ChildProcessWithoutNullStreams) => void;
  },
) {
  if (options.processes.size >= options.maxProcesses) {
    throw workspaceAgentError('processLimitReached', { statusCode: 429, code: 'PROCESS_LIMIT_REACHED' });
  }

  const normalizedArgs = normalizeShellCommandArgs(command, args);
  const signal = detectCommandAbuse(command, normalizedArgs);

  if (signal) {
    throw workspaceAgentError('commandBlocked', {
      statusCode: 409,
      code: `ABUSE_${signal.type.toUpperCase()}`,
    });
  }

  /*
   * Force a Vite dev server onto 5173 in the preview env (no-op otherwise). This is
   * the hot path: streamed commands ARE the dev servers, so the launch pin
   * guarantees the port the preview proxy polls even when the config pin (Layer A)
   * couldn't apply. See injectViteDevArgs.
   */
  const spawnArgs = pinViteDevArgs(cwd, command, normalizedArgs);

  /*
   * Idempotent restart: tear down any prior/orphan dev server holding this port,
   * under a per-port lock held across the spawn below, so the strictPort spawn never
   * dies on "port already in use" (the crash that stranded the preview on an endless
   * reload) — including when two starts race or an orphan survived an agent restart.
   */
  const releasePinnedLock = await killStalePinnedDevServers(options.processes, spawnArgs);

  // Release the port lock a beat after the spawn so this child claims the port before
  // a concurrent pinned start's port-free check runs. Scheduled now so it fires even if
  // spawn throws (no deadlock).
  if (releasePinnedLock) {
    setTimeout(releasePinnedLock, 1200);
  }

  const id = createHash('sha256')
    // randomUUID() guards against same-millisecond id collisions (see runCommand).
    .update(`stream:${command}:${spawnArgs.join('\0')}:${Date.now()}:${randomUUID()}`)
    .digest('hex')
    .slice(0, 12);

  /*
   * detached: own process group so we can SIGTERM/SIGKILL the WHOLE tree. Streamed
   * commands are dev servers etc. that spawn children; killing only the direct
   * child orphaned those grandchildren (leaked processes + held ports).
   */
  const child = spawn(command, spawnArgs, {
    cwd,
    shell: false,
    env: sanitizedChildEnv(process.env, { command, args: spawnArgs }),
    detached: true,
  });

  /*
   * Signal the child's PROCESS GROUP (negative pid) so its children die too;
   * fall back to the direct child if the group send fails (e.g. already exited).
   */
  const killTree = (signal: NodeJS.Signals) => {
    try {
      if (child.pid) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch {
      try {
        child.kill(signal);
      } catch {
        // already exited
      }
    }
  };

  const record: ProcessRecord = {
    id,
    command: [command, ...spawnArgs].join(' '),
    startedAt: new Date().toISOString(),
    process: child,
    output: '',
  };
  options.processes.set(id, record);
  options.onActiveProcess(child);

  /*
   * Backpressure: a runaway child can produce output far faster than a slow WS
   * client drains it. Without pausing, the queued bytes accumulate in the
   * socket's send buffer (bufferedAmount) and OOM the agent. Pause the child's
   * stdout/stderr when the buffer crosses the high-water mark and resume once it
   * drains below half.
   */
  const SEND_BUFFER_HIGH_WATER = 8 * 1024 * 1024;

  let drainTimer: ReturnType<typeof setInterval> | undefined;

  const applyBackpressure = () => {
    const buffered = (options.socket as { bufferedAmount?: () => number }).bufferedAmount?.() ?? 0;

    if (buffered <= SEND_BUFFER_HIGH_WATER || drainTimer) {
      return;
    }

    child.stdout.pause();
    child.stderr.pause();
    drainTimer = setInterval(() => {
      const current = (options.socket as { bufferedAmount?: () => number }).bufferedAmount?.() ?? 0;

      if (!options.isOpen() || current <= SEND_BUFFER_HIGH_WATER / 2) {
        clearInterval(drainTimer);
        drainTimer = undefined;
        child.stdout.resume();
        child.stderr.resume();
      }
    }, 50);
    drainTimer.unref?.();
  };

  /*
   * Decode through a StringDecoder per stream, not chunk.toString('utf8'): a
   * multi-byte UTF-8 sequence (emoji/CJK/accented chars/box-drawing/spinner
   * glyphs — pervasive in npm install / Vite / build output, which is exactly
   * what flows through /commands/stream) that straddles a chunk boundary would
   * otherwise be split and decoded into U+FFFD replacement chars, permanently
   * mangling the rendered log. The decoder buffers the incomplete tail across
   * chunks. stdout and stderr each get their own decoder so an incomplete tail
   * on one stream can't corrupt the other. Mirrors terminal-session.ts.
   */
  const decoders: Record<'stdout' | 'stderr', StringDecoder> = {
    stdout: new StringDecoder('utf8'),
    stderr: new StringDecoder('utf8'),
  };

  const emit = (type: 'stdout' | 'stderr', data: string) => {
    if (!data) {
      return;
    }

    record.output = `${record.output ?? ''}${data}`.slice(-options.maxOutputBytes);

    /*
     * Don't write to a closed socket — the client disconnected and the child is being
     * torn down; the send would throw and the error would be swallowed nowhere useful.
     */
    if (!options.isOpen()) {
      return;
    }

    try {
      options.socket.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
      applyBackpressure();
    } catch {
      /*
       * Socket transitioned to CLOSING after the isOpen() check; drop the chunk
       * instead of throwing out of the child's 'data' listener.
       */
    }
  };

  const send = (type: 'stdout' | 'stderr', chunk: Buffer) => {
    emit(type, decoders[type].write(chunk));
  };

  // Flush any incomplete multi-byte tail buffered in the decoders when the child exits.
  const flushDecoders = () => {
    emit('stdout', decoders.stdout.end());
    emit('stderr', decoders.stderr.end());
  };

  child.stdout.on('data', (chunk) => send('stdout', chunk));
  child.stderr.on('data', (chunk) => send('stderr', chunk));

  // See runCommand: swallow stream-level errors so a pipe read fault can't crash the agent.
  child.stdout.on('error', () => {});
  child.stderr.on('error', () => {});
  child.on('close', () => {
    flushDecoders();

    if (drainTimer) {
      clearInterval(drainTimer);
      drainTimer = undefined;
    }
  });

  /*
   * Bound the lifetime of a streamed command so it can't pin a process slot
   * indefinitely. Mirror the HTTP runCommand path: SIGTERM, then SIGKILL after
   * a grace period. The 'close' handler clears both timers.
   */
  const timeoutTimer = setTimeout(() => {
    if (options.isOpen()) {
      try {
        options.socket.send(
          JSON.stringify({
            type: 'error',
            error: {
              message: workspaceAgentMessage('commandTimedOut', options.locale, {
                milliseconds: options.streamTimeoutMs,
              }),
              code: 'COMMAND_TIMEOUT',
            },
            timestamp: new Date().toISOString(),
          }),
        );
      } catch {
        // Socket gone; the kill below still cleans up the child.
      }
    }

    killTree('SIGTERM');
  }, options.streamTimeoutMs);
  const sigkillTimer = setTimeout(() => {
    killTree('SIGKILL');
  }, options.streamTimeoutMs + 5000);
  sigkillTimer.unref();

  await new Promise<void>((resolvePromise) => {
    child.on('close', (code) => {
      clearTimeout(timeoutTimer);
      clearTimeout(sigkillTimer);

      if (options.isOpen()) {
        try {
          options.socket.send(
            JSON.stringify({ type: 'exit', exitCode: code ?? 0, timestamp: new Date().toISOString() }),
          );
        } catch {
          // Socket closed between the isOpen() check and the send; nothing to deliver.
        }
      }

      options.processes.delete(id);
      options.onComplete(child);
      resolvePromise();
    });

    /*
     * Without an 'error' listener a failed spawn (ENOENT, EACCES, …) becomes an
     * uncaught exception that crashes the agent and leaves the stream promise
     * pending. Report it to the client and resolve cleanly instead.
     */
    child.on('error', (error) => {
      clearTimeout(timeoutTimer);
      clearTimeout(sigkillTimer);

      if (options.isOpen()) {
        try {
          options.socket.send(
            JSON.stringify({
              type: 'error',
              error: {
                message: workspaceAgentMessage('commandStartFailed', options.locale),
                code: 'COMMAND_START_FAILED',
              },
              timestamp: new Date().toISOString(),
            }),
          );
        } catch {
          // Socket already gone; drop the message.
        }
      }

      options.processes.delete(id);
      options.onComplete(child);
      resolvePromise();
    });
  });
}

export type DetectedPort = { port: number; processId: string };

const PREVIEW_HMR_SHIM_MARKER = 'data-ecode-hmr-shim';

/*
 * A tiny classic (non-module, so it runs BEFORE Vite's deferred module scripts)
 * script injected into served preview HTML. A Vite dev server whose config lacks
 * server.hmr — a model-authored vite.config that never got (or lost) the E-Code
 * HMR override — makes the client infer `wss://localhost:undefined`; the WebSocket
 * constructor throws on that invalid URL, the module graph never boots, and the app
 * renders BLANK even though the dev server serves fine on its real port. The shim
 * rewrites any `:undefined` (or localhost) HMR URL to the current preview host so
 * construction can't throw — the app mounts on ANY port, and HMR reconnects through
 * the proxy (or fails silently without blocking the render). Config-independent, so
 * it survives a re-seed that resets the vite.config to its raw form.
 */
const PREVIEW_HMR_SHIM = `<script ${PREVIEW_HMR_SHIM_MARKER}>(function(){if(typeof window==='undefined'||!window.WebSocket)return;var N=window.WebSocket;function P(u,p){try{if(typeof u==='string'&&u.indexOf(':undefined')!==-1){var q=u.indexOf('?');u=(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/'+(q!==-1?u.slice(q):'')}}catch(e){}return new N(u,p)}P.prototype=N.prototype;P.CONNECTING=N.CONNECTING;P.OPEN=N.OPEN;P.CLOSING=N.CLOSING;P.CLOSED=N.CLOSED;window.WebSocket=P})();</script>`;

/*
 * Inject the HMR-safety shim right after <head> so it runs before Vite's module
 * scripts. Idempotent, and a no-op when there is no <head> (never risk mangling a
 * non-standard document). Pure/exported for unit testing.
 */
/** Sentinel on the injected entry script so the repair is idempotent + traceable. */
const VITE_ENTRY_SHIM_MARKER = 'data-ecode-entry-shim';

/** Vite SPA entry files we know how to point index.html at, most-conventional first. */
const VITE_ENTRY_CANDIDATES = [
  'src/main.tsx',
  'src/main.jsx',
  'src/main.ts',
  'src/main.js',
  'src/index.tsx',
  'src/index.jsx',
  'src/index.ts',
  'src/index.js',
  'main.tsx',
  'main.jsx',
] as const;

/**
 * Whether the served HTML already loads the APP entry — a module script whose src
 * points into the project source (`/src/...`, `./src/...`, `src/...`). Vite's own
 * `/@vite/client` and `/@react-refresh` module scripts are NOT the app entry, so they
 * must not count.
 */
export function htmlReferencesAppEntry(html: string): boolean {
  const moduleScript = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

  for (let m = moduleScript.exec(html); m; m = moduleScript.exec(html)) {
    if (/^(?:\.?\/)?src\//i.test(m[1])) {
      return true;
    }
  }

  return false;
}

/**
 * Repair an AI-generated Vite `index.html` that is MISSING its entry script.
 *
 * A Vite dev server serves `index.html` verbatim (plus its own `/@vite/client` +
 * react-refresh injection) — it never adds the app entry. Several generated projects
 * ship an `index.html` with only `<div id="root"></div>` and NO
 * `<script type="module" src="/src/main.tsx">`, so `main.tsx` is never fetched, React
 * never mounts, and the preview is a permanently blank page even though the dev server
 * answers 200. When the HTML has an SPA mount point but no app-entry module script and
 * a conventional entry file exists on disk, inject a `<script type="module">` pointing
 * at it (before `</body>`) — ADDING, never replacing, so our other injections and any
 * real entry are preserved. Pure but for an injected `fileExists` probe so it unit-tests
 * without a filesystem. No-op (unchanged) unless every condition holds.
 */
export function ensureViteEntryScript(
  html: string,
  projectRoot: string,
  fileExists: (path: string) => boolean = existsSync,
): string {
  if (!html || html.includes(VITE_ENTRY_SHIM_MARKER)) {
    return html;
  }

  // Only an SPA mount page (React/Vue/etc. into #root or #app) is a candidate.
  if (!/<div\b[^>]*\bid=["'](?:root|app)["']/i.test(html)) {
    return html;
  }

  if (htmlReferencesAppEntry(html)) {
    return html;
  }

  const entry = VITE_ENTRY_CANDIDATES.find((candidate) => fileExists(join(projectRoot, candidate)));

  if (!entry) {
    return html;
  }

  const tag = `<script type="module" src="/${entry}" ${VITE_ENTRY_SHIM_MARKER}></script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${tag}</body>`);
  }

  return `${html}${tag}`;
}

export function injectPreviewHmrShim(html: string): string {
  if (!html || html.includes(PREVIEW_HMR_SHIM_MARKER)) {
    return html;
  }

  const headMatch = html.match(/<head[^>]*>/i);

  if (!headMatch || headMatch.index === undefined) {
    return html;
  }

  const insertAt = headMatch.index + headMatch[0].length;

  return `${html.slice(0, insertAt)}${PREVIEW_HMR_SHIM}${html.slice(insertAt)}`;
}

/*
 * Decide whether a kernel-observed listening TCP port is a user preview port, and
 * (when it is) the display owner id to use if it can't be tied to a managed command.
 *
 * A workspace pod runs the agent alone, so every listening socket other than the
 * agent's own control port belongs to a user process — INCLUDING ports whose
 * socket-inode -> pid mapping /proc couldn't resolve (gVisor drops that mapping for
 * terminal-started dev servers / under sandbox restrictions). Dropping unattributed
 * ports made port detection fall back to the 5173 heuristic, which guessed wrong for
 * any app binding another port (e.g. a Vite config with server.port: 3000) → the
 * preview proxy polled 5173 forever and the app never showed. Surfacing the real
 * port fixes the preview for ANY port, old or new projects, without config migration.
 */
export function classifyListeningPort(input: {
  port: number;
  pid: number | undefined;
  selfPort: number;
  agentPid: number;
}): { include: boolean; fallbackId: string } {
  if (input.port === input.selfPort || input.pid === input.agentPid) {
    return { include: false, fallbackId: '' };
  }

  return { include: true, fallbackId: input.pid !== undefined ? `pid:${input.pid}` : `port:${input.port}` };
}

/*
 * Authoritative port detection: read the kernel's listening TCP sockets from /proc/net/tcp(6) and
 * attribute each to the managed process (or descendant) that owns it via the socket inode -> pid ->
 * process-tree mapping. The workspace agent runs alone in its per-workspace container, so every
 * listening socket here belongs to user processes — the agent's own control port is excluded because
 * its pid is never a descendant of a tracked record. Falls back to the legacy log/heuristic scrape
 * only when /proc is unavailable (e.g. macOS dev) or yields nothing.
 */
async function detectPorts(processes: Map<string, ProcessRecord>): Promise<DetectedPort[]> {
  try {
    const listening = await readListeningPorts();

    if (listening.size > 0) {
      const inodeToPid = await readSocketInodeToPid();
      const managedPids = new Map<number, string>();

      for (const record of processes.values()) {
        if (typeof record.process.pid === 'number') {
          managedPids.set(record.process.pid, record.id);
        }
      }

      const detected: DetectedPort[] = [];

      // The agent's own control port (mirrors the createApp numericEnv default).
      const selfPort = Number(process.env.PORT) || 8080;

      for (const [port, inode] of listening) {
        const pid = inodeToPid.get(inode);
        const classification = classifyListeningPort({ port, pid, selfPort, agentPid: process.pid });

        if (!classification.include) {
          continue;
        }

        /*
         * When we resolved a pid, prefer attributing the port to a tracked managed
         * command (falling back to a synthetic pid id). With no pid, use the
         * port-scoped id from the classifier — the port is still real (see
         * classifyListeningPort) so it must drive the preview, not be dropped.
         */
        const managedId = pid !== undefined ? await owningManagedProcess(pid, managedPids) : undefined;
        detected.push({ port, processId: managedId ?? classification.fallbackId });
      }

      if (detected.length > 0) {
        return detected;
      }
    }
  } catch {
    // /proc not readable (non-Linux dev host) — fall through to the heuristic scrape below.
  }

  return detectPortsFromOutput(processes);
}

// Parse listening (state 0A) IPv4/IPv6 TCP sockets into a port -> socket-inode map.
async function readListeningPorts(): Promise<Map<number, number>> {
  const ports = new Map<number, number>();

  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let content: string;

    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    for (const line of content.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/);

      // Columns: sl local_address rem_address st ... uid timeout inode
      if (cols.length < 10 || cols[3] !== '0A') {
        continue;
      }

      const portHex = cols[1].split(':')[1];
      const inode = Number(cols[9]);

      if (!portHex || !Number.isFinite(inode)) {
        continue;
      }

      const port = Number.parseInt(portHex, 16);

      if (port > 0 && port <= 65535) {
        ports.set(port, inode);
      }
    }
  }

  return ports;
}

// Map socket inodes to the pid holding them by scanning /proc/<pid>/fd symlinks (socket:[inode]).
async function readSocketInodeToPid(): Promise<Map<number, number>> {
  const map = new Map<number, number>();

  let pids: string[];

  try {
    pids = (await readdir('/proc')).filter((name) => /^\d+$/.test(name));
  } catch {
    return map;
  }

  await Promise.all(
    pids.map(async (pid) => {
      let fds: string[];

      try {
        fds = await readdir(`/proc/${pid}/fd`);
      } catch {
        return;
      }

      await Promise.all(
        fds.map(async (fd) => {
          try {
            const target = await readlink(`/proc/${pid}/fd/${fd}`);
            const match = /^socket:\[(\d+)\]$/.exec(target);

            if (match) {
              map.set(Number(match[1]), Number(pid));
            }
          } catch {
            // fd vanished between readdir and readlink — ignore.
          }
        }),
      );
    }),
  );

  return map;
}

// Walk the parent chain from `pid` until a tracked managed pid is reached, returning its record id.
async function owningManagedProcess(pid: number, managedPids: Map<number, string>): Promise<string | undefined> {
  let current: number | undefined = pid;

  for (let depth = 0; current && current > 1 && depth < 32; depth += 1) {
    const recordId = managedPids.get(current);

    if (recordId) {
      return recordId;
    }

    current = await parentPid(current);
  }

  return undefined;
}

async function parentPid(pid: number): Promise<number | undefined> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');

    // Fields after the (comm) — which may contain spaces/parens — are: state ppid ...
    const afterComm = stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .split(/\s+/);

    const ppid = Number(afterComm[1]);

    return Number.isFinite(ppid) ? ppid : undefined;
  } catch {
    return undefined;
  }
}

/*
 * Ordered list of hosts the preview proxy tries to reach a dev server, given a
 * snapshot of the pod's network interfaces. Pure (interfaces passed in) so the
 * ordering/filtering is unit-testable without the host's real interfaces:
 *   - 127.0.0.1 first: the fast path that works whenever the dev server bound
 *     0.0.0.0 or a working dual-stack `[::]`.
 *   - then every non-internal IPv4 interface address (the pod IP the dev server
 *     advertises as `Network:`) — reaches a `[::]`-bound socket on gVisor pods
 *     where the 127.0.0.1→`[::]` loopback path is not delivered.
 *   - `[::1]` last: harmless where IPv6 loopback exists, skipped-fast where it
 *     does not (the gVisor workspace pods have no IPv6 loopback at all).
 */
export function buildPreviewHosts(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  const hosts = ['127.0.0.1'];

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      // node typings expose family as 'IPv4'; some runtimes use the number 4.
      const isIPv4 = address.family === 'IPv4' || (address.family as unknown as number) === 4;

      if (isIPv4 && !address.internal && !hosts.includes(address.address)) {
        hosts.push(address.address);
      }
    }
  }

  hosts.push('[::1]');

  return hosts;
}

// Pod interfaces don't change at runtime, so resolve the candidate list once.
let cachedPreviewHosts: string[] | undefined;

function localPreviewHosts(): string[] {
  if (!cachedPreviewHosts) {
    try {
      cachedPreviewHosts = buildPreviewHosts(networkInterfaces());
    } catch {
      // networkInterfaces() should never throw; never let discovery break preview.
      cachedPreviewHosts = ['127.0.0.1', '[::1]'];
    }
  }

  return cachedPreviewHosts;
}

/*
 * Exported for unit testing: the /proc-based detectPorts() path preempts this
 * heuristic on Linux (incl. CI runners, which are shared hosts whose /proc
 * exposes unrelated listening sockets), so the output-parsing logic can only be
 * exercised deterministically by calling it directly.
 */
export function detectPortsFromOutput(processes: Map<string, ProcessRecord>): DetectedPort[] {
  return [...processes.values()].flatMap((record) => {
    const source = `${record.command}\n${record.output ?? ''}`;

    const matches = source.matchAll(
      /(?:https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\])[:/]|localhost:|127\.0\.0\.1:|0\.0\.0\.0:|--port\s+|LISTEN\s+)(\d{2,5})/gi,
    );

    const ports = new Set([...matches].map((match) => Number(match[1])).filter((port) => port > 0 && port <= 65535));

    if (!ports.size && /\b(vite|next dev|astro dev|remix dev|npm run dev|pnpm dev|yarn dev)\b/i.test(record.command)) {
      ports.add(/\bnext dev\b/i.test(record.command) ? 3000 : 5173);
    }

    return [...ports].map((port) => ({ port, processId: record.id }));
  });
}
