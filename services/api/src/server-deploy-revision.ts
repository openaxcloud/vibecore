/*
 * Revision-based docker-build context (reproducible pipeline —
 * docs/DEPLOY_REPRODUCIBLE_PIPELINE.md).
 *
 * Replaces the Phase-A live-pod snapshot as the source of the app image:
 *
 *   1. capture the project REVISION (source only, sha256-hashed pod-side)
 *   2. run install + build in an ISOLATED throwaway build pod (workspace-manager
 *      /app-builds/run — gVisor, emptyDir, optional /nix RO, no workspace PVC)
 *   3. the pod uploads the full artifact (deps included) to the SAME context
 *      object key Cloud Build already consumes
 *
 * Downstream (Cloud Build generic COPY Dockerfile → Artifact Registry →
 * serverAppDeployment) is untouched: this module only changes WHERE the context
 * bytes come from — a replayable (revision, lock) build instead of whatever the
 * live dev pod contained.
 */
import {
  serverDeployContextObjectKey,
  snapshotWorkspaceRevision,
  type ImageContextResult,
  type ImageContextStorage,
  type SnapshotAgent,
} from './server-deploy-transfer.js';
import { appPublicEnglish } from './app-public-copy.js';
import { assertValidObjectKey } from './object-storage.js';

/*
 * RR-08 point 1 — the publish path must PRESERVE the typed error code.
 * `ecodeLockError = (error as Error).message` erased `.code` before anything
 * persisted it: the deployment artifact only carried prose while the contract
 * claimed ECODE_LOCK_GENERATION_REVOKED. This helper is the single shaping
 * point: the code survives into the persisted deployment error/log line
 * (stable machine-parseable prefix) and is unit-tested to be REQUIRED.
 */
export interface EcodeLockFailure {
  /** Typed code (ECODE_LOCK_GENERATION_REVOKED, ECODE_LOCK_UNPINNED, …). */
  code: string;
  message: string;

  /** The exact line persisted into the deployment logs/status. */
  logLine: string;
}

export function describeEcodeLockFailure(error: unknown): EcodeLockFailure {
  const code = (error as { code?: string })?.code ?? 'ECODE_LOCK_INVALID';
  const message = error instanceof Error ? error.message : String(error);

  return { code, message, logLine: `${code}: ${message}` };
}

/** Wire payload for the manager's POST /app-builds/run. */
export interface AppBuildRunPayload {
  deploymentId: string;
  orgId?: string;
  projectId?: string;
  image: string;
  revisionUrl: string;
  revisionSha256?: string;
  artifactUrl: string;
  artifactHeaders: Record<string, string>;
  buildCommand?: string;
  timeoutSeconds: number;
  nixStorePvcName?: string;

  /** CTR-RUNTIME-NIX: ecode.lock generation pin (manager enforces revocation). */
  nixGenerationRef?: string;
}

export interface AppBuildRunResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
  phase: string;
}

/** The storage subset this flow needs: the image-context subset + signed GETs. */
export interface RevisionBuildStorage extends ImageContextStorage {
  createDownloadUrl(projectId: string, input: { key: string }): Promise<{ url: string; expiresAt: string }>;
}

export type RevisionImageContextResult = ImageContextResult & {
  /** Set on success: the replayable input this artifact was built from. */
  revisionObject?: string;
  revisionSha256?: string;
  revisionBytes?: number;
};

/**
 * Produce the docker-build context from (revision → isolated build) instead of
 * the live pod. Returns the same bucket/object contract as
 * snapshotWorkspaceImageContext so the caller's downstream is identical.
 */
export async function buildImageContextFromRevision(opts: {
  agent: SnapshotAgent;
  deploymentId: string;
  projectId: string;
  orgId?: string;
  objectStorage: RevisionBuildStorage | null;

  /** Toolchain image for the build pod (same base image the app image uses). */
  image: string;

  /** Package-manager install, composed by the caller from detection. */
  installCommand: string;

  /** Declared/detected build command, or null when the app has no build step. */
  buildCommand: string | null;
  nixStorePvcName?: string;
  nixGenerationRef?: string;
  timeoutSeconds?: number;

  /** Transport to the workspace-manager (injected so this module stays pure). */
  runAppBuild: (payload: AppBuildRunPayload) => Promise<AppBuildRunResult>;
  onLog?: (level: 'info' | 'error', line: string) => void;
}): Promise<RevisionImageContextResult> {
  const onLog = opts.onLog ?? (() => undefined);
  const timeoutSeconds = opts.timeoutSeconds ?? 600;

  if (!opts.objectStorage || !opts.objectStorage.active) {
    return {
      ok: false,
      error: 'STORAGE_UNAVAILABLE',
      message: appPublicEnglish('SERVER_REVISION_STORAGE_REQUIRED'),
    };
  }

  const revision = await snapshotWorkspaceRevision({
    agent: opts.agent,
    deploymentId: opts.deploymentId,
    objectStorage: opts.objectStorage,
    projectId: opts.projectId,
    onLog,
  });

  if (!revision.ok || !revision.bucket || !revision.object) {
    return revision;
  }

  const contextKey = assertValidObjectKey(serverDeployContextObjectKey(opts.deploymentId));

  let revisionUrl: string;
  let upload: { url: string; headers: Record<string, string> };

  try {
    revisionUrl = (await opts.objectStorage.createDownloadUrl(opts.projectId, { key: revision.object })).url;
    upload = await opts.objectStorage.createUploadUrl(opts.projectId, {
      key: contextKey,
      contentType: 'application/gzip',
    });
  } catch (error) {
    return {
      ok: false,
      error: 'STORAGE_UNAVAILABLE',
      message: appPublicEnglish('SERVER_REVISION_SIGN_FAILED'),
    };
  }

  // ONE shell command: install then build. All per-language knowledge stays in
  // the caller's detection / .ecode/deploy.json — the build pod is generic.
  const buildCommand = [opts.installCommand, opts.buildCommand].filter(Boolean).join(' && ');

  onLog('info', `[build] isolated build starting (revision ${revision.sha256?.slice(0, 12) ?? 'unhashed'})`);

  let build: AppBuildRunResult;

  try {
    build = await opts.runAppBuild({
      deploymentId: opts.deploymentId,
      orgId: opts.orgId,
      projectId: opts.projectId,
      image: opts.image,
      revisionUrl,
      revisionSha256: revision.sha256,
      artifactUrl: upload.url,
      artifactHeaders: upload.headers,
      buildCommand: buildCommand || undefined,
      timeoutSeconds,
      nixStorePvcName: opts.nixStorePvcName,
      nixGenerationRef: opts.nixGenerationRef,
    });
  } catch (error) {
    return {
      ok: false,
      error: 'SNAPSHOT_FAILED',
      message: appPublicEnglish('SERVER_REVISION_BUILD_FAILED'),
    };
  }

  // Surface the pod's own log so the deploy build log tells the whole story.
  for (const line of build.output.split('\n')) {
    if (line.trim()) {
      onLog('info', line);
    }
  }

  if (build.timedOut) {
    return {
      ok: false,
      error: 'SNAPSHOT_FAILED',
      message: appPublicEnglish('SERVER_REVISION_BUILD_TIMEOUT'),
    };
  }

  if (build.exitCode !== 0) {
    return {
      ok: false,
      error: 'SNAPSHOT_FAILED',
      message: appPublicEnglish('SERVER_REVISION_BUILD_FAILED'),
    };
  }

  return {
    ok: true,
    bucket: revision.bucket,
    object: contextKey,
    bytes: revision.bytes,
    revisionObject: revision.object,
    revisionSha256: revision.sha256,
    revisionBytes: revision.bytes,
  };
}
