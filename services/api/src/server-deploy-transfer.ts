/*
 * Server-deploy app transfer (Replit-parity durable runtime).
 *
 * A server deployment runs the raw workspace-agent runtime image (node + npm, NOT
 * the user's app). buildServerBootScript expects the app SOURCE as a tarball,
 * delivered either via a signed URL (`APP_SRC_URL`) or inline base64
 * (`APP_SRC_B64`). This module produces that artifact from the live workspace pod:
 * it tars the source in the pod (excluding node_modules/.git/build sandboxes),
 * pulls the tarball out through the agent, and either uploads it to object storage
 * (preferred — no pod-spec size pressure) or inlines it as base64 for small apps.
 *
 * The transfer is capped by the agent's per-file read limit (~2MB) because the
 * workspace pod's egress is locked down (it can't reach GCS directly), so every
 * byte flows through the agent `/files/read` path. Node app SOURCE (deps rebuilt
 * in the deploy pod) is almost always well under that.
 */
import { assertValidObjectKey, type ObjectStorage } from './object-storage.js';

/** The subset of the workspace build agent this module needs. */
export interface SnapshotAgent {
  runStep(step: {
    command: string;
    args: string[];
    cwd: string;
    onLine?: (level: 'info' | 'error', line: string) => void;
  }): Promise<{ exitCode: number | null; timedOut: boolean; error?: string }>;
  readFile(filePath: string): Promise<{ content: string; encoding: 'utf8' | 'base64' }>;
}

export const serverDeploySourceTarPath = (deploymentId: string) => `/tmp/vibecore-src-${deploymentId}.tgz`;

/*
 * Inline base64 is a pod-spec env value, and a Kubernetes object must fit in etcd
 * (~1.5MB total). base64 inflates the tarball ~1.37×, and the rest of the pod spec
 * needs headroom, so keep the raw inline tarball well under budget. Object storage
 * has no such cap (only the agent read limit), so it's preferred whenever available.
 */
export const SERVER_DEPLOY_INLINE_TAR_LIMIT_BYTES = 700 * 1024;

export type SnapshotTransfer =
  | { kind: 'objectStorage'; url: string; expiresAt: string }
  | { kind: 'inline'; base64: string };

export interface SnapshotResult {
  ok: boolean;
  transfer?: SnapshotTransfer;
  bytes?: number;
  error?: 'AGENT_UNREACHABLE' | 'SNAPSHOT_FAILED' | 'SNAPSHOT_EMPTY' | 'APP_TOO_LARGE';
  message?: string;
}

/**
 * Tar the workspace app source in the pod, pull it out, and package it for the
 * boot script. Returns a transfer descriptor ({@link SnapshotTransfer}) the caller
 * translates into APP_SRC_URL / APP_SRC_B64 env, or a typed error with a
 * user-facing message.
 */
export async function snapshotWorkspaceAppSource(opts: {
  agent: SnapshotAgent;
  deploymentId: string;
  cwd?: string;
  /** Extra path to exclude from the tar (e.g. a static-build sandbox dir). */
  extraExclude?: string;
  /** When provided, the tarball is uploaded here and delivered via a signed URL. */
  objectStorage?: ObjectStorage | null;
  projectId?: string;
  inlineTarLimitBytes?: number;
  onLog?: (level: 'info' | 'error', line: string) => void;
}): Promise<SnapshotResult> {
  const cwd = opts.cwd ?? '.';
  const tarPath = serverDeploySourceTarPath(opts.deploymentId);
  const inlineLimit = opts.inlineTarLimitBytes ?? SERVER_DEPLOY_INLINE_TAR_LIMIT_BYTES;

  const tarCommand = [
    `tar czf ${tarPath}`,
    '--exclude=./node_modules',
    '--exclude=./.git',
    '--exclude=./.vibecore-deploy-*',
    opts.extraExclude ? `--exclude=${opts.extraExclude}` : '',
    '.',
  ]
    .filter(Boolean)
    .join(' ');

  const tarStep = await opts.agent.runStep({
    command: 'sh',
    args: ['-c', tarCommand],
    cwd,
    onLine: opts.onLog ?? (() => undefined),
  });

  if (tarStep.error === 'WORKSPACE_AGENT_REQUEST_FAILED') {
    return { ok: false, error: 'AGENT_UNREACHABLE', message: 'The workspace could not be reached to snapshot the app.' };
  }

  if (tarStep.timedOut || tarStep.exitCode !== 0) {
    return {
      ok: false,
      error: 'SNAPSHOT_FAILED',
      message: `Could not package the app source (tar exited ${tarStep.exitCode ?? 'timeout'}).`,
    };
  }

  let file: { content: string; encoding: 'utf8' | 'base64' };

  try {
    file = await opts.agent.readFile(tarPath);
  } catch (error) {
    return {
      ok: false,
      error: 'SNAPSHOT_FAILED',
      message: `Could not read the app snapshot from the workspace (${(error as Error).message ?? 'unknown error'}).`,
    };
  }

  const base64 = file.encoding === 'base64' ? file.content : Buffer.from(file.content, 'utf8').toString('base64');
  const raw = Buffer.from(base64, 'base64');

  if (raw.byteLength === 0) {
    return { ok: false, error: 'SNAPSHOT_EMPTY', message: 'The app snapshot was empty.' };
  }

  // Preferred: object storage (no pod-spec size pressure). Falls back to inline if
  // storage is unavailable or signing is not permitted for this environment.
  if (opts.objectStorage && opts.projectId) {
    try {
      const key = assertValidObjectKey(`tmp/server-deploy/${opts.deploymentId}.tgz`);
      await opts.objectStorage.putObject(opts.projectId, {
        key,
        body: raw,
        contentType: 'application/gzip',
      });
      const { url, expiresAt } = await opts.objectStorage.createDownloadUrl(opts.projectId, { key });
      opts.onLog?.('info', `[snapshot] uploaded ${raw.byteLength} bytes to object storage`);

      return { ok: true, transfer: { kind: 'objectStorage', url, expiresAt }, bytes: raw.byteLength };
    } catch (error) {
      opts.onLog?.(
        'info',
        `[snapshot] object-storage transfer unavailable (${(error as Error).message ?? 'error'}); using inline transfer`,
      );
    }
  }

  if (raw.byteLength > inlineLimit) {
    return {
      ok: false,
      error: 'APP_TOO_LARGE',
      message:
        `The app source (${Math.ceil(raw.byteLength / 1024)}KB) is too large for inline transfer ` +
        `(${Math.floor(inlineLimit / 1024)}KB limit). Enable object storage for large server deploys.`,
    };
  }

  return { ok: true, transfer: { kind: 'inline', base64 }, bytes: raw.byteLength };
}

/**
 * Assemble the environment for a server-deploy pod: the transfer descriptor
 * (APP_SRC_URL/APP_SRC_B64), the port, the deployment id, the project's secrets
 * (DB URL included), and any per-deploy env overrides. For a production deploy the
 * project's `PROD_DATABASE_URL` is surfaced to the app as `DATABASE_URL` so app
 * code that reads `process.env.DATABASE_URL` talks to the production database.
 */
export function buildServerDeployEnv(input: {
  transfer: SnapshotTransfer;
  deploymentId: string;
  port: number;
  environment: string;
  projectSecrets?: Record<string, string>;
  envOverrides?: Record<string, string>;
}): Record<string, string> {
  const env: Record<string, string> = {
    DEPLOY_ID: input.deploymentId,
    PORT: String(input.port),
  };

  if (input.transfer.kind === 'objectStorage') {
    env.APP_SRC_URL = input.transfer.url;
  } else {
    env.APP_SRC_B64 = input.transfer.base64;
  }

  const secrets = input.projectSecrets ?? {};
  const isProd = input.environment === 'production';

  // Map the environment's database secret onto the conventional DATABASE_URL the
  // app reads. Prod uses PROD_DATABASE_URL; dev/preview uses DATABASE_URL.
  const dbUrl = isProd ? secrets.PROD_DATABASE_URL : secrets.DATABASE_URL;

  for (const [key, value] of Object.entries(secrets)) {
    // Don't leak the prod URL under its raw name into a preview deploy, and vice
    // versa — only surface the environment-appropriate one (remapped below).
    if (key === 'DATABASE_URL' || key === 'PROD_DATABASE_URL') {
      continue;
    }

    env[key] = value;
  }

  if (dbUrl) {
    env.DATABASE_URL = dbUrl;
  }

  // Per-deploy overrides win last.
  for (const [key, value] of Object.entries(input.envOverrides ?? {})) {
    env[key] = value;
  }

  return env;
}
