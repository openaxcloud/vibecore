/**
 * Replit-parity per-project Object Storage backed by Google Cloud Storage.
 *
 * Each project gets its own GCS bucket (deterministic name `vc-<projectId>`),
 * isolated by IAM + bucket boundary. Auth is Application Default Credentials,
 * which on GKE resolves through the api pod's Workload Identity service account —
 * no key files. Uploads/downloads use V4 signed URLs so bytes never transit the
 * api pod. A lifecycle rule auto-expires the `tmp/` prefix.
 *
 * DORMANT until OBJECT_STORAGE_ENABLED=true (mirrors DB_ROLLBACK_ENABLED). While
 * off, `resolveDefaultObjectStorage()` returns an inert service and every route
 * 404s, so this has zero effect on live traffic until the feature ships.
 */
import { Storage } from '@google-cloud/storage';

/** Master kill-switch. Until this is `true` no object-storage endpoint does anything. */
export function isObjectStorageEnabled(): boolean {
  return process.env.OBJECT_STORAGE_ENABLED === 'true';
}

/** GCS location for new project buckets (region or multi-region). */
export const OBJECT_STORAGE_LOCATION = process.env.OBJECT_STORAGE_LOCATION?.trim() || 'EU';

/** Signed-URL validity window. */
export const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

/** Days after which objects under the `tmp/` prefix are auto-deleted. */
export const TMP_LIFECYCLE_DAYS = Number(process.env.OBJECT_STORAGE_TMP_TTL_DAYS) || 7;

/**
 * Deterministic per-project bucket name. GCS bucket names must be 3–63 chars,
 * lowercase letters/digits/hyphens, and start/end alphanumeric.
 */
export function projectBucketName(
  projectId: string,
  prefix = process.env.OBJECT_STORAGE_BUCKET_PREFIX?.trim() || 'vc',
): string {
  const id = projectId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = `${prefix}-${id}`.slice(0, 63);

  return name.replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9]+$/, '');
}

/** Lifecycle rule set applied at bucket creation: expire `tmp/` objects. */
export function buildLifecycleRules(tmpTtlDays = TMP_LIFECYCLE_DAYS): Array<Record<string, unknown>> {
  return [{ action: { type: 'Delete' }, condition: { age: Math.max(1, tmpTtlDays), matchesPrefix: ['tmp/'] } }];
}

/**
 * Validate an object key: relative, no traversal, no leading slash, bounded
 * length. Throws on a bad key so a caller can never escape the project bucket.
 */
export function assertValidObjectKey(key: string): string {
  const trimmed = (key ?? '').trim();

  if (!trimmed) {
    throw new ObjectStorageError('Object key is required', 'INVALID_KEY');
  }

  if (trimmed.length > 1024) {
    throw new ObjectStorageError('Object key too long (max 1024)', 'INVALID_KEY');
  }

  if (trimmed.startsWith('/')) {
    throw new ObjectStorageError('Object key must be relative (no leading slash)', 'INVALID_KEY');
  }

  if (trimmed.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new ObjectStorageError('Object key must not contain path traversal segments', 'INVALID_KEY');
  }

  return trimmed;
}

export class ObjectStorageError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ObjectStorageError';
  }
}

export interface StoredObject {
  key: string;
  size: number;
  updated: string | null;
  contentType: string | null;
  etag: string | null;
}

export interface ListObjectsResult {
  objects: StoredObject[];

  /** Folder prefixes (when a delimiter is supplied), e.g. `src/`. */
  folders: string[];
}

export interface SignedUrlResult {
  url: string;
  expiresAt: string;
}

export interface UploadUrlResult extends SignedUrlResult {
  method: 'PUT';
  headers: Record<string, string>;
}

export interface ObjectStorage {
  /** Whether the service is wired to a real backend (false = inert/disabled). */
  readonly active: boolean;
  ensureBucket(projectId: string): Promise<{ bucket: string; created: boolean; location: string }>;
  listObjects(projectId: string, opts?: { prefix?: string; delimiter?: string }): Promise<ListObjectsResult>;
  createUploadUrl(projectId: string, input: { key: string; contentType?: string }): Promise<UploadUrlResult>;
  createDownloadUrl(projectId: string, input: { key: string }): Promise<SignedUrlResult>;
  moveObject(projectId: string, input: { from: string; to: string }): Promise<{ moved: boolean; key: string }>;
  deleteObject(projectId: string, input: { key: string }): Promise<{ deleted: boolean; count: number }>;
  deletePrefix(projectId: string, input: { prefix: string }): Promise<{ deleted: boolean; count: number }>;
  deleteBucket(projectId: string): Promise<{ deleted: boolean; bucket: string }>;
}

/* -------------------------------------------------------------------------- */
/* Minimal structural view of @google-cloud/storage, so the service logic is   */
/* fully unit-testable with a fake and the SDK stays at the edge (the adapter). */
/* -------------------------------------------------------------------------- */

export interface FileLike {
  name: string;
  metadata?: { size?: string | number; updated?: string; contentType?: string; etag?: string };
  getSignedUrl(opts: Record<string, unknown>): Promise<[string]>;
  copy(destination: FileLike): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface BucketLike {
  exists(): Promise<[boolean]>;
  create(opts: Record<string, unknown>): Promise<unknown>;
  setMetadata(metadata: Record<string, unknown>): Promise<unknown>;
  getFiles(query: Record<string, unknown>): Promise<[FileLike[], unknown, { prefixes?: string[] } | undefined]>;
  file(name: string): FileLike;
  deleteFiles(opts: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface StorageLike {
  bucket(name: string): BucketLike;
}

/** Inert object storage: the default while the feature is off and in tests. */
export class NoopObjectStorage implements ObjectStorage {
  readonly active = false;

  async ensureBucket(projectId: string) {
    return { bucket: projectBucketName(projectId), created: false, location: OBJECT_STORAGE_LOCATION };
  }

  async listObjects(): Promise<ListObjectsResult> {
    return { objects: [], folders: [] };
  }

  async createUploadUrl(): Promise<UploadUrlResult> {
    throw new ObjectStorageError('Object storage is not enabled', 'FEATURE_NOT_ENABLED');
  }

  async createDownloadUrl(): Promise<SignedUrlResult> {
    throw new ObjectStorageError('Object storage is not enabled', 'FEATURE_NOT_ENABLED');
  }

  async moveObject(_projectId: string, input: { from: string; to: string }) {
    return { moved: false, key: input.to };
  }

  async deleteObject() {
    return { deleted: false, count: 0 };
  }

  async deletePrefix() {
    return { deleted: false, count: 0 };
  }

  async deleteBucket(projectId: string) {
    return { deleted: false, bucket: projectBucketName(projectId) };
  }
}

/** Real GCS-backed object storage. Bucket-per-project, V4 signed URLs. */
export class GcsObjectStorage implements ObjectStorage {
  readonly active = true;

  constructor(private readonly _storage: StorageLike) {}

  async ensureBucket(projectId: string) {
    const name = projectBucketName(projectId);
    const bucket = this._storage.bucket(name);
    const [exists] = await bucket.exists();

    if (exists) {
      return { bucket: name, created: false, location: OBJECT_STORAGE_LOCATION };
    }

    await bucket.create({
      location: OBJECT_STORAGE_LOCATION,
      uniformBucketLevelAccess: true,
      lifecycle: { rule: buildLifecycleRules() },
      labels: {
        'vibecore-project': projectId
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '')
          .slice(0, 63),
      },
    });

    return { bucket: name, created: true, location: OBJECT_STORAGE_LOCATION };
  }

  async listObjects(projectId: string, opts: { prefix?: string; delimiter?: string } = {}) {
    const bucket = this._storage.bucket(projectBucketName(projectId));

    const [files, , apiResponse] = await bucket.getFiles({
      prefix: opts.prefix || undefined,
      delimiter: opts.delimiter || undefined,
      autoPaginate: false,
      maxResults: 1000,
    });

    const objects: StoredObject[] = files
      // when a delimiter is set, the prefix "directory placeholder" can echo back — skip it
      .filter((file) => !(opts.delimiter && file.name === opts.prefix))
      .map((file) => ({
        key: file.name,
        size: Number(file.metadata?.size ?? 0),
        updated: file.metadata?.updated ?? null,
        contentType: file.metadata?.contentType ?? null,
        etag: file.metadata?.etag ?? null,
      }));

    const folders = (apiResponse?.prefixes ?? []).slice().sort();

    return { objects, folders };
  }

  async createUploadUrl(projectId: string, input: { key: string; contentType?: string }): Promise<UploadUrlResult> {
    const key = assertValidObjectKey(input.key);
    const expiresMs = Date.now() + SIGNED_URL_TTL_MS;
    const contentType = input.contentType || 'application/octet-stream';

    const [url] = await this._storage
      .bucket(projectBucketName(projectId))
      .file(key)
      .getSignedUrl({ version: 'v4', action: 'write', expires: expiresMs, contentType });

    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(expiresMs).toISOString(),
    };
  }

  async createDownloadUrl(projectId: string, input: { key: string }): Promise<SignedUrlResult> {
    const key = assertValidObjectKey(input.key);
    const expiresMs = Date.now() + SIGNED_URL_TTL_MS;

    const [url] = await this._storage
      .bucket(projectBucketName(projectId))
      .file(key)
      .getSignedUrl({ version: 'v4', action: 'read', expires: expiresMs });

    return { url, expiresAt: new Date(expiresMs).toISOString() };
  }

  async moveObject(projectId: string, input: { from: string; to: string }) {
    const from = assertValidObjectKey(input.from);
    const to = assertValidObjectKey(input.to);
    const bucket = this._storage.bucket(projectBucketName(projectId));

    await bucket.file(from).copy(bucket.file(to));
    await bucket.file(from).delete();

    return { moved: true, key: to };
  }

  async deleteObject(projectId: string, input: { key: string }) {
    const key = assertValidObjectKey(input.key);

    await this._storage.bucket(projectBucketName(projectId)).file(key).delete();

    return { deleted: true, count: 1 };
  }

  async deletePrefix(projectId: string, input: { prefix: string }) {
    const prefix = assertValidObjectKey(input.prefix);
    const bucket = this._storage.bucket(projectBucketName(projectId));
    const [files] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 1000 });

    await Promise.all(files.map((file) => bucket.file(file.name).delete()));

    return { deleted: true, count: files.length };
  }

  async deleteBucket(projectId: string) {
    const name = projectBucketName(projectId);
    const bucket = this._storage.bucket(name);
    const [exists] = await bucket.exists();

    if (!exists) {
      return { deleted: false, bucket: name };
    }

    /*
     * GCS refuses to delete a non-empty bucket, so purge objects first (force
     * ignores per-object failures), then remove the bucket itself.
     */
    await bucket.deleteFiles({ force: true });
    await bucket.delete();

    return { deleted: true, bucket: name };
  }
}

let cachedStorage: ObjectStorage | undefined;

/**
 * Resolve the process-wide object storage. Inert unless OBJECT_STORAGE_ENABLED
 * is `true`; the GCS client is required lazily so the SDK only loads when used.
 */
export function resolveDefaultObjectStorage(): ObjectStorage {
  if (!isObjectStorageEnabled()) {
    return new NoopObjectStorage();
  }

  if (cachedStorage) {
    return cachedStorage;
  }

  /*
   * The Storage ctor performs no I/O; credentials (the api pod's Workload
   * Identity, via ADC) are resolved lazily on the first GCS call.
   */
  cachedStorage = new GcsObjectStorage(new Storage() as unknown as StorageLike);

  return cachedStorage;
}

/** Test-only: reset the memoized storage between cases. */
export function __resetObjectStorageForTests(): void {
  cachedStorage = undefined;
}
