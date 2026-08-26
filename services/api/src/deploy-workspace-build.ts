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

  /*
   * Throwaway build sandbox, relative to the workspace root. When set, the deploy
   * copies the project sources (EXCLUDING node_modules/.git) into this directory
   * and runs install + build THERE, so `npm install` never mutates the live
   * workspace's node_modules — a deploy must not break the user's running dev
   * server. Removed after the artifact is pulled (success or failure). When
   * omitted, the build runs in `cwd` directly (legacy in-place behavior).
   */
  sandboxDir?: string;

  /**
   * Non-secret identifiers copied into the persisted build log. They let an
   * operator correlate the exact deployment, project and runtime workspace
   * used by `prepare` without inferring a cause from a later npm error.
   */
  diagnosticContext?: {
    deploymentId: string;
    projectId: string;
    runtimeWorkspaceId: string;
    requestedProjectWorkspaceId?: string;
  };

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
  | 'SOURCE_WORKSPACE_EMPTY'
  | 'SOURCE_PACKAGE_JSON_MISSING'
  | 'SANDBOX_PREPARE_EMPTY'
  | 'SANDBOX_PACKAGE_JSON_MISSING'
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

/* Single-quote one value for the POSIX `sh -c` preparation script. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

const PREP_SOURCE_EMPTY = 86;
const PREP_SOURCE_PACKAGE_JSON_MISSING = 87;
const PREP_SANDBOX_EMPTY = 88;
const PREP_SANDBOX_PACKAGE_JSON_MISSING = 89;

function preparationFailure(exitCode: number | null): WorkspaceStaticBuildErrorCode {
  switch (exitCode) {
    case PREP_SOURCE_EMPTY:
      return 'SOURCE_WORKSPACE_EMPTY';
    case PREP_SOURCE_PACKAGE_JSON_MISSING:
      return 'SOURCE_PACKAGE_JSON_MISSING';
    case PREP_SANDBOX_EMPTY:
      return 'SANDBOX_PREPARE_EMPTY';
    case PREP_SANDBOX_PACKAGE_JSON_MISSING:
      return 'SANDBOX_PACKAGE_JSON_MISSING';
    default:
      return 'INSTALL_FAILED';
  }
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

/*
 * ---------------------------------------------------------------------------
 * P0-2 React 17/18 guard, deploy edition.
 *
 * The preview repairs an AI-generated manifest in memory (buildPreviewManifestRepair)
 * so a project that emits React-18 client code (`react-dom/client` / `createRoot`)
 * while pinning react/react-dom below 18 — or omitting react-dom entirely — still
 * renders. That repair is NOT persisted to the workspace disk, so the deploy build
 * (which copies the on-disk sources into an isolated sandbox and runs a clean
 * `npm install` + build) sees the UNREPAIRED package.json and the build dies with
 * `Rollup failed to resolve import "react-dom/client"` — the app works in preview
 * but fails to deploy. Mirror the preview's pin here, in the sandbox, before install.
 *
 * The build agent can't write files (readFile/listFiles/runStep only), so the repair
 * runs pod-side as a self-contained node script (REACT_MANIFEST_REPAIR_SCRIPT). The
 * decision core is `computeReactManifestRepair`, exported + unit-tested; the script
 * inlines the same rules against the on-disk package.json + source scan.
 * ---------------------------------------------------------------------------
 */

/** Supported React range forced when the code needs the 18-only client API. */
export const DEPLOY_REACT18_RANGE = '^18.3.1';

/** Lowest major a range permits (first integer), or undefined when unparseable ('latest', '*'). */
function reactVersionMajorFloor(range: string): number | undefined {
  const match = String(range).match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

/**
 * Pure core: given a parsed package.json and whether the sources use the React-18
 * client API, return the react/react-dom deps that must be forced to a >=18 range.
 * A dependency is forced when it's MISSING (react-dom omitted entirely) or its floor
 * is below 18 (`^17`, `16.x`). A pin already >=18 (incl. an intentional React 19
 * app, which a downgrade would break) is left untouched.
 */
export function computeReactManifestRepair(
  packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
  usesReact18ClientApi: boolean,
): { changed: boolean; forced: Record<string, string> } {
  const forced: Record<string, string> = {};

  if (!usesReact18ClientApi) {
    return { changed: false, forced };
  }

  const deps = packageJson.dependencies ?? {};
  const devDeps = packageJson.devDependencies ?? {};

  for (const name of ['react', 'react-dom']) {
    // A dep already declared in devDependencies with a fine floor is left alone.
    const current = deps[name] ?? devDeps[name];
    const floor = current ? reactVersionMajorFloor(current) : undefined;

    // Force when missing (floor undefined AND not declared) or explicitly below 18.
    const missing = current === undefined;

    if (missing || (floor !== undefined && floor < 18)) {
      forced[name] = DEPLOY_REACT18_RANGE;
    }
  }

  return { changed: Object.keys(forced).length > 0, forced };
}

/**
 * Self-contained node script run in the sandbox cwd BEFORE `npm install`. Scans the
 * project sources for the React-18 client API and, if found, forces react/react-dom
 * to a >=18 range in package.json (adding react-dom when omitted). Deterministic,
 * bounded (skips node_modules/.git/dist/build, caps the scan), and a no-op when the
 * manifest is already fine or absent. Prints a `[react18-guard]` marker on a change.
 */
export const REACT_MANIFEST_REPAIR_SCRIPT = String.raw`
const fs = require('fs'), path = require('path');
const RANGE = '${DEPLOY_REACT18_RANGE}';
const API = /\breact-dom\/client\b|\bcreateRoot\s*\(|\bhydrateRoot\s*\(/;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.vite', 'coverage']);
const CODE = /\.(c|m)?(j|t)sx?$/;
function floor(r){ const m = String(r).match(/\d+/); return m ? Number(m[0]) : undefined; }
let pkgRaw; try { pkgRaw = fs.readFileSync('package.json', 'utf8'); } catch { process.exit(0); }
let pkg; try { pkg = JSON.parse(pkgRaw); } catch { process.exit(0); }
if (!pkg || typeof pkg !== 'object') process.exit(0);
let uses = false, scanned = 0;
(function walk(dir){
  if (uses || scanned > 4000) return;
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (uses || scanned > 4000) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); continue; }
    if (!CODE.test(e.name)) continue;
    scanned++;
    let c; try { c = fs.readFileSync(p, 'utf8'); } catch { continue; }
    if (API.test(c)) uses = true;
  }
})('.');
if (!uses) process.exit(0);
const deps = pkg.dependencies || (pkg.dependencies = {});
const dev = pkg.devDependencies || {};
const forced = [];
for (const name of ['react', 'react-dom']) {
  const cur = deps[name] !== undefined ? deps[name] : dev[name];
  const missing = cur === undefined;
  const f = cur ? floor(cur) : undefined;
  if (missing || (f !== undefined && f < 18)) { deps[name] = RANGE; forced.push(name + (missing ? '(added)' : '')); }
}
if (forced.length) {
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  console.log('[react18-guard] forced ' + forced.join(', ') + ' to ' + RANGE + ' (React-18 client API in sources)');
}
`;

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
  const sourceCwd = options.cwd || '.';
  const sandbox = options.sandboxDir;
  const cwd = sandbox ?? sourceCwd;

  if (options.diagnosticContext) {
    const context = options.diagnosticContext;
    log.push(
      'info',
      `Workspace deploy audit: deployment=${context.deploymentId} project=${context.projectId} ` +
        `runtimeWorkspace=${context.runtimeWorkspaceId} ` +
        `requestedProjectWorkspace=${context.requestedProjectWorkspaceId ?? 'primary'} sourceCwd=${sourceCwd}`,
    );
  }

  /*
   * Best-effort teardown of the throwaway sandbox. Runs in a finally so a failed
   * install/build/pull never leaves the copy behind. Never throws.
   */
  const cleanupSandbox = async () => {
    if (!sandbox) {
      return;
    }

    await agent
      .runStep({ command: 'sh', args: ['-c', `rm -rf "${sandbox}"`], cwd: '.', onLine: () => undefined })
      .catch(() => undefined);
  };

  try {
    /*
     * Isolate the build from the live workspace: copy the sources (minus
     * node_modules/.git) into the sandbox and build there, so `npm install`
     * never mutates the running dev server's node_modules. `find … -exec cp`
     * is space-safe and skips the sandbox itself.
     */
    if (sandbox) {
      options.onPhase?.('installing');
      log.push(
        'info',
        `Workspace deploy: preparing isolated build sandbox (${sandbox}); the live workspace is left untouched`,
      );

      const sandboxBase = posix.basename(sandbox);

      /*
       * BUG-DEPLOY-010 audit: the old `find ... -exec cp` could exit 0 while the
       * observed build sandbox was empty. Measure BOTH sides in the very same
       * `sh` process, immediately around the copy. The markers contain counts
       * and manifest presence only (no file contents or secrets), are persisted
       * with the normal build log, and deliberately make no claim about cause.
       *
       * Fail closed before npm when either side is empty or package.json fails
       * to cross the boundary. Dedicated exit codes preserve which postcondition
       * failed; `finally` still removes the throwaway sandbox.
       */
      const quotedSource = shellQuote(sourceCwd);
      const quotedSandbox = shellQuote(sandbox);
      const quotedSandboxBase = shellQuote(sandboxBase);

      const prepScript = [
        'set -e',
        `source_dir=${quotedSource}`,
        `sandbox_dir=${quotedSandbox}`,
        `sandbox_base=${quotedSandboxBase}`,
        'source_entries=$(find "$source_dir" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .git ! -name "$sandbox_base" -print | wc -l | tr -d "[:space:]")',
        'source_package_json=false',
        '[ -f "$source_dir/package.json" ] && source_package_json=true',
        'printf "[deploy-audit] source entries=%s packageJson=%s\\n" "$source_entries" "$source_package_json"',
        `[ "$source_entries" -gt 0 ] || exit ${PREP_SOURCE_EMPTY}`,
        `[ "$source_package_json" = true ] || exit ${PREP_SOURCE_PACKAGE_JSON_MISSING}`,
        'rm -rf "$sandbox_dir"',
        'mkdir -p "$sandbox_dir"',
        'find "$source_dir" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .git ! -name "$sandbox_base" -exec cp -a {} "$sandbox_dir/" ";"',
        'sandbox_entries=$(find "$sandbox_dir" -mindepth 1 -maxdepth 1 -print | wc -l | tr -d "[:space:]")',
        'sandbox_package_json=false',
        '[ -f "$sandbox_dir/package.json" ] && sandbox_package_json=true',
        'printf "[deploy-audit] sandbox entries=%s packageJson=%s\\n" "$sandbox_entries" "$sandbox_package_json"',
        `[ "$sandbox_entries" -gt 0 ] || exit ${PREP_SANDBOX_EMPTY}`,
        `[ "$sandbox_package_json" = true ] || exit ${PREP_SANDBOX_PACKAGE_JSON_MISSING}`,
      ].join('\n');

      const prep = await agent.runStep({
        command: 'sh',
        args: ['-c', prepScript],
        cwd: '.',
        onLine: (level, line) => log.push(level, `[prepare] ${line}`),
      });

      if (prep.error) {
        log.push(
          'error',
          `Workspace deploy: could not reach the workspace to prepare the build sandbox (${prep.error}).`,
        );
        return { ok: false, logs: log.logs, error: 'AGENT_UNREACHABLE' };
      }

      if (prep.exitCode !== 0) {
        const errorCode = preparationFailure(prep.exitCode);

        /*
         * Keep the persisted operational log factual and locale-neutral. The
         * structured code is the user-facing contract and can be translated by
         * the web surface; the numeric exit value is safe diagnostic context.
         */
        log.push('error', `[deploy-audit] prepare failed code=${errorCode} exit=${prep.exitCode ?? 'null'}`);

        return { ok: false, logs: log.logs, error: errorCode };
      }
    }

    log.push('info', `Workspace deploy: building in pod (cwd ${cwd})`);

    /*
     * 0. React 17/18 manifest guard (see REACT_MANIFEST_REPAIR_SCRIPT). Mirrors the
     * preview repair on-disk so a project that uses the React-18 client API but pins
     * react/react-dom < 18 (or omits react-dom) builds instead of dying on
     * `Rollup failed to resolve import "react-dom/client"`. Best-effort: a failure
     * here must NOT fail the deploy (the build still runs; if the manifest was truly
     * broken it surfaces as a normal build error with the real message).
     */
    const guard = await agent.runStep({
      command: 'node',
      args: ['-e', REACT_MANIFEST_REPAIR_SCRIPT],
      cwd,
      onLine: (level, line) => log.push(level, `[prepare] ${line}`),
    });

    if (guard.error) {
      log.push('info', `Workspace deploy: React-18 manifest guard skipped (${guard.error}).`);
    }

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
  } finally {
    await cleanupSandbox();
  }
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
