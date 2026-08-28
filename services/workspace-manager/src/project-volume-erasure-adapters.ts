import { readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';

import { GoogleAuth, type AuthClient } from 'google-auth-library';
import { z } from 'zod';

import {
  ProjectVolumeErasureError,
  type ExactKubernetesDelete,
  type ExactProviderVolumeDelete,
  type ProjectPersistentVolume,
  type ProjectPersistentVolumeClaim,
  type ProjectStorageClass,
  type ProjectVolumeKubernetesAdapter,
  type ProjectVolumeProviderAdapter,
  type ProjectVolumeProviderResolver,
  type ProviderVolumeObservation,
} from './project-volume-erasure.js';

const SERVICE_ACCOUNT_DIRECTORY = '/var/run/secrets/kubernetes.io/serviceaccount';
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
const MAX_KUBERNETES_OBJECT_BYTES = 2 * 1024 * 1024;
const MAX_KUBERNETES_LIST_BYTES = 16 * 1024 * 1024;
const MAX_GCE_RESPONSE_BYTES = 1024 * 1024;
const GCE_PD_CSI_DRIVER = 'pd.csi.storage.gke.io';
const GCE_API_ORIGIN = 'https://compute.googleapis.com';

const metadataSchema = z
  .object({
    name: z.string().min(1),
    namespace: z.string().min(1).optional(),
    uid: z.string().min(1),
    resourceVersion: z.string().min(1),
    labels: z.record(z.string()).optional(),
    annotations: z.record(z.string()).optional(),
    finalizers: z.array(z.string()).optional(),
    deletionTimestamp: z.string().optional(),
  })
  .passthrough();

const pvcSchema = z
  .object({
    apiVersion: z.literal('v1'),
    kind: z.literal('PersistentVolumeClaim'),
    metadata: metadataSchema,
    spec: z
      .object({
        volumeName: z.string().optional(),
        storageClassName: z.string().optional(),
        accessModes: z.array(z.string()).optional(),
      })
      .passthrough(),
    status: z.object({ phase: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

const pvSchema = z
  .object({
    apiVersion: z.literal('v1'),
    kind: z.literal('PersistentVolume'),
    metadata: metadataSchema,
    spec: z
      .object({
        claimRef: z
          .object({ namespace: z.string().optional(), name: z.string().optional(), uid: z.string().optional() })
          .passthrough()
          .optional(),
        storageClassName: z.string().optional(),
        persistentVolumeReclaimPolicy: z.string().optional(),
        accessModes: z.array(z.string()).optional(),
        csi: z.object({ driver: z.string().optional(), volumeHandle: z.string().optional() }).passthrough().optional(),
      })
      .passthrough(),
    status: z.object({ phase: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

const storageClassSchema = z
  .object({
    apiVersion: z.literal('storage.k8s.io/v1'),
    kind: z.literal('StorageClass'),
    metadata: metadataSchema,
    provisioner: z.string().min(1),
    reclaimPolicy: z.string().optional(),
  })
  .passthrough();

const pvListSchema = z
  .object({
    apiVersion: z.literal('v1'),
    kind: z.literal('PersistentVolumeList'),
    metadata: z.object({ continue: z.string().optional() }).passthrough(),
    items: z.array(pvSchema),
  })
  .passthrough();

export async function collectProjectPersistentVolumePages(
  loadPage: (continuation: string | undefined) => Promise<{
    items: readonly ProjectPersistentVolume[];
    continuation?: string;
  }>,
): Promise<readonly ProjectPersistentVolume[]> {
  const volumes: ProjectPersistentVolume[] = [];
  let continuation: string | undefined;
  const seenContinuations = new Set<string>();
  for (;;) {
    const page = await loadPage(continuation);
    volumes.push(...page.items);
    continuation = page.continuation;
    if (!continuation) return volumes;
    if (seenContinuations.has(continuation)) {
      throw adapterError(
        'VOLUME_ERASURE_KUBERNETES_LIST_INCOMPLETE',
        'Kubernetes repeated a PV continuation token.',
        503,
      );
    }
    seenContinuations.add(continuation);
  }
}

function adapterError(code: string, message: string, statusCode = 502, cause?: unknown): ProjectVolumeErasureError {
  return new ProjectVolumeErasureError(code, message, statusCode, cause === undefined ? undefined : { cause });
}

async function withinDeadline<T>(operation: Promise<T>, timeoutMs: number, timeoutError: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(timeoutError()), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function encodedSegment(value: string): string {
  return encodeURIComponent(value);
}

interface KubernetesApiResponse {
  status: number;
  value?: unknown;
}

export interface InClusterProjectVolumeKubernetesAdapterOptions {
  host?: string;
  port?: number;
  tokenFile?: string;
  certificateAuthorityFile?: string;
  timeoutMs?: number;
}

/**
 * Direct in-cluster Kubernetes API adapter. Unlike `kubectl delete`, the DELETE
 * body carries both UID and resourceVersion preconditions, so a same-name
 * replacement cannot be erased. Service-account tokens are read per request to
 * honor projected-token rotation and are never embedded in errors/evidence.
 */
export class InClusterProjectVolumeKubernetesAdapter implements ProjectVolumeKubernetesAdapter {
  readonly #host: string;
  readonly #port: number;
  readonly #tokenFile: string;
  readonly #certificateAuthorityFile: string;
  readonly #timeoutMs: number;

  constructor(options: InClusterProjectVolumeKubernetesAdapterOptions = {}) {
    this.#host = options.host ?? process.env.KUBERNETES_SERVICE_HOST ?? '';
    this.#port =
      options.port ?? Number(process.env.KUBERNETES_SERVICE_PORT_HTTPS ?? process.env.KUBERNETES_SERVICE_PORT ?? '443');
    this.#tokenFile = options.tokenFile ?? `${SERVICE_ACCOUNT_DIRECTORY}/token`;
    this.#certificateAuthorityFile = options.certificateAuthorityFile ?? `${SERVICE_ACCOUNT_DIRECTORY}/ca.crt`;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    if (
      !this.#host ||
      /[\s/\\]/u.test(this.#host) ||
      !Number.isInteger(this.#port) ||
      this.#port < 1 ||
      this.#port > 65_535 ||
      !Number.isInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1
    ) {
      throw adapterError(
        'VOLUME_ERASURE_KUBERNETES_CONFIG_INVALID',
        'In-cluster Kubernetes configuration is invalid.',
        503,
      );
    }
  }

  async #request(method: 'GET' | 'DELETE', path: string, body?: unknown, maxBytes = MAX_KUBERNETES_OBJECT_BYTES) {
    const deadlineAt = Date.now() + this.#timeoutMs;
    const [token, certificateAuthority] = await withinDeadline(
      Promise.all([readFile(this.#tokenFile, 'utf8'), readFile(this.#certificateAuthorityFile)]),
      this.#timeoutMs,
      () => adapterError('VOLUME_ERASURE_KUBERNETES_TIMEOUT', 'Kubernetes request exceeded its deadline.', 503),
    ).catch((error: unknown) => {
      if (error instanceof ProjectVolumeErasureError) throw error;
      throw adapterError(
        'VOLUME_ERASURE_KUBERNETES_CREDENTIALS_UNAVAILABLE',
        'Kubernetes service-account credentials are unavailable.',
        503,
        error,
      );
    });

    if (!token.trim() || certificateAuthority.byteLength === 0) {
      throw adapterError(
        'VOLUME_ERASURE_KUBERNETES_CREDENTIALS_UNAVAILABLE',
        'Kubernetes service-account credentials are empty.',
        503,
      );
    }

    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw adapterError('VOLUME_ERASURE_KUBERNETES_TIMEOUT', 'Kubernetes request exceeded its deadline.', 503);
    }

    return new Promise<KubernetesApiResponse>((resolve, reject) => {
      const request = httpsRequest(
        {
          hostname: this.#host,
          port: this.#port,
          path,
          method,
          ca: certificateAuthority,
          rejectUnauthorized: true,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token.trim()}`,
            ...(payload
              ? {
                  'content-type': 'application/json',
                  'content-length': String(payload.byteLength),
                }
              : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];

          let byteLength = 0;

          response.on('data', (chunk: Buffer) => {
            byteLength += chunk.byteLength;

            if (byteLength > maxBytes) {
              request.destroy(
                adapterError('VOLUME_ERASURE_KUBERNETES_RESPONSE_TOO_LARGE', 'Kubernetes response is too large.'),
              );
              return;
            }

            chunks.push(chunk);
          });
          response.on('end', () => {
            const status = response.statusCode ?? 0;
            const bytes = Buffer.concat(chunks);

            let value: unknown;

            if (bytes.byteLength > 0) {
              try {
                value = JSON.parse(bytes.toString('utf8')) as unknown;
              } catch (error) {
                reject(
                  adapterError(
                    'VOLUME_ERASURE_KUBERNETES_RESPONSE_INVALID',
                    'Kubernetes returned invalid JSON.',
                    502,
                    error,
                  ),
                );
                return;
              }
            }

            resolve({ status, value });
          });
        },
      );
      const deadline = setTimeout(() => {
        request.destroy(
          adapterError('VOLUME_ERASURE_KUBERNETES_TIMEOUT', 'Kubernetes request exceeded its deadline.', 503),
        );
      }, remainingMs);
      deadline.unref();
      request.once('close', () => clearTimeout(deadline));
      request.on('error', (error) => {
        reject(
          error instanceof ProjectVolumeErasureError
            ? error
            : adapterError('VOLUME_ERASURE_KUBERNETES_UNAVAILABLE', 'Kubernetes API request failed.', 503, error),
        );
      });

      if (payload) {
        request.write(payload);
      }

      request.end();
    });
  }

  async #get<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
    const response = await this.#request('GET', path);

    if (response.status === 404) {
      return undefined;
    }

    if (response.status < 200 || response.status >= 300) {
      throw adapterError(
        'VOLUME_ERASURE_KUBERNETES_READ_FAILED',
        `Kubernetes read failed with HTTP ${response.status}.`,
        response.status === 401 || response.status === 403 ? 503 : 502,
      );
    }

    const parsed = schema.safeParse(response.value);

    if (!parsed.success) {
      throw adapterError('VOLUME_ERASURE_KUBERNETES_RESPONSE_INVALID', 'Kubernetes object shape is invalid.', 502);
    }

    return parsed.data;
  }

  async #delete(path: string, exact: ExactKubernetesDelete): Promise<void> {
    const response = await this.#request('DELETE', path, {
      apiVersion: 'v1',
      kind: 'DeleteOptions',
      gracePeriodSeconds: exact.gracePeriodSeconds,
      propagationPolicy: exact.propagationPolicy,
      preconditions: { uid: exact.uid, resourceVersion: exact.resourceVersion },
    });

    if (response.status === 404 || (response.status >= 200 && response.status < 300)) {
      return;
    }

    if (response.status === 409) {
      throw adapterError('VOLUME_ERASURE_KUBERNETES_CAS_CONFLICT', 'Kubernetes delete precondition failed.', 409);
    }

    throw adapterError(
      'VOLUME_ERASURE_KUBERNETES_DELETE_FAILED',
      `Kubernetes delete failed with HTTP ${response.status}.`,
      response.status === 401 || response.status === 403 ? 503 : 502,
    );
  }

  getPersistentVolumeClaim(namespace: string, name: string): Promise<ProjectPersistentVolumeClaim | undefined> {
    return this.#get(
      `/api/v1/namespaces/${encodedSegment(namespace)}/persistentvolumeclaims/${encodedSegment(name)}`,
      pvcSchema,
    );
  }

  getPersistentVolume(name: string): Promise<ProjectPersistentVolume | undefined> {
    return this.#get(`/api/v1/persistentvolumes/${encodedSegment(name)}`, pvSchema);
  }

  getStorageClass(name: string): Promise<ProjectStorageClass | undefined> {
    return this.#get(`/apis/storage.k8s.io/v1/storageclasses/${encodedSegment(name)}`, storageClassSchema);
  }

  async listPersistentVolumes(): Promise<readonly ProjectPersistentVolume[]> {
    return collectProjectPersistentVolumePages(async (continuation) => {
      const query = new URLSearchParams({ limit: '500' });

      if (continuation) {
        query.set('continue', continuation);
      }

      const response = await this.#request(
        'GET',
        `/api/v1/persistentvolumes?${query.toString()}`,
        undefined,
        MAX_KUBERNETES_LIST_BYTES,
      );

      if (response.status < 200 || response.status >= 300) {
        throw adapterError(
          'VOLUME_ERASURE_KUBERNETES_LIST_FAILED',
          `Kubernetes PV list failed with HTTP ${response.status}.`,
          response.status === 401 || response.status === 403 ? 503 : 502,
        );
      }

      const parsed = pvListSchema.safeParse(response.value);

      if (!parsed.success) {
        throw adapterError('VOLUME_ERASURE_KUBERNETES_RESPONSE_INVALID', 'Kubernetes PV list shape is invalid.', 502);
      }

      return { items: parsed.data.items, continuation: parsed.data.metadata.continue };
    });
  }

  deletePersistentVolumeClaim(namespace: string, name: string, exact: ExactKubernetesDelete): Promise<void> {
    return this.#delete(
      `/api/v1/namespaces/${encodedSegment(namespace)}/persistentvolumeclaims/${encodedSegment(name)}`,
      exact,
    );
  }

  deletePersistentVolume(name: string, exact: ExactKubernetesDelete): Promise<void> {
    return this.#delete(`/api/v1/persistentvolumes/${encodedSegment(name)}`, exact);
  }
}

export interface GoogleAccessTokenProvider {
  getAccessToken(): Promise<string>;
}

/** ADC works with GKE Workload Identity Federation without exporting a key. */
export class GoogleAdcVolumeErasureTokenProvider implements GoogleAccessTokenProvider {
  readonly #client: Promise<AuthClient>;

  constructor(auth: GoogleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })) {
    this.#client = auth.getClient();
  }

  async getAccessToken(): Promise<string> {
    const response = await (await this.#client).getAccessToken();
    const token = typeof response === 'string' ? response : response?.token;

    if (!token) {
      throw adapterError(
        'VOLUME_ERASURE_GCE_AUTH_UNAVAILABLE',
        'Application Default Credentials returned no token.',
        503,
      );
    }

    return token;
  }
}

export interface GcePersistentDiskHandle {
  project: string;
  locationKind: 'zones' | 'regions';
  location: string;
  disk: string;
}

const GCE_PROJECT_RE = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u;
const GCE_LOCATION_RE = /^[a-z][a-z0-9-]{1,62}$/u;
const GCE_DISK_RE = /^[a-z](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;

export function parseGcePersistentDiskHandle(volumeHandle: string): GcePersistentDiskHandle {
  const match = /^projects\/([^/]+)\/(zones|regions)\/([^/]+)\/disks\/([^/]+)$/u.exec(volumeHandle);
  const [, project, locationKind, location, disk] = match ?? [];

  if (
    !project ||
    !locationKind ||
    !location ||
    !disk ||
    !GCE_PROJECT_RE.test(project) ||
    !GCE_LOCATION_RE.test(location) ||
    !GCE_DISK_RE.test(disk)
  ) {
    throw adapterError('VOLUME_ERASURE_GCE_HANDLE_INVALID', 'GCE Persistent Disk volumeHandle is invalid.', 409);
  }

  return { project, locationKind: locationKind as 'zones' | 'regions', location, disk };
}

export interface GcePersistentDiskAdapterOptions {
  tokenProvider?: GoogleAccessTokenProvider;
  fetch?: typeof fetch;
  apiOrigin?: string;
  timeoutMs?: number;
  /** Explicit disk-hosting projects; an empty configured allow-list fails closed. */
  allowedProjects?: readonly string[];
}

/**
 * Real Compute Engine REST adapter for zonal and regional GKE PD CSI handles.
 * GCE exposes no resource-ID CAS delete: correctness therefore also requires
 * the caller's durable CSI-creation quiescence authority. Only privileged GCP
 * administrators able to bypass that control plane sit outside this boundary.
 */
export class GcePersistentDiskProviderAdapter implements ProjectVolumeProviderAdapter {
  readonly csiDriver = GCE_PD_CSI_DRIVER;
  readonly #tokenProvider: GoogleAccessTokenProvider;
  readonly #fetch: typeof fetch;
  readonly #apiOrigin: string;
  readonly #timeoutMs: number;
  readonly #allowedProjects?: ReadonlySet<string>;

  constructor(options: GcePersistentDiskAdapterOptions = {}) {
    this.#tokenProvider = options.tokenProvider ?? new GoogleAdcVolumeErasureTokenProvider();
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#apiOrigin = options.apiOrigin ?? GCE_API_ORIGIN;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#allowedProjects = options.allowedProjects ? new Set(options.allowedProjects) : undefined;

    if (
      this.#apiOrigin !== GCE_API_ORIGIN ||
      !Number.isInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1 ||
      (this.#allowedProjects !== undefined &&
        (this.#allowedProjects.size === 0 ||
          [...this.#allowedProjects].some((project) => !GCE_PROJECT_RE.test(project))))
    ) {
      throw adapterError('VOLUME_ERASURE_GCE_CONFIG_INVALID', 'GCE erasure adapter configuration is invalid.', 500);
    }
  }

  #assertAllowed(handle: GcePersistentDiskHandle): void {
    if (this.#allowedProjects && !this.#allowedProjects.has(handle.project)) {
      throw adapterError(
        'VOLUME_ERASURE_GCE_PROJECT_FORBIDDEN',
        'The disk project is outside the configured erasure boundary.',
        409,
      );
    }
  }

  #diskUrl(handle: GcePersistentDiskHandle): URL {
    return new URL(
      `/compute/v1/projects/${encodedSegment(handle.project)}/${handle.locationKind}/${encodedSegment(
        handle.location,
      )}/disks/${encodedSegment(handle.disk)}`,
      this.#apiOrigin,
    );
  }

  async #request(method: 'GET' | 'DELETE', url: URL): Promise<Response> {
    const deadlineAt = Date.now() + this.#timeoutMs;
    const token = await withinDeadline(this.#tokenProvider.getAccessToken(), this.#timeoutMs, () =>
      adapterError('VOLUME_ERASURE_GCE_TIMEOUT', 'Compute Engine request exceeded its deadline.', 503),
    );
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw adapterError('VOLUME_ERASURE_GCE_TIMEOUT', 'Compute Engine request exceeded its deadline.', 503);
    }

    return this.#fetch(url, {
      method,
      redirect: 'error',
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(remainingMs),
    }).catch((error: unknown) => {
      throw adapterError('VOLUME_ERASURE_GCE_UNAVAILABLE', 'Compute Engine API request failed.', 503, error);
    });
  }

  async inspect(volumeHandle: string): Promise<ProviderVolumeObservation> {
    const handle = parseGcePersistentDiskHandle(volumeHandle);
    this.#assertAllowed(handle);
    const response = await this.#request('GET', this.#diskUrl(handle));

    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return { exists: false };
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw adapterError(
        'VOLUME_ERASURE_GCE_INSPECT_FAILED',
        `Compute Engine disk read failed with HTTP ${response.status}.`,
        502,
      );
    }

    const contentLength = Number(response.headers.get('content-length') ?? '0');

    if (Number.isFinite(contentLength) && contentLength > MAX_GCE_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw adapterError('VOLUME_ERASURE_GCE_RESPONSE_TOO_LARGE', 'Compute Engine response is too large.', 502);
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength > MAX_GCE_RESPONSE_BYTES) {
      throw adapterError('VOLUME_ERASURE_GCE_RESPONSE_TOO_LARGE', 'Compute Engine response is too large.', 502);
    }

    let value: unknown;

    try {
      value = JSON.parse(bytes.toString('utf8')) as unknown;
    } catch (error) {
      throw adapterError('VOLUME_ERASURE_GCE_RESPONSE_INVALID', 'Compute Engine returned invalid JSON.', 502, error);
    }

    const parsed = z.object({ id: z.union([z.string().regex(/^\d+$/u), z.number().int().safe()]) }).safeParse(value);

    if (!parsed.success) {
      throw adapterError('VOLUME_ERASURE_GCE_RESPONSE_INVALID', 'Compute Engine disk identity is missing.', 502);
    }

    return { exists: true, resourceId: String(parsed.data.id) };
  }

  async deleteExact(input: ExactProviderVolumeDelete): Promise<void> {
    if (!/^\d+$/u.test(input.expectedResourceId) || !/^[a-f0-9-]{36}$/u.test(input.requestId)) {
      throw adapterError('VOLUME_ERASURE_GCE_DELETE_INPUT_INVALID', 'Exact GCE disk deletion input is invalid.', 400);
    }

    const handle = parseGcePersistentDiskHandle(input.volumeHandle);
    this.#assertAllowed(handle);
    const assertCreationQuiescence = async () => {
      try {
        await input.assertCreationQuiescence();
      } catch (error) {
        throw adapterError(
          'VOLUME_ERASURE_CREATION_QUIESCENCE_CAPABILITY_UNAVAILABLE',
          'Durable CSI creation quiescence is unavailable.',
          503,
          error,
        );
      }
    };
    await assertCreationQuiescence();
    const immediatelyBeforeDelete = await this.inspect(input.volumeHandle);
    if (!immediatelyBeforeDelete.exists) return;
    if (immediatelyBeforeDelete.resourceId !== input.expectedResourceId) {
      throw adapterError(
        'VOLUME_ERASURE_PROVIDER_VOLUME_REPLACED',
        'The GCE disk identity changed before deletion.',
        409,
      );
    }
    await assertCreationQuiescence();
    const url = this.#diskUrl(handle);
    url.searchParams.set('requestId', input.requestId);

    const response = await this.#request('DELETE', url);

    if (response.status === 404 || response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return;
    }

    await response.body?.cancel().catch(() => undefined);
    throw adapterError(
      'VOLUME_ERASURE_GCE_DELETE_FAILED',
      `Compute Engine disk delete failed with HTTP ${response.status}.`,
      502,
    );
  }
}

/** Resolver with an explicit empty default: unsupported CSI drivers fail closed. */
export class StaticProjectVolumeProviderResolver implements ProjectVolumeProviderResolver {
  readonly #adapters: ReadonlyMap<string, ProjectVolumeProviderAdapter>;

  constructor(adapters: readonly ProjectVolumeProviderAdapter[] = []) {
    const map = new Map<string, ProjectVolumeProviderAdapter>();

    for (const adapter of adapters) {
      if (map.has(adapter.csiDriver)) {
        throw adapterError('VOLUME_ERASURE_PROVIDER_ADAPTER_DUPLICATE', 'Duplicate CSI provider adapter.', 500);
      }

      map.set(adapter.csiDriver, adapter);
    }
    this.#adapters = map;
  }

  resolve(csiDriver: string): ProjectVolumeProviderAdapter | undefined {
    return this.#adapters.get(csiDriver);
  }
}
