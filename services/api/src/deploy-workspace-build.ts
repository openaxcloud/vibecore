import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix, sep } from 'node:path';

import type { StaticBuildLog, StaticBuildLogLevel } from './deployments.js';

/*
 * P1 (vague2-deploy): the static deploy build used to run in-process inside the
 * API pod (node:22-slim, 500m CPU / 1Gi RAM, node_modules on a Filestore/NFS
 * share) which OOM'd/timed-out systematically. This module runs the SAME build
 * steps inside the project's workspace pod (gVisor) — which already has the app,
 * the full toolchain and a fast local disk — then pulls the built `dist/` back
 * so the existing snapshot + serve path is unchanged.
 *
 * The orchestration is pure and depends only on an injected `WorkspaceBuildAgent`
 * (the workspace-agent hop), so it is fully unit-testable without a live pod.
 */

/** One line of build output from the workspace pod. */
export type WorkspaceBuildLine = { level: StaticBuildLogLevel; line: string };

export interface WorkspaceBuildStepResult {
  /** Process exit code; null when killed by signal (e.g. SIGKILL on timeout). */
  exitCode: number | null;

  /** True when the step exceeded its deadline and was killed. */
  timedOut: boolean;

  /** Transport-level failure (agent unreachable, WS error). */
  error?: string;
}

export interface WorkspaceListedFile {
  /** Path relative to the workspace root (posix separators). */
  path: string;

  /** Byte size when known (used for the artifact-size gate). */
  size?: number;
}

export interface WorkspaceBuildAgent {
  /**
   * Run one build step in the workspace pod, streaming output lines via `onLine`.
   * Must resolve (never reject) — transport failures come back as `{ error }`.
   */
  runStep(step: {
    command: string;
    args: string[];
    cwd: string;
    onLine: (level: StaticBuildLogLevel, line: string) => void;
  }): Promise<WorkspaceBuildStepResult>;

  /** Recursively list files under `dirPath` (relative to workspace root). */
  listFiles(dirPath: string): Promise<{ files: WorkspaceListedFile[]; error?: string }>;

  /** Read one file from the workspace pod. */
  readFile(filePath: string): Promise<{ content: string; encoding: 'utf8' | 'base64' }>;
}

export interface WorkspaceStaticBuildOptions {
  /** Package-manager install step. Detected by the caller from the pod's lockfiles. */
  install: { command: string; args: string[] };

  /** The raw build command, e.g. `npm run build`. */
  buildCommand: string;

  /** Output directory relative to the project root, e.g. `dist`. */
  outputDirectory: string;

  /** Build cwd relative to the workspace root ('.' for the project root). */
  cwd: string;

  /** Absolute API-local directory to materialize the pulled artifact into. */
  materializeDir: string;

  /** Per-file cap enforced by the workspace-agent (bytes) — files above it can't be pulled. */
  maxFileBytes: number;
  artifactSizeLimitMb?: number;

  /**
   * Called for every log line as it happens (P2: lets the caller flush build
   * output to the deployment record incrementally so the UI streams it live).
   */
  onLog?: (log: StaticBuildLog) => void;

  /**
   * Called when the build enters a new phase (installing → building → deploying).
   * Drives the async status/phase the UI shows.
   */
  onPhase?: (phase: WorkspaceBuildPhase) => void;
}

export type WorkspaceBuildPhase = 'installing' | 'building' | 'deploying';

export type WorkspaceStaticBuildErrorCode =
  | 'INSTALL_FAILED'
  | 'BUILD_FAILED'
  | 'BUILD_TIMEOUT'
  | 'OUTPUT_DIRECTORY_MISSING'
  | 'NOT_STATIC_SITE'
  | 'ARTIFACT_TOO_LARGE'
  | 'ARTIFACT_FILE_TOO_LARGE'
  | 'PULL_FAILED'
  | 'AGENT_UNREACHABLE';

export interface WorkspaceStaticBuildResult {
  ok: boolean;
  logs: StaticBuildLog[];

  /** Equals `materializeDir` when ok — feed straight into snapshotStaticBuild(). */
  outputDir?: string;
  error?: WorkspaceStaticBuildErrorCode;
}

function makeLogger(onLog?: (log: StaticBuildLog) => void) {
  const logs: StaticBuildLog[] = [];

  const push = (level: StaticBuildLogLevel, message: string) => {
    const entry = { timestamp: new Date().toISOString(), level, message };
    logs.push(entry);
    onLog?.(entry);
  };

  return { logs, push };
}

/**
 * Split a shell-like build command ("npm run build") into command + args.
 * Mirrors deployments.ts splitBuildCommand (quotes honored, no shell eval).
 */
export function splitBuildCommand(buildCommand: string): { command: string; args: string[] } | undefined {
  const trimmed = buildCommand.trim();

  if (!trimmed) {
    return undefined;
  }

  const tokens = trimmed.match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g);

  if (!tokens || tokens.length === 0) {
    return undefined;
  }

  const dequote = (token: string) =>
    (token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))
      ? token.slice(1, -1)
      : token;

  const [command, ...args] = tokens.map(dequote);

  return { command, args };
}

/** The output dir the build wrote, in posix form relative to the build cwd. */
function outputPrefix(cwd: string, outputDirectory: string): string {
  const base = cwd === '.' || cwd === '' ? '' : `${cwd.replace(/\/+$/, '')}/`;
  return posix.normalize(`${base}${outputDirectory.replace(/\/+$/, '')}`);
}

/**
 * Run the static build inside the workspace pod and materialize the artifact
 * locally. Pure orchestration over the injected agent — unit-tested in
 * deploy-workspace-build.spec.ts.
 */
export async function runWorkspaceStaticBuild(
  options: WorkspaceStaticBuildOptions,
  agent: WorkspaceBuildAgent,
): Promise<WorkspaceStaticBuildResult> {
  const log = makeLogger(options.onLog);
  const cwd = options.cwd || '.';

  log.push('info', `Workspace deploy: building in pod (cwd ${cwd})`);

  // 1. Install dependencies.
  options.onPhase?.('installing');
  log.push(
    'info',
    `Workspace deploy: installing dependencies (${options.install.command} ${options.install.args.join(' ')})`,
  );

  const install = await agent.runStep({
    command: options.install.command,
    args: options.install.args,
    cwd,
    onLine: (level, line) => log.push(level, `[install] ${line}`),
  });

  if (install.error) {
    log.push('error', `Workspace deploy: could not reach the workspace to install (${install.error}).`);
    return { ok: false, logs: log.logs, error: 'AGENT_UNREACHABLE' };
  }

  if (install.exitCode !== 0) {
    log.push(
      'error',
      `Workspace deploy: dependency install failed (exit ${install.exitCode ?? 'null'}${install.timedOut ? ', timed out' : ''}).`,
    );
    return { ok: false, logs: log.logs, error: 'INSTALL_FAILED' };
  }

  // 2. Run the build.
  const split = splitBuildCommand(options.buildCommand);

  if (!split) {
    log.push('error', `Workspace deploy: invalid build command "${options.buildCommand}".`);
    return { ok: false, logs: log.logs, error: 'BUILD_FAILED' };
  }

  options.onPhase?.('building');
  log.push('info', `Workspace deploy: running build (${options.buildCommand})`);

  const build = await agent.runStep({
    command: split.command,
    args: split.args,
    cwd,
    onLine: (level, line) => log.push(level, `[build] ${line}`),
  });

  if (build.error) {
    log.push('error', `Workspace deploy: lost the workspace during build (${build.error}).`);
    return { ok: false, logs: log.logs, error: 'AGENT_UNREACHABLE' };
  }

  if (build.timedOut) {
    log.push('error', 'Workspace deploy: build timed out.');
    return { ok: false, logs: log.logs, error: 'BUILD_TIMEOUT' };
  }

  if (build.exitCode !== 0) {
    log.push('error', `Workspace deploy: build failed (exit ${build.exitCode ?? 'null'}).`);
    return { ok: false, logs: log.logs, error: 'BUILD_FAILED' };
  }

  // 3. Enumerate + pull the built output directory.
  options.onPhase?.('deploying');

  const prefix = outputPrefix(cwd, options.outputDirectory);
  const listing = await agent.listFiles(prefix);

  if (listing.error) {
    log.push(
      'error',
      `Workspace deploy: could not read ${options.outputDirectory}/ from the workspace (${listing.error}).`,
    );
    return { ok: false, logs: log.logs, error: 'PULL_FAILED' };
  }

  if (listing.files.length === 0) {
    log.push(
      'error',
      `Workspace deploy: the build produced no ${options.outputDirectory}/ output. Check the build command and output directory.`,
    );
    return { ok: false, logs: log.logs, error: 'OUTPUT_DIRECTORY_MISSING' };
  }

  // 4. A static site must have an index.html at the output root.
  const relFiles = listing.files.map((file) => ({
    ...file,

    // path relative to the output directory, posix.
    rel: posix.relative(prefix, file.path),
  }));

  const hasIndex = relFiles.some((file) => file.rel === 'index.html');

  if (!hasIndex) {
    log.push(
      'error',
      `This project isn't a static site: the build did not produce ${options.outputDirectory}/index.html. ` +
        `Full-stack apps (a Node/SSR server, an API, a database) can't be served as static files — ` +
        `deploy them as a server app instead, or set the output directory to your static build folder.`,
    );
    return { ok: false, logs: log.logs, error: 'NOT_STATIC_SITE' };
  }

  // 5. Artifact-size gate (before pulling every file over the wire).
  const knownBytes = relFiles.reduce((sum, file) => sum + (file.size ?? 0), 0);

  if (options.artifactSizeLimitMb && knownBytes > options.artifactSizeLimitMb * 1024 * 1024) {
    log.push(
      'error',
      `Workspace deploy: artifact (${(knownBytes / (1024 * 1024)).toFixed(1)} MB) exceeds the ${options.artifactSizeLimitMb} MB limit.`,
    );
    return { ok: false, logs: log.logs, error: 'ARTIFACT_TOO_LARGE' };
  }

  // 6. Pull each file back and materialize it into the API-local temp dir.
  for (const file of relFiles) {
    if (file.size !== undefined && file.size > options.maxFileBytes) {
      log.push(
        'error',
        `Workspace deploy: ${file.rel} is ${(file.size / (1024 * 1024)).toFixed(1)} MB, over the ` +
          `${(options.maxFileBytes / (1024 * 1024)).toFixed(0)} MB per-file transfer limit. ` +
          `Split or externalize large assets, then redeploy.`,
      );
      return { ok: false, logs: log.logs, error: 'ARTIFACT_FILE_TOO_LARGE' };
    }

    let payload: { content: string; encoding: 'utf8' | 'base64' };

    try {
      payload = await agent.readFile(file.path);
    } catch (error) {
      log.push(
        'error',
        `Workspace deploy: failed to read ${file.rel} from the workspace (${(error as Error).message}).`,
      );
      return { ok: false, logs: log.logs, error: 'PULL_FAILED' };
    }

    // Guard against path traversal in agent-supplied relative paths.
    const localRelative = file.rel.split('/').join(sep);
    const destination = join(options.materializeDir, localRelative);

    if (destination !== options.materializeDir && !destination.startsWith(`${options.materializeDir}${sep}`)) {
      log.push('error', `Workspace deploy: refusing to write outside the artifact directory (${file.rel}).`);
      return { ok: false, logs: log.logs, error: 'PULL_FAILED' };
    }

    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(payload.content, payload.encoding === 'base64' ? 'base64' : 'utf8'));
  }

  log.push('info', `Workspace deploy: pulled ${relFiles.length} file(s); artifact ready.`);

  return { ok: true, logs: log.logs, outputDir: options.materializeDir };
}

/**
 * Detect the package manager from the pod's top-level lockfiles. Mirrors
 * deployments.ts detectPackageManager but works off an agent directory listing
 * (the API pod can't see the workspace pod's disk). Defaults to npm.
 */
export function detectPodPackageManager(topLevelFiles: string[]): { command: string; args: string[]; manager: string } {
  const names = new Set(topLevelFiles.map((path) => posix.basename(path)));

  if (names.has('pnpm-lock.yaml')) {
    return { manager: 'pnpm', command: 'pnpm', args: ['install', '--prod=false'] };
  }

  if (names.has('yarn.lock')) {
    return { manager: 'yarn', command: 'yarn', args: ['install', '--production=false'] };
  }

  if (names.has('bun.lockb')) {
    return { manager: 'bun', command: 'bun', args: ['install'] };
  }

  /*
   * `--legacy-peer-deps`: AI-generated apps routinely ship peer-dependency
   * conflicts (e.g. vite@4 with a vite-plugin-checker that peers vite@^2||^3),
   * which npm v7+ turns into a hard ERESOLVE that fails the whole deploy even
   * though the preview dev server (whose install tolerates it) runs fine. Match
   * that tolerance so a valid app doesn't fail to deploy on a peer-range nit.
   */
  return {
    manager: 'npm',
    command: 'npm',
    args: ['install', '--include=dev', '--no-audit', '--no-fund', '--legacy-peer-deps'],
  };
}
