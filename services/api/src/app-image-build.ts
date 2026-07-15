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

const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** Terminal Cloud Build statuses (anything else is still converging). */
const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']);

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
export async function runAppImageBuild(spec: AppImageBuildSpec, deps: AppImageBuildDeps = {}): Promise<AppImageBuildResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getAccessToken = deps.getAccessToken ?? (() => metadataAccessToken(fetchImpl));
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollIntervalMs = deps.pollIntervalMs ?? 5000;
  const onLog = deps.onLog ?? (() => undefined);
  const timeoutSeconds = spec.timeoutSeconds ?? 600;
  const startedAt = Date.now();

  const dockerfileB64 = Buffer.from(
    buildAppImageDockerfile({
      baseImage: spec.baseImage,
      buildCommand: spec.buildCommand,
      startCommand: spec.startCommand,
    }),
    'utf8',
  ).toString('base64');

  /*
   * One docker step: materialize the generated Dockerfile (base64 → file; the
   * alphabet is shell-safe inside single quotes) and build. The push happens via
   * `images` so Cloud Build records the digest in build.results.
   */
  const buildRequest = {
    source: { storageSource: { bucket: spec.sourceBucket, object: spec.sourceObject } },
    steps: [
      {
        name: 'gcr.io/cloud-builders/docker',
        entrypoint: 'sh',
        args: [
          '-c',
          `printf '%s' '${dockerfileB64}' | base64 -d > .ecode-app.Dockerfile && docker build -f .ecode-app.Dockerfile -t '${spec.imageUri}' .`,
        ],
      },
    ],
    images: [spec.imageUri],
    timeout: `${timeoutSeconds}s`,
    options: { logging: 'CLOUD_LOGGING_ONLY' },
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

  onLog('info', `[image] build ${buildId} queued (context gs://${spec.sourceBucket}/${spec.sourceObject})`);

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
      onLog('info', `[image] build ${buildId}: ${status}`);
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
