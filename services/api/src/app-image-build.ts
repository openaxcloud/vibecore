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
  pollIntervalMs?: number;
  onLog?: (level: 'info' | 'error', message: string) => void;
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
  | { ok: false; error: string; buildId?: string; logUrl?: string };

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** Terminal Cloud Build statuses (anything else is still converging). */
const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']);

const COSIGN_KMS_RE =
  /^gcpkms:\/\/projects\/(?<project>[a-z][a-z0-9-]{4,61}[a-z0-9])\/locations\/[a-z0-9-]+\/keyRings\/[A-Za-z0-9_-]+\/cryptoKeys\/[A-Za-z0-9_-]+$/u;
const CLOUD_BUILD_SERVICE_ACCOUNT_RE =
  /^projects\/(?<project>[a-z][a-z0-9-]{4,61}[a-z0-9])\/serviceAccounts\/(?<email>[a-z][a-z0-9-]{4,28}[a-z0-9]@(?<emailProject>[a-z][a-z0-9-]{4,61}[a-z0-9])\.iam\.gserviceaccount\.com)$/u;
const COSIGN_IMAGE =
  'ghcr.io/sigstore/cosign/cosign:v3.1.2@sha256:d91bc4e7e95e8d2f549c747a72dc174f90579e410a1695f57f686674f84ce849';
const SYFT_IMAGE =
  'docker.io/anchore/syft:v1.30.0@sha256:bd5357d2cd087f03af748dac24df48bfbc1723080d78f75f69aca1f2d429060e';

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
  const pollIntervalMs = deps.pollIntervalMs ?? 5000;
  const onLog = deps.onLog ?? (() => undefined);
  const timeoutSeconds = spec.timeoutSeconds ?? 600;
  const startedAt = Date.now();
  const kmsMatch = COSIGN_KMS_RE.exec(spec.cosignKmsKey);
  const builderMatch = CLOUD_BUILD_SERVICE_ACCOUNT_RE.exec(spec.buildServiceAccount);

  if (kmsMatch?.groups?.project !== spec.gcpProject) {
    return { ok: false, error: 'Cloud Build Cosign KMS key is missing or outside the build project.' };
  }

  if (
    builderMatch?.groups?.project !== spec.gcpProject ||
    builderMatch.groups.emailProject !== spec.gcpProject ||
    !builderMatch.groups.email
  ) {
    return { ok: false, error: 'Dedicated Cloud Build service account is missing or outside the build project.' };
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
    serviceAccount: spec.buildServiceAccount,
    timeout: `${timeoutSeconds}s`,

    /*
     * Fail the build itself unless Cloud Build produced verifiable provenance.
     * The promotion gate still independently discovers and validates it by
     * digest in Artifact Registry.
     */
    options: { logging: 'CLOUD_LOGGING_ONLY', requestedVerifyOption: 'VERIFIED' },
  };

  const base = `https://cloudbuild.googleapis.com/v1/projects/${spec.gcpProject}/locations/${spec.region}`;

  let token: string;

  try {
    token = await getAccessToken();
  } catch (error) {
    return { ok: false, error: `Cloud Build auth unavailable (${(error as Error).message ?? 'token error'})` };
  }

  const authHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  let buildId: string | undefined;
  let logUrl: string | undefined;

  try {
    const created = await fetchImpl(`${base}/builds`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(buildRequest),
    });

    if (!created.ok) {
      const detail = await created.text().catch(() => '');

      return { ok: false, error: `Cloud Build create failed (${created.status}): ${detail.slice(0, 500)}` };
    }

    const operation = (await created.json()) as { metadata?: { build?: { id?: string; logUrl?: string } } };
    buildId = operation.metadata?.build?.id;
    logUrl = operation.metadata?.build?.logUrl;
  } catch (error) {
    return { ok: false, error: `Cloud Build create failed (${(error as Error).message ?? 'network error'})` };
  }

  if (!buildId) {
    return { ok: false, error: 'Cloud Build create returned no build id' };
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

  let build: {
    status?: string;
    logUrl?: string;
    results?: { images?: Array<{ name?: string; digest?: string }> };
  } = {};

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    try {
      const polled = await fetchImpl(`${base}/builds/${buildId}`, { headers: authHeaders });

      if (!polled.ok) {
        continue; // transient poll failure — the deadline bounds us
      }

      build = (await polled.json()) as typeof build;
    } catch {
      continue;
    }

    if (build.status && build.status !== status) {
      status = build.status;
      onLog('info', appPublicEnglish('APP_IMAGE_BUILD_STATUS', { buildId, status }));
    }

    if (status && TERMINAL_STATUSES.has(status)) {
      break;
    }
  }

  logUrl = build.logUrl ?? logUrl;

  if (status !== 'SUCCESS') {
    const suffix = TERMINAL_STATUSES.has(status) ? status : `still ${status} past deadline`;

    return { ok: false, error: `Image build ${suffix}${logUrl ? ` — logs: ${logUrl}` : ''}`, buildId, logUrl };
  }

  const digest = build.results?.images?.[0]?.digest;

  const imageSizeBytes = digest
    ? await fetchImageSizeBytes({ imageUri: spec.imageUri, digest, token, fetchImpl }).catch(() => undefined)
    : undefined;

  return { ok: true, imageUri: spec.imageUri, digest, imageSizeBytes, buildId, durationMs: Date.now() - startedAt };
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
