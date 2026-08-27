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
import { appPublicEnglish } from './app-public-copy.js';
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

/*
 * The tarball is written INSIDE the workspace root (a dotfile), not /tmp: the
 * workspace agent's `/files/read` only serves paths under the workspace root and
 * 404s an absolute /tmp path. It is excluded from its own archive and removed
 * right after it's pulled, so it never lingers in the user's project.
 */
export const serverDeploySourceTarPath = (deploymentId: string) => `.vibecore-src-${deploymentId}.tgz`;

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
    '--exclude=./.vibecore-src-*',
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
    return {
      ok: false,
      error: 'AGENT_UNREACHABLE',
      message: appPublicEnglish('SERVER_SNAPSHOT_AGENT_UNREACHABLE'),
    };
  }

  if (tarStep.timedOut || tarStep.exitCode !== 0) {
    return {
      ok: false,
      error: 'SNAPSHOT_FAILED',
      message: appPublicEnglish('SERVER_SNAPSHOT_PACKAGE_FAILED'),
    };
  }

  let file: { content: string; encoding: 'utf8' | 'base64' };

  try {
    file = await opts.agent.readFile(tarPath);
  } catch (error) {
    await cleanupTarball(opts.agent, tarPath, cwd);

    return {
      ok: false,
      error: 'SNAPSHOT_FAILED',
      message: appPublicEnglish('SERVER_SNAPSHOT_READ_FAILED'),
    };
  }

  // The tarball lives in the user's workspace root — remove it now that it's pulled.
  await cleanupTarball(opts.agent, tarPath, cwd);

  const base64 = file.encoding === 'base64' ? file.content : Buffer.from(file.content, 'utf8').toString('base64');
  const raw = Buffer.from(base64, 'base64');

  if (raw.byteLength === 0) {
    return { ok: false, error: 'SNAPSHOT_EMPTY', message: appPublicEnglish('SERVER_SNAPSHOT_EMPTY') };
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
      message: appPublicEnglish('SERVER_SNAPSHOT_TOO_LARGE'),
    };
  }

  return { ok: true, transfer: { kind: 'inline', base64 }, bytes: raw.byteLength };
}

/*
 * ---------------------------------------------------------------------------
 * Snapshot-image context (Replit-parity: "Publish = the workspace, imaged").
 *
 * Unlike snapshotWorkspaceAppSource (SOURCE only, deps reinstalled at boot),
 * this captures the workspace WITH its installed dependencies (node_modules,
 * .venv, …) so the app image needs no per-language install step at all. The
 * tarball is far too large for the agent /files/read path (~2MB cap), so the
 * POD uploads it straight to object storage through a signed PUT URL (workspace
 * egress to storage.googleapis.com is open — verified live). The resulting
 * bucket/object pair is handed to Cloud Build as the docker build context.
 * ---------------------------------------------------------------------------
 */

/** GCS object key of a deployment's image-build context tarball. */
export const serverDeployContextObjectKey = (deploymentId: string) => `tmp/server-deploy/${deploymentId}-context.tgz`;

export interface ImageContextResult {
  ok: boolean;
  bucket?: string;
  object?: string;
  bytes?: number;
  error?: 'AGENT_UNREACHABLE' | 'SNAPSHOT_FAILED' | 'UPLOAD_FAILED' | 'STORAGE_UNAVAILABLE';
  message?: string;
}

/** The subset of ObjectStorage the image-context snapshot needs. */
export interface ImageContextStorage {
  readonly active: boolean;
  ensureBucket(projectId: string): Promise<{ bucket: string; created: boolean; location: string }>;
  createUploadUrl(
    projectId: string,
    input: { key: string; contentType?: string },
  ): Promise<{ url: string; headers: Record<string, string> }>;
}

/**
 * Tar the FULL workspace (deps included; only VCS/platform-internal paths are
 * excluded) inside the pod and upload it from the pod to object storage.
 * Returns the GCS bucket/object of the build context, or a typed error.
 */
export async function snapshotWorkspaceImageContext(opts: {
  agent: SnapshotAgent;
  deploymentId: string;
  cwd?: string;
  objectStorage: ImageContextStorage | null;
  projectId: string;
  onLog?: (level: 'info' | 'error', line: string) => void;
}): Promise<ImageContextResult> {
  const cwd = opts.cwd ?? '.';
  const onLog = opts.onLog ?? (() => undefined);

  if (!opts.objectStorage || !opts.objectStorage.active) {
    return {
      ok: false,
      error: 'STORAGE_UNAVAILABLE',
      message: appPublicEnglish('SERVER_IMAGE_STORAGE_REQUIRED'),
    };
  }

  const key = assertValidObjectKey(serverDeployContextObjectKey(opts.deploymentId));
  const tarPath = serverDeploySourceTarPath(opts.deploymentId);

  let bucket: string;
  let upload: { url: string; headers: Record<string, string> };

  try {
    bucket = (await opts.objectStorage.ensureBucket(opts.projectId)).bucket;
    upload = await opts.objectStorage.createUploadUrl(opts.projectId, { key, contentType: 'application/gzip' });
  } catch (error) {
    return {
      ok: false,
      error: 'STORAGE_UNAVAILABLE',
      message: appPublicEnglish('SERVER_IMAGE_STORAGE_PREPARE_FAILED'),
    };
  }

  /*
   * Tar WITH dependencies — that is the whole point: the image must capture the
   * workspace as-is so no language-specific install ever runs at deploy time.
   * A V4 signed PUT is bound to the EXACT signed headers (content-type + host):
   * send `upload.headers` verbatim and nothing else. Injecting a second
   * (lowercase) content-type made curl emit the header twice, so GCS's canonical
   * request no longer matched the signature → 403 SignatureDoesNotMatch. The URL
   * is querystring-safe inside single quotes (GCS signed URLs never contain one).
   */
  const headerFlags = Object.entries(upload.headers)
    .map(([name, value]) => `-H '${name}: ${value}'`)
    .join(' ');
  const script = [
    `tar czf ${tarPath} --exclude=./.git --exclude='./.vibecore-deploy-*' --exclude='./.vibecore-src-*' .`,
    `SNAPSHOT_BYTES=$(wc -c < ${tarPath})`,
    `echo "[snapshot] image context: $SNAPSHOT_BYTES bytes (deps included)"`,
    `curl -fsS -X PUT ${headerFlags} --upload-file ${tarPath} '${upload.url}'`,
    `echo "[snapshot] uploaded $SNAPSHOT_BYTES bytes to object storage"`,
  ].join(' && ');

  let uploadedBytes: number | undefined;
  const step = await opts.agent.runStep({
    command: 'sh',
    args: ['-c', script],
    cwd,
    onLine: (level, line) => {
      const match = /^\[snapshot\] image context: (\d+) bytes/.exec(line);

      if (match) {
        uploadedBytes = Number(match[1]);
      }

      onLog(level, line);
    },
  });

  await cleanupTarball(opts.agent, tarPath, cwd);

  if (step.error === 'WORKSPACE_AGENT_REQUEST_FAILED') {
    return {
      ok: false,
      error: 'AGENT_UNREACHABLE',
      message: appPublicEnglish('SERVER_SNAPSHOT_AGENT_UNREACHABLE'),
    };
  }

  if (step.timedOut || step.exitCode !== 0) {
    // tar and curl share one exit code; the log line tells them apart in the UI.
    return {
      ok: false,
      error: uploadedBytes === undefined ? 'SNAPSHOT_FAILED' : 'UPLOAD_FAILED',
      message: appPublicEnglish('SERVER_IMAGE_UPLOAD_FAILED'),
    };
  }

  return { ok: true, bucket, object: key, bytes: uploadedBytes };
}

/*
 * ---------------------------------------------------------------------------
 * Revision snapshot (reproducible pipeline — docs/DEPLOY_REPRODUCIBLE_PIPELINE.md).
 *
 * Unlike snapshotWorkspaceImageContext (the FULL live pod, deps + caches — the
 * Phase-A prototype, non-replayable by construction), this captures the project
 * SOURCE only: what the user authored plus their language lockfiles. Dependency
 * dirs and derivable caches are excluded — they are reinstalled from lockfiles
 * by the isolated build pod, which is the whole point: (revision, lock) ⇒ the
 * same artifact, every time. The pod computes the tarball's sha256 so the build
 * pod can verify integrity before running anything.
 * ---------------------------------------------------------------------------
 */

/** GCS object key of a deployment's revision tarball (kept, not tmp/ — it IS the replayable input). */
export const serverDeployRevisionObjectKey = (deploymentId: string) => `revisions/server-deploy/${deploymentId}.tgz`;

/*
 * Derivable-state exclusions. Aligned with the workspace agent's
 * SNAPSHOT_IGNORED_DIRS semantics (what file listings treat as non-project
 * state), plus Python venvs and the platform's own transient files. `dist` is
 * deliberately NOT excluded: an app that ships a prebuilt dist with no build
 * command must keep working.
 */
const REVISION_EXCLUDES = [
  './.git',
  './node_modules',
  './.venv',
  './venv',
  './__pycache__',
  './.cache',
  './.npm',
  './.npm-cache',
  './.vite',
  './.next',
  './.turbo',
  './.vibecore-deploy-*',
  './.vibecore-src-*',
];

export interface RevisionSnapshotResult {
  ok: boolean;
  bucket?: string;
  object?: string;
  bytes?: number;
  sha256?: string;
  error?: 'AGENT_UNREACHABLE' | 'SNAPSHOT_FAILED' | 'UPLOAD_FAILED' | 'STORAGE_UNAVAILABLE';
  message?: string;
}

/**
 * Tar the project SOURCE (deps excluded) inside the pod, hash it, and upload it
 * from the pod to object storage. Returns bucket/object/sha256 of the revision,
 * or a typed error. Same pod-side signed-PUT transport as the image context.
 */
export async function snapshotWorkspaceRevision(opts: {
  agent: SnapshotAgent;
  deploymentId: string;
  cwd?: string;
  objectStorage: ImageContextStorage | null;
  projectId: string;
  onLog?: (level: 'info' | 'error', line: string) => void;
}): Promise<RevisionSnapshotResult> {
  const cwd = opts.cwd ?? '.';
  const onLog = opts.onLog ?? (() => undefined);

  if (!opts.objectStorage || !opts.objectStorage.active) {
    return {
      ok: false,
      error: 'STORAGE_UNAVAILABLE',
      message: appPublicEnglish('SERVER_REVISION_STORAGE_REQUIRED'),
    };
  }

  const key = assertValidObjectKey(serverDeployRevisionObjectKey(opts.deploymentId));
  const tarPath = serverDeploySourceTarPath(opts.deploymentId);

  let bucket: string;
  let upload: { url: string; headers: Record<string, string> };

  try {
    bucket = (await opts.objectStorage.ensureBucket(opts.projectId)).bucket;
    upload = await opts.objectStorage.createUploadUrl(opts.projectId, { key, contentType: 'application/gzip' });
  } catch (error) {
    return {
      ok: false,
      error: 'STORAGE_UNAVAILABLE',
      message: appPublicEnglish('SERVER_REVISION_STORAGE_PREPARE_FAILED'),
    };
  }

  // Signed headers verbatim, nothing else (V4 signature binds them — see the
  // image-context comment above for the duplicate-Content-Type 403 story).
  const headerFlags = Object.entries(upload.headers)
    .map(([name, value]) => `-H '${name}: ${value}'`)
    .join(' ');
  const excludeFlags = REVISION_EXCLUDES.map((path) => `--exclude='${path}'`).join(' ');
  const script = [
    `tar czf ${tarPath} ${excludeFlags} .`,
    `REVISION_SHA256=$(sha256sum ${tarPath} | cut -d' ' -f1)`,
    `REVISION_BYTES=$(wc -c < ${tarPath})`,
    `echo "[revision] $REVISION_BYTES bytes sha256=$REVISION_SHA256"`,
    `curl -fsS -X PUT ${headerFlags} --upload-file ${tarPath} '${upload.url}'`,
    `echo "[revision] uploaded"`,
  ].join(' && ');

  let bytes: number | undefined;
  let sha256: string | undefined;
  const step = await opts.agent.runStep({
    command: 'sh',
    args: ['-c', script],
    cwd,
    onLine: (level, line) => {
      const match = /^\[revision\] (\d+) bytes sha256=([0-9a-f]{64})/.exec(line);

      if (match) {
        bytes = Number(match[1]);
        sha256 = match[2];
      }

      onLog(level, line);
    },
  });

  await cleanupTarball(opts.agent, tarPath, cwd);

  if (step.error === 'WORKSPACE_AGENT_REQUEST_FAILED') {
    return {
      ok: false,
      error: 'AGENT_UNREACHABLE',
      message: appPublicEnglish('SERVER_REVISION_AGENT_UNREACHABLE'),
    };
  }

  if (step.timedOut || step.exitCode !== 0) {
    return {
      ok: false,
      error: bytes === undefined ? 'SNAPSHOT_FAILED' : 'UPLOAD_FAILED',
      message: appPublicEnglish('SERVER_REVISION_UPLOAD_FAILED'),
    };
  }

  return { ok: true, bucket, object: key, bytes, sha256 };
}

/** Best-effort removal of the workspace-root tarball; never throws. */
async function cleanupTarball(agent: SnapshotAgent, tarPath: string, cwd: string): Promise<void> {
  try {
    await agent.runStep({
      command: 'sh',
      args: ['-c', `rm -f ${tarPath}`],
      cwd,
      onLine: () => undefined,
    });
  } catch {
    // The tarball is excluded from future snapshots and lives only in the pod's
    // ephemeral view of the workspace; a failed cleanup is not worth failing on.
  }
}

/**
 * Assemble the environment for a server-deploy pod: the transfer descriptor
 * (APP_SRC_URL/APP_SRC_B64), the port, the deployment id, the project's secrets
 * (DB URL included), and any per-deploy env overrides. For a production deploy the
 * project's `PROD_DATABASE_URL` is surfaced to the app as `DATABASE_URL` so app
 * code that reads `process.env.DATABASE_URL` talks to the production database.
 */
export function buildServerDeployEnv(input: {
  /** Absent for snapshot-image deploys: the app is baked into the image, no APP_SRC_* fetch. */
  transfer?: SnapshotTransfer;
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

  if (input.transfer?.kind === 'objectStorage') {
    env.APP_SRC_URL = input.transfer.url;
  } else if (input.transfer) {
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
