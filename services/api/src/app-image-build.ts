/*
 * Snapshot-image builder (Replit-parity: "Publish = the workspace, imaged").
 *
 * Replit's deploy story converts the Repl into a container image — the user
 * never writes a Dockerfile and the platform never grows per-language deploy
 * code. This module is our version of that step: it takes the full-workspace
 * snapshot (deps included, uploaded to GCS by snapshotWorkspaceImageContext)
 * and turns it into a runnable app image via Cloud Build:
 *
 *   FROM <workspace base image>   ← the exact environment the app ran in
 *   COPY . /home/project          ← the workspace, verbatim (node_modules, .venv…)
 *   RUN <build command>           ← the ONLY throwaway copy a build ever runs in
 *   CMD <start command>
 *
 * The image is pushed to Artifact Registry and run by serverAppDeployment. No
 * install step exists anywhere: dependencies ride in the snapshot, so cold boot
 * is image pull + exec instead of fetch + install + build (measured 91s → target
 * well under 30s on a warm node).
 *
 * Auth is the GKE metadata server (Workload Identity) — no SDK dependency, and
 * every network edge is injectable so the module is fully unit-testable.
 */

import { createHash } from 'node:crypto';

import { appPublicEnglish } from './app-public-copy.js';

export interface AppImageBuildSpec {
  /** GCP project id hosting Cloud Build + Artifact Registry (e.g. vibecore-495216). */
  gcpProject: string;

  /** Cloud Build region (regional builds; e.g. europe-west9). */
  region: string;

  /** GCS bucket/object of the build-context tarball (from snapshotWorkspaceImageContext). */
  sourceBucket: string;
  sourceObject: string;

  /** Fully-qualified target image incl. tag (deployment-id pinned, never :latest). */
  imageUri: string;

  /** Cloud KMS asymmetric signing key used by Cloud Build through ADC. */
  cosignKmsKey: string;

  /** Dedicated same-project GSA used by Cloud Build (never an implicit default identity). */
  buildServiceAccount: string;

  /** Base image = the workspace runtime image (same env the app was built in). */
  baseImage: string;

  /** Build command run at IMAGE BUILD time in the throwaway container, or null. */
  buildCommand: string | null;

  /** Start command baked as the image CMD. */
  startCommand: string;

  /** Cloud Build timeout (seconds). */
  timeoutSeconds?: number;
}

export interface AppImageBuildDeps {
  fetchImpl?: typeof fetch;

  /** Access-token provider; defaults to the GKE metadata server (Workload Identity). */
  getAccessToken?: () => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollIntervalMs?: number;
  submissionReconcileAttempts?: number;
  submissionReconcileIntervalMs?: number;
  onLog?: (level: 'info' | 'error', message: string) => void;

  /**
   * Durable lifecycle used by production callers. Every callback is a bounded
   * persistence/fence operation; it MUST NOT perform Cloud Build, registry, or
   * other provider I/O. Provider calls happen only after the callback resolves.
   */
  lifecycle?: DurableAppImageBuildLifecycle;
}

export type AppImageBuildAuthorityCheckpoint =
  | 'before-submission-state-read'
  | 'before-build-submit'
  | 'before-build-reconcile'
  | 'after-build-reconcile'
  | 'before-build-poll'
  | 'after-build-poll'
  | 'before-terminal-persist'
  | 'before-image-metadata-read'
  | 'after-image-metadata-read'
  | 'before-cancel-inspect'
  | 'after-cancel-inspect'
  | 'before-build-cancel'
  | 'after-build-cancel'
  | 'before-cancel-proof-persist';

export interface AppImageBuildAuthority {
  /** Fail closed when the durable owner/fencing token is no longer current. */
  assertAuthority(input: { checkpoint: AppImageBuildAuthorityCheckpoint; buildId?: string }): Promise<void>;
}

export type DurableAppImageBuildState =
  | { phase: 'PREPARED' }
  | { phase: 'SUBMITTING' }
  | { phase: 'IDENTIFIED'; buildId: string; logUrl?: string }
  | { phase: 'TERMINAL'; buildId: string; providerStatus: AppImageBuildTerminalStatus; logUrl?: string };

export interface DurableAppImageBuildLifecycle extends AppImageBuildAuthority {
  /** Stable, non-secret id generated and persisted before this function runs. */
  operationId: string;

  /** Read the lifecycle row owned by the current fence. */
  readState(): Promise<DurableAppImageBuildState>;

  /**
   * Atomically revalidate the current fence and persist SUBMITTING. This must
   * commit before Cloud Build receives a POST, so a crash can only recover/list
   * the tagged intent and can never blindly submit a duplicate.
   */
  markSubmissionStarted(input: { operationTag: string }): Promise<void>;

  /** Persist the provider id immediately after POST/reconciliation and before polling. */
  recordBuildIdentity(input: { buildId: string; operationTag: string; logUrl?: string }): Promise<void>;

  /** A definitive HTTP rejection may safely leave SUBMITTING through this fenced callback. */
  recordSubmissionRejected(input: { operationTag: string; status: number; detail: string }): Promise<void>;

  /** Persist the provider terminal observation before it is returned to deployment code. */
  recordTerminal(input: {
    buildId: string;
    providerStatus: AppImageBuildTerminalStatus;
    logUrl?: string;
    digest?: string;
  }): Promise<void>;
}

export type AppImageBuildResult =
  | {
      ok: true;
      imageUri: string;
      digest?: string;
      imageSizeBytes?: number;
      buildId: string;
      durationMs: number;
    }
  | {
      ok: false;
      error: string;
      code?:
        | 'CLOUD_BUILD_CREATE_FAILED'
        | 'CLOUD_BUILD_IDENTITY_INVALID'
        | 'CLOUD_BUILD_RECONCILIATION_AMBIGUOUS'
        | 'CLOUD_BUILD_SUBMISSION_UNCERTAIN';
      buildId?: string;
      logUrl?: string;
    };

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** Terminal Cloud Build statuses (anything else is still converging). */
export type AppImageBuildTerminalStatus =
  | 'SUCCESS'
  | 'FAILURE'
  | 'INTERNAL_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'EXPIRED';

const TERMINAL_STATUSES = new Set<AppImageBuildTerminalStatus>([
  'SUCCESS',
  'FAILURE',
  'INTERNAL_ERROR',
  'TIMEOUT',
  'CANCELLED',
  'EXPIRED',
]);

interface CloudBuildResource {
  id?: string;
  status?: string;
  logUrl?: string;
  tags?: string[];
  serviceAccount?: string;
  source?: { storageSource?: { bucket?: string; object?: string } };
  images?: string[];
  results?: { images?: Array<{ name?: string; digest?: string }> };
}

export interface AppImageBuildCancellationProof {
  buildId: string;
  providerStatus: AppImageBuildTerminalStatus;
  terminal: true;
  verifiedAt: string;
  cancelRequestAccepted: boolean;

  /**
   * Always true: an explicit push step may have completed before a later build
   * step failed/cancelled, so registry erasure must follow this terminal proof.
   */
  requiresRegistrySweep: true;
  lateSuccess: boolean;
  logUrl?: string;
}

export type AppImageBuildCancellationResult =
  | { ok: true; proof: AppImageBuildCancellationProof }
  | {
      ok: false;
      code:
        | 'CLOUD_BUILD_AUTH_UNAVAILABLE'
        | 'CLOUD_BUILD_ID_UNRESOLVED'
        | 'CLOUD_BUILD_IDENTITY_INVALID'
        | 'CLOUD_BUILD_RECONCILIATION_AMBIGUOUS'
        | 'CLOUD_BUILD_PROVIDER_UNAVAILABLE'
        | 'CLOUD_BUILD_CANCEL_NOT_TERMINAL';
      error: string;
      buildId?: string;
      logUrl?: string;
    };

export interface AppImageBuildCancellationDeps extends AppImageBuildAuthority {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollIntervalMs?: number;
  timeoutMs?: number;
  submissionReconcileAttempts?: number;
  submissionReconcileIntervalMs?: number;

  /** Optional fenced persistence into the deletion/recovery plan. No provider I/O. */
  recordRecoveredBuildIdentity?: (input: { buildId: string; operationTag: string; logUrl?: string }) => Promise<void>;

  /** Optional fenced persistence of the final live provider proof. No provider I/O. */
  recordCancellationProof?: (proof: AppImageBuildCancellationProof) => Promise<void>;
}

const COSIGN_KMS_RE =
  /^gcpkms:\/\/projects\/(?<project>[a-z][a-z0-9-]{4,61}[a-z0-9])\/locations\/[a-z0-9-]+\/keyRings\/[A-Za-z0-9_-]+\/cryptoKeys\/[A-Za-z0-9_-]+$/u;
const CLOUD_BUILD_SERVICE_ACCOUNT_RE =
  /^projects\/(?<project>[a-z][a-z0-9-]{4,61}[a-z0-9])\/serviceAccounts\/(?<email>[a-z][a-z0-9-]{4,28}[a-z0-9]@(?<emailProject>[a-z][a-z0-9-]{4,61}[a-z0-9])\.iam\.gserviceaccount\.com)$/u;
const COSIGN_IMAGE =
  'ghcr.io/sigstore/cosign/cosign:v3.1.2@sha256:d91bc4e7e95e8d2f549c747a72dc174f90579e410a1695f57f686674f84ce849';
const SYFT_IMAGE =
  'docker.io/anchore/syft:v1.30.0@sha256:bd5357d2cd087f03af748dac24df48bfbc1723080d78f75f69aca1f2d429060e';

function isTerminalStatus(status: string | undefined): status is AppImageBuildTerminalStatus {
  return Boolean(status) && TERMINAL_STATUSES.has(status as AppImageBuildTerminalStatus);
}

/**
 * Cloud Build does not expose a create request-id. A stable, non-secret build
 * tag is therefore the provider-side recovery key for an uncertain POST.
 */
export function appImageBuildOperationTag(operationId: string): string {
  if (!operationId.trim()) {
    throw new Error('A durable app-image build operation id is required.');
  }

  return `ecode_app_image_${createHash('sha256').update(operationId).digest('hex').slice(0, 48)}`;
}

function cloudBuildBase(spec: Pick<AppImageBuildSpec, 'gcpProject' | 'region'>): string {
  return `https://cloudbuild.googleapis.com/v1/projects/${spec.gcpProject}/locations/${spec.region}`;
}

function matchesDurableBuildIdentity(
  build: CloudBuildResource,
  spec: AppImageBuildSpec,
  operationTag: string,
): build is CloudBuildResource & { id: string } {
  return (
    typeof build.id === 'string' &&
    build.id.length > 0 &&
    build.tags?.includes(operationTag) === true &&
    build.source?.storageSource?.bucket === spec.sourceBucket &&
    build.source.storageSource.object === spec.sourceObject &&
    build.images?.includes(spec.imageUri) === true &&
    build.serviceAccount === spec.buildServiceAccount
  );
}

type BuildReconciliationResult =
  | { kind: 'found'; build: CloudBuildResource & { id: string } }
  | { kind: 'missing' }
  | {
      kind: 'failed';
      code: 'CLOUD_BUILD_IDENTITY_INVALID' | 'CLOUD_BUILD_RECONCILIATION_AMBIGUOUS';
      error: string;
    };

type CloudBuildSubmissionResult =
  | { kind: 'accepted'; buildId?: string; logUrl?: string }
  | { kind: 'rejected'; status: number; detail: string }
  | { kind: 'uncertain'; error: string };

async function submitCloudBuild(input: {
  url: string;
  headers: Record<string, string>;
  request: unknown;
  fetchImpl: typeof fetch;
}): Promise<CloudBuildSubmissionResult> {
  let response: Response;

  try {
    response = await input.fetchImpl(input.url, {
      method: 'POST',
      headers: input.headers,
      body: JSON.stringify(input.request),
    });
  } catch (error) {
    return { kind: 'uncertain', error: (error as Error).message ?? 'network error' };
  }

  if (!response.ok) {
    return {
      kind: 'rejected',
      status: response.status,
      detail: (await response.text().catch(() => '')).slice(0, 500),
    };
  }

  try {
    const operation = (await response.json()) as { metadata?: { build?: { id?: string; logUrl?: string } } };

    return {
      kind: 'accepted',
      ...(operation.metadata?.build?.id ? { buildId: operation.metadata.build.id } : {}),
      ...(operation.metadata?.build?.logUrl ? { logUrl: operation.metadata.build.logUrl } : {}),
    };
  } catch (error) {
    return { kind: 'uncertain', error: (error as Error).message ?? 'invalid create response' };
  }
}

async function reconcileTaggedBuild(input: {
  spec: AppImageBuildSpec;
  operationTag: string;
  token: string;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  attempts: number;
  intervalMs: number;
  authority: AppImageBuildAuthority;
}): Promise<BuildReconciliationResult> {
  const filter = encodeURIComponent(`tags="${input.operationTag}"`);
  const url = `${cloudBuildBase(input.spec)}/builds?filter=${filter}&pageSize=2`;

  for (let attempt = 0; attempt < input.attempts; attempt += 1) {
    if (attempt > 0) {
      await input.sleep(input.intervalMs);
    }

    await input.authority.assertAuthority({ checkpoint: 'before-build-reconcile' });

    let response: Response;

    try {
      response = await input.fetchImpl(url, {
        headers: { authorization: `Bearer ${input.token}`, 'content-type': 'application/json' },
      });
    } catch {
      continue;
    }

    await input.authority.assertAuthority({ checkpoint: 'after-build-reconcile' });

    if (!response.ok) {
      continue;
    }

    const body = (await response.json()) as { builds?: CloudBuildResource[]; nextPageToken?: string };
    const builds = body.builds ?? [];

    if (builds.length === 0 && !body.nextPageToken) {
      continue;
    }

    if (builds.length !== 1 || body.nextPageToken) {
      return {
        kind: 'failed',
        code: 'CLOUD_BUILD_RECONCILIATION_AMBIGUOUS',
        error: `Cloud Build recovery found multiple builds for durable tag ${input.operationTag}.`,
      };
    }

    const build = builds[0]!;

    if (!matchesDurableBuildIdentity(build, input.spec, input.operationTag)) {
      return {
        kind: 'failed',
        code: 'CLOUD_BUILD_IDENTITY_INVALID',
        error:
          'Cloud Build recovery found a build whose tenant/source/image identity does not match the durable intent.',
      };
    }

    return { kind: 'found', build };
  }

  return { kind: 'missing' };
}

/**
 * The generated Dockerfile — deliberately generic: the ONLY inputs are the base
 * image and the app's own build/start commands. No language ever appears here.
 */
export function buildAppImageDockerfile(spec: {
  baseImage: string;
  buildCommand: string | null;
  startCommand: string;
}): string {
  return [
    `FROM ${spec.baseImage}`,

    // uid 1000 matches the pod securityContext (runAsUser: 1000) and the base image's `node` user.
    'COPY --chown=1000:1000 . /home/project',
    'WORKDIR /home/project',

    // Replit-parity marker also baked into the image (belt and braces with the pod env).
    'ENV ECODE_DEPLOYMENT=1',
    ...(spec.buildCommand ? [`RUN ${spec.buildCommand}`] : []),
    `CMD ["sh", "-lc", ${JSON.stringify(spec.startCommand)}]`,
    '',
  ].join('\n');
}

/** Fetch a Workload Identity access token from the GKE metadata server. */
async function metadataAccessToken(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });

  if (!response.ok) {
    throw new Error(`metadata token request failed (${response.status})`);
  }

  const body = (await response.json()) as { access_token?: string };

  if (!body.access_token) {
    throw new Error('metadata token response had no access_token');
  }

  return body.access_token;
}

/**
 * Create the Cloud Build, poll it to a terminal state, and (best-effort) read
 * the pushed image's size from Artifact Registry. Never throws — a failed build
 * comes back as `{ ok: false }` with the build log URL for the deploy log.
 */
export async function runAppImageBuild(
  spec: AppImageBuildSpec,
  deps: AppImageBuildDeps = {},
): Promise<AppImageBuildResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getAccessToken = deps.getAccessToken ?? (() => metadataAccessToken(fetchImpl));
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const pollIntervalMs = deps.pollIntervalMs ?? 5000;
  const reconcileAttempts = Math.max(1, deps.submissionReconcileAttempts ?? 5);
  const reconcileIntervalMs = Math.max(0, deps.submissionReconcileIntervalMs ?? 1000);
  const onLog = deps.onLog ?? (() => undefined);
  const timeoutSeconds = spec.timeoutSeconds ?? 600;
  const startedAt = now();
  const lifecycle = deps.lifecycle;
  const operationTag = lifecycle ? appImageBuildOperationTag(lifecycle.operationId) : undefined;
  const kmsMatch = COSIGN_KMS_RE.exec(spec.cosignKmsKey);
  const builderMatch = CLOUD_BUILD_SERVICE_ACCOUNT_RE.exec(spec.buildServiceAccount);

  if (kmsMatch?.groups?.project !== spec.gcpProject) {
    return { ok: false, error: appPublicEnglish('APP_IMAGE_BUILD_KMS_INVALID') };
  }

  if (
    builderMatch?.groups?.project !== spec.gcpProject ||
    builderMatch.groups.emailProject !== spec.gcpProject ||
    !builderMatch.groups.email
  ) {
    return { ok: false, error: appPublicEnglish('APP_IMAGE_BUILD_SERVICE_ACCOUNT_INVALID') };
  }

  const dockerfileB64 = Buffer.from(
    buildAppImageDockerfile({
      baseImage: spec.baseImage,
      buildCommand: spec.buildCommand,
      startCommand: spec.startCommand,
    }),
    'utf8',
  ).toString('base64');

  const imageRepo = spec.imageUri.replace(/:[^:/]+$/u, '');

  /*
   * Supply-chain steps deliberately consume `/workspace/ecode-image-ref.txt`,
   * which contains the immutable repo@sha256 resolved immediately after the
   * explicit push. The tag is NEVER passed to Syft or Cosign. Cloud Build still
   * receives `images:[tag]` so it emits VERIFIED native provenance and returns
   * the final digest in build.results. Promotion uses that final digest and
   * requires the signature + signed SBOM to refer to the exact same digest; if
   * Cloud Build's final bookkeeping push ever differed, release fails closed.
   *
   * Cosign/Syft images are pinned by multi-arch digest. They are distroless, so
   * a short extraction step copies their static binaries into /workspace; the
   * binaries then run in the Cloud Build step itself and inherit ADC/KMS access.
   */
  const buildRequest = {
    source: { storageSource: { bucket: spec.sourceBucket, object: spec.sourceObject } },
    steps: [
      {
        id: 'build-image',
        name: 'gcr.io/cloud-builders/docker',
        entrypoint: 'sh',
        args: [
          '-c',
          `printf '%s' '${dockerfileB64}' | base64 -d > .ecode-app.Dockerfile && docker build -f .ecode-app.Dockerfile -t '${spec.imageUri}' .`,
        ],
      },
      {
        id: 'push-image',
        name: 'gcr.io/cloud-builders/docker',
        waitFor: ['build-image'],
        entrypoint: 'sh',
        args: [
          '-ceu',
          [
            'docker push "$1"',
            'DIGEST_REF="$(docker image inspect --format=\'{{index .RepoDigests 0}}\' "$1")"',
            'case "$DIGEST_REF" in "$2"@sha256:*) ;; *) echo "pushed image digest is invalid" >&2; exit 65 ;; esac',
            'DIGEST="${DIGEST_REF##*@sha256:}"',
            '[ "${#DIGEST}" -eq 64 ] && printf "%s" "$DIGEST" | grep -Eq "^[a-f0-9]{64}$"',
            'printf "%s" "$DIGEST_REF" > /workspace/ecode-image-ref.txt',
          ].join('\n'),
          'ecode-push',
          spec.imageUri,
          imageRepo,
        ],
      },
      {
        id: 'extract-supply-chain-tools',
        name: 'gcr.io/cloud-builders/docker',
        waitFor: ['push-image'],
        entrypoint: 'sh',
        args: [
          '-ceu',
          [
            'docker pull "$1"',
            'docker pull "$2"',
            'COSIGN_CONTAINER="$(docker create "$1")"',
            'SYFT_CONTAINER="$(docker create "$2")"',
            'cleanup() { docker rm "$COSIGN_CONTAINER" "$SYFT_CONTAINER" >/dev/null 2>&1 || true; }',
            'trap cleanup EXIT',
            'docker cp "$COSIGN_CONTAINER":/ko-app/cosign /workspace/ecode-cosign',
            'docker cp "$SYFT_CONTAINER":/syft /workspace/ecode-syft',
            'chmod 0555 /workspace/ecode-cosign /workspace/ecode-syft',
            '/workspace/ecode-cosign signing-config create --out /workspace/ecode-signing-config.json',
          ].join('\n'),
          'ecode-tools',
          COSIGN_IMAGE,
          SYFT_IMAGE,
        ],
      },
      {
        id: 'generate-sbom',
        name: 'gcr.io/cloud-builders/docker',
        waitFor: ['extract-supply-chain-tools'],
        entrypoint: 'sh',
        args: [
          '-ceu',
          'DIGEST_REF="$(cat /workspace/ecode-image-ref.txt)"\n/workspace/ecode-syft "docker:${DIGEST_REF}" -o spdx-json=/workspace/ecode-app.spdx.json',
        ],
      },
      {
        id: 'sign-image',
        name: 'gcr.io/cloud-builders/docker',
        waitFor: ['extract-supply-chain-tools'],
        entrypoint: 'sh',
        args: [
          '-ceu',
          [
            'DIGEST_REF="$(cat /workspace/ecode-image-ref.txt)"',
            'COSIGN_EXPERIMENTAL=1 /workspace/ecode-cosign sign --key "$1" --signing-config /workspace/ecode-signing-config.json --yes --registry-referrers-mode=oci-1-1 "$DIGEST_REF"',
          ].join('\n'),
          'ecode-sign',
          spec.cosignKmsKey,
        ],
      },
      {
        id: 'attest-sbom',
        name: 'gcr.io/cloud-builders/docker',
        waitFor: ['generate-sbom', 'sign-image'],
        entrypoint: 'sh',
        args: [
          '-ceu',
          [
            'DIGEST_REF="$(cat /workspace/ecode-image-ref.txt)"',
            'COSIGN_EXPERIMENTAL=1 /workspace/ecode-cosign attest --key "$1" --signing-config /workspace/ecode-signing-config.json --predicate /workspace/ecode-app.spdx.json --type spdxjson --yes "$DIGEST_REF"',
          ].join('\n'),
          'ecode-attest',
          spec.cosignKmsKey,
        ],
      },
      {
        id: 'verify-supply-chain',
        name: 'gcr.io/cloud-builders/docker',
        waitFor: ['attest-sbom'],
        entrypoint: 'sh',
        args: [
          '-ceu',
          [
            'DIGEST_REF="$(cat /workspace/ecode-image-ref.txt)"',
            'COSIGN_EXPERIMENTAL=1 /workspace/ecode-cosign verify --key "$1" --insecure-ignore-tlog "$DIGEST_REF" >/dev/null',
            'COSIGN_EXPERIMENTAL=1 /workspace/ecode-cosign verify-attestation --key "$1" --type spdxjson --insecure-ignore-tlog "$DIGEST_REF" >/dev/null',
          ].join('\n'),
          'ecode-verify',
          spec.cosignKmsKey,
        ],
      },
    ],
    images: [spec.imageUri],
    ...(operationTag ? { tags: ['ecode-app-image', operationTag] } : {}),
    serviceAccount: spec.buildServiceAccount,
    timeout: `${timeoutSeconds}s`,

    /*
     * Fail the build itself unless Cloud Build produced verifiable provenance.
     * The promotion gate still independently discovers and validates it by
     * digest in Artifact Registry.
     */
    options: { logging: 'CLOUD_LOGGING_ONLY', requestedVerifyOption: 'VERIFIED' },
  };

  const base = cloudBuildBase(spec);

  let token: string;

  try {
    token = await getAccessToken();
  } catch (error) {
    return { ok: false, error: `Cloud Build auth unavailable (${(error as Error).message ?? 'token error'})` };
  }

  const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  let buildId: string | undefined;
  let logUrl: string | undefined;

  const recoverDurableBuild = async (): Promise<BuildReconciliationResult> => {
    if (!lifecycle || !operationTag) {
      return { kind: 'missing' };
    }

    return reconcileTaggedBuild({
      spec,
      operationTag,
      token,
      fetchImpl,
      sleep,
      attempts: reconcileAttempts,
      intervalMs: reconcileIntervalMs,
      authority: lifecycle,
    });
  };

  let shouldSubmit = true;

  if (lifecycle && operationTag) {
    await lifecycle.assertAuthority({ checkpoint: 'before-submission-state-read' });

    const state = await lifecycle.readState();

    if (state.phase === 'PREPARED') {
      await lifecycle.markSubmissionStarted({ operationTag });
    } else if (state.phase === 'SUBMITTING') {
      shouldSubmit = false;
    } else {
      shouldSubmit = false;
      buildId = state.buildId;
      logUrl = state.logUrl;
    }
  }

  if (shouldSubmit) {
    if (lifecycle) {
      await lifecycle.assertAuthority({ checkpoint: 'before-build-submit' });
    }

    const submission = await submitCloudBuild({
      url: `${base}/builds`,
      headers: authHeaders,
      request: buildRequest,
      fetchImpl,
    });

    if (submission.kind === 'rejected') {
      if (lifecycle && operationTag) {
        await lifecycle.recordSubmissionRejected({
          operationTag,
          status: submission.status,
          detail: submission.detail,
        });
      }

      return {
        ok: false,
        code: 'CLOUD_BUILD_CREATE_FAILED',
        error: `Cloud Build create failed (${submission.status}): ${submission.detail}`,
      };
    }

    if (submission.kind === 'accepted') {
      buildId = submission.buildId;
      logUrl = submission.logUrl;
    } else if (!lifecycle) {
      return {
        ok: false,
        code: 'CLOUD_BUILD_CREATE_FAILED',
        error: `Cloud Build create failed (${submission.error})`,
      };
    } else {
      /*
       * The POST may have reached Google. Never issue another create here: the
       * durable SUBMITTING state and provider tag are the only safe recovery path.
       */
      const recovered = await recoverDurableBuild();

      if (recovered.kind === 'failed') {
        return { ok: false, code: recovered.code, error: recovered.error };
      }

      if (recovered.kind === 'found' && operationTag) {
        buildId = recovered.build.id;
        logUrl = recovered.build.logUrl;
        await lifecycle.recordBuildIdentity({
          buildId,
          operationTag,
          ...(logUrl ? { logUrl } : {}),
        });
      } else {
        return {
          ok: false,
          code: 'CLOUD_BUILD_SUBMISSION_UNCERTAIN',
          error: 'Cloud Build submission outcome is uncertain; retry the same durable operation to reconcile it.',
        };
      }
    }

    if (submission.kind === 'accepted' && buildId && lifecycle && operationTag) {
      /* The callback is the first action after parsing POST and precedes every poll/log. */
      await lifecycle.recordBuildIdentity({ buildId, operationTag, ...(logUrl ? { logUrl } : {}) });
    }
  } else if (!buildId) {
    const recovered = await recoverDurableBuild();

    if (recovered.kind === 'failed') {
      return { ok: false, code: recovered.code, error: recovered.error };
    }

    if (recovered.kind === 'found' && lifecycle && operationTag) {
      buildId = recovered.build.id;
      logUrl = recovered.build.logUrl;
      await lifecycle.recordBuildIdentity({ buildId, operationTag, ...(logUrl ? { logUrl } : {}) });
    } else {
      return {
        ok: false,
        code: 'CLOUD_BUILD_SUBMISSION_UNCERTAIN',
        error: 'Cloud Build submission is durable but its provider build id is not visible yet; retry reconciliation.',
      };
    }
  }

  if (!buildId && lifecycle) {
    const recovered = await recoverDurableBuild();

    if (recovered.kind === 'failed') {
      return { ok: false, code: recovered.code, error: recovered.error };
    }

    if (recovered.kind === 'found' && operationTag) {
      buildId = recovered.build.id;
      logUrl = recovered.build.logUrl;
      await lifecycle.recordBuildIdentity({ buildId, operationTag, ...(logUrl ? { logUrl } : {}) });
    }
  }

  if (!buildId) {
    return {
      ok: false,
      code: lifecycle ? 'CLOUD_BUILD_SUBMISSION_UNCERTAIN' : 'CLOUD_BUILD_CREATE_FAILED',
      error: lifecycle
        ? 'Cloud Build create returned no build id and recovery has not observed the tagged build yet.'
        : 'Cloud Build create returned no build id',
    };
  }

  onLog(
    'info',
    appPublicEnglish('APP_IMAGE_BUILD_QUEUED', {
      buildId,
      bucket: spec.sourceBucket,
      object: spec.sourceObject,
    }),
  );

  /*
   * Poll to a terminal state. Deadline = the build's own timeout + queue/pull
   * margin; a build the API loses track of is reported failed with its log URL
   * (the deploy reaper would also fail the row later — this is friendlier).
   */
  const deadline = startedAt + (timeoutSeconds + 180) * 1000;

  let status = 'QUEUED';

  let build: CloudBuildResource = {};

  while (now() < deadline) {
    await sleep(pollIntervalMs);

    if (lifecycle) {
      await lifecycle.assertAuthority({ checkpoint: 'before-build-poll', buildId });
    }

    let polled: Response;

    try {
      polled = await fetchImpl(`${base}/builds/${encodeURIComponent(buildId)}`, { headers: authHeaders });
    } catch {
      if (lifecycle) {
        await lifecycle.assertAuthority({ checkpoint: 'after-build-poll', buildId });
      }

      continue;
    }

    if (lifecycle) {
      await lifecycle.assertAuthority({ checkpoint: 'after-build-poll', buildId });
    }

    if (!polled.ok) {
      continue; // transient poll failure — the deadline bounds us
    }

    build = (await polled.json()) as CloudBuildResource;

    if (lifecycle && operationTag && !matchesDurableBuildIdentity(build, spec, operationTag)) {
      return {
        ok: false,
        code: 'CLOUD_BUILD_IDENTITY_INVALID',
        error:
          'Cloud Build poll returned a build whose tenant/source/image identity does not match the durable intent.',
        buildId,
        ...((build.logUrl ?? logUrl) ? { logUrl: build.logUrl ?? logUrl } : {}),
      };
    }

    if (build.status && build.status !== status) {
      status = build.status;
      onLog('info', appPublicEnglish('APP_IMAGE_BUILD_STATUS', { buildId, status }));
    }

    if (isTerminalStatus(status)) {
      break;
    }
  }

  logUrl = build.logUrl ?? logUrl;

  const digest = build.results?.images?.find((image) => image.name === spec.imageUri)?.digest;

  if (lifecycle && isTerminalStatus(status)) {
    await lifecycle.assertAuthority({ checkpoint: 'before-terminal-persist', buildId });
    await lifecycle.recordTerminal({
      buildId,
      providerStatus: status,
      ...(logUrl ? { logUrl } : {}),
      ...(digest ? { digest } : {}),
    });
  }

  if (status !== 'SUCCESS') {
    const suffix = isTerminalStatus(status) ? status : `still ${status} past deadline`;

    return { ok: false, error: `Image build ${suffix}${logUrl ? ` — logs: ${logUrl}` : ''}`, buildId, logUrl };
  }

  let imageSizeBytes: number | undefined;

  if (digest) {
    if (lifecycle) {
      await lifecycle.assertAuthority({ checkpoint: 'before-image-metadata-read', buildId });
    }

    imageSizeBytes = await fetchImageSizeBytes({ imageUri: spec.imageUri, digest, token, fetchImpl }).catch(
      () => undefined,
    );

    if (lifecycle) {
      await lifecycle.assertAuthority({ checkpoint: 'after-image-metadata-read', buildId });
    }
  }

  return { ok: true, imageUri: spec.imageUri, digest, imageSizeBytes, buildId, durationMs: now() - startedAt };
}

/**
 * Cancel/recover one durable Cloud Build producer and wait for a fresh terminal
 * provider observation. A terminal proof never implies registry absence: the
 * explicit push step can finish before a later attestation/cancellation edge,
 * so hard deletion must run its registry sweep after this proof.
 */
export async function cancelAppImageBuildAndWait(
  spec: AppImageBuildSpec,
  reference: { operationId: string; buildId?: string },
  deps: AppImageBuildCancellationDeps,
): Promise<AppImageBuildCancellationResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getAccessToken = deps.getAccessToken ?? (() => metadataAccessToken(fetchImpl));
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const pollIntervalMs = Math.max(0, deps.pollIntervalMs ?? 1000);
  const reconcileAttempts = Math.max(1, deps.submissionReconcileAttempts ?? 5);
  const reconcileIntervalMs = Math.max(0, deps.submissionReconcileIntervalMs ?? 1000);
  const timeoutMs = Math.max(1, deps.timeoutMs ?? ((spec.timeoutSeconds ?? 600) + 180) * 1000);
  const operationTag = appImageBuildOperationTag(reference.operationId);
  const base = cloudBuildBase(spec);
  const startedAt = now();

  await deps.assertAuthority({
    checkpoint: 'before-cancel-inspect',
    ...(reference.buildId ? { buildId: reference.buildId } : {}),
  });

  let token: string;

  try {
    token = await getAccessToken();
  } catch (error) {
    return {
      ok: false,
      code: 'CLOUD_BUILD_AUTH_UNAVAILABLE',
      error: `Cloud Build auth unavailable (${(error as Error).message ?? 'token error'})`,
      ...(reference.buildId ? { buildId: reference.buildId } : {}),
    };
  }

  const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  let buildId = reference.buildId;
  let logUrl: string | undefined;

  if (!buildId) {
    const recovered = await reconcileTaggedBuild({
      spec,
      operationTag,
      token,
      fetchImpl,
      sleep,
      attempts: reconcileAttempts,
      intervalMs: reconcileIntervalMs,
      authority: deps,
    });

    if (recovered.kind === 'failed') {
      return { ok: false, code: recovered.code, error: recovered.error };
    }

    if (recovered.kind === 'missing') {
      return {
        ok: false,
        code: 'CLOUD_BUILD_ID_UNRESOLVED',
        error: 'The durable Cloud Build submission has no provider id and its tagged build is not visible yet.',
      };
    }

    buildId = recovered.build.id;
    logUrl = recovered.build.logUrl;

    if (deps.recordRecoveredBuildIdentity) {
      await deps.recordRecoveredBuildIdentity({ buildId, operationTag, ...(logUrl ? { logUrl } : {}) });
    }
  }

  const inspect = async (
    before: 'before-cancel-inspect' | 'before-build-poll',
    after: 'after-cancel-inspect' | 'after-build-poll',
  ): Promise<{ kind: 'ok'; build: CloudBuildResource } | { kind: 'unavailable'; error: string }> => {
    await deps.assertAuthority({ checkpoint: before, buildId });

    let response: Response;

    try {
      response = await fetchImpl(`${base}/builds/${encodeURIComponent(buildId)}`, { headers: authHeaders });
    } catch (error) {
      await deps.assertAuthority({ checkpoint: after, buildId });
      return { kind: 'unavailable', error: (error as Error).message ?? 'network error' };
    }

    await deps.assertAuthority({ checkpoint: after, buildId });

    if (!response.ok) {
      return { kind: 'unavailable', error: `Cloud Build inspect failed (${response.status})` };
    }

    return { kind: 'ok', build: (await response.json()) as CloudBuildResource };
  };

  let observation = await inspect('before-cancel-inspect', 'after-cancel-inspect');

  if (observation.kind === 'unavailable') {
    return {
      ok: false,
      code: 'CLOUD_BUILD_PROVIDER_UNAVAILABLE',
      error: observation.error,
      buildId,
      ...(logUrl ? { logUrl } : {}),
    };
  }

  if (!matchesDurableBuildIdentity(observation.build, spec, operationTag) || observation.build.id !== buildId) {
    return {
      ok: false,
      code: 'CLOUD_BUILD_IDENTITY_INVALID',
      error: 'Refusing to cancel a Cloud Build whose tenant/source/image identity does not match the durable intent.',
      buildId,
      ...((observation.build.logUrl ?? logUrl) ? { logUrl: observation.build.logUrl ?? logUrl } : {}),
    };
  }

  logUrl = observation.build.logUrl ?? logUrl;

  let status = observation.build.status;
  let cancelRequestAccepted = false;

  if (!isTerminalStatus(status)) {
    await deps.assertAuthority({ checkpoint: 'before-build-cancel', buildId });

    try {
      const name = `projects/${spec.gcpProject}/locations/${spec.region}/builds/${buildId}`;

      const response = await fetchImpl(`${base}/builds/${encodeURIComponent(buildId)}:cancel`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ name }),
      });
      cancelRequestAccepted = response.ok;
    } catch {
      /* A lost cancel response is reconciled exclusively through live GETs below. */
    }

    await deps.assertAuthority({ checkpoint: 'after-build-cancel', buildId });
  }

  while (!isTerminalStatus(status) && now() < startedAt + timeoutMs) {
    await sleep(pollIntervalMs);
    observation = await inspect('before-build-poll', 'after-build-poll');

    if (observation.kind === 'unavailable') {
      continue;
    }

    if (!matchesDurableBuildIdentity(observation.build, spec, operationTag) || observation.build.id !== buildId) {
      return {
        ok: false,
        code: 'CLOUD_BUILD_IDENTITY_INVALID',
        error: 'Cloud Build cancellation polling observed an identity mismatch.',
        buildId,
        ...((observation.build.logUrl ?? logUrl) ? { logUrl: observation.build.logUrl ?? logUrl } : {}),
      };
    }

    status = observation.build.status;
    logUrl = observation.build.logUrl ?? logUrl;
  }

  if (!isTerminalStatus(status)) {
    return {
      ok: false,
      code: 'CLOUD_BUILD_CANCEL_NOT_TERMINAL',
      error: `Cloud Build ${buildId} is still ${status ?? 'UNKNOWN'} after the cancellation deadline.`,
      buildId,
      ...(logUrl ? { logUrl } : {}),
    };
  }

  const proof: AppImageBuildCancellationProof = {
    buildId,
    providerStatus: status,
    terminal: true,
    verifiedAt: new Date(now()).toISOString(),
    cancelRequestAccepted,
    requiresRegistrySweep: true,
    lateSuccess: status === 'SUCCESS',
    ...(logUrl ? { logUrl } : {}),
  };

  await deps.assertAuthority({ checkpoint: 'before-cancel-proof-persist', buildId });

  if (deps.recordCancellationProof) {
    await deps.recordCancellationProof(proof);
  }

  return { ok: true, proof };
}

/*
 * Best-effort image size from Artifact Registry (surfaced in the deploy log —
 * Replit's hard limit is 8GiB, so every publish reports its size). An AR
 * hiccup must never fail a deploy whose image IS pushed, hence best-effort.
 */
async function fetchImageSizeBytes(input: {
  imageUri: string;
  digest: string;
  token: string;
  fetchImpl: typeof fetch;
}): Promise<number | undefined> {
  // <region>-docker.pkg.dev/<project>/<repo>/<package...>:<tag>
  const match = /^([a-z0-9-]+)-docker\.pkg\.dev\/([^/]+)\/([^/]+)\/(.+?)(?::[^:/]+)?$/.exec(input.imageUri);

  if (!match) {
    return undefined;
  }

  const [, location, project, repo, packagePath] = match;

  const resource = `projects/${project}/locations/${location}/repositories/${repo}/dockerImages/${encodeURIComponent(
    `${packagePath}@${input.digest}`,
  )}`;
  const response = await input.fetchImpl(`https://artifactregistry.googleapis.com/v1/${resource}`, {
    headers: { authorization: `Bearer ${input.token}` },
  });

  if (!response.ok) {
    return undefined;
  }

  const body = (await response.json()) as { imageSizeBytes?: string | number };
  const size = Number(body.imageSizeBytes);

  return Number.isFinite(size) && size > 0 ? size : undefined;
}
