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
import { createHash } from 'node:crypto';
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
 * Server-pinned key for a project's latest captured preview thumbnail (P11).
 * A single object per project, overwritten on each capture ("dernier état").
 * It lives OUTSIDE the `tmp/` prefix so the lifecycle rule never expires it.
 */
export const PROJECT_THUMBNAIL_KEY = 'thumbnails/preview.png';

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
  /** Immutable source generation used to pin a server-side clone. */
  generation: string | null;
  /** Provider checksum (md5 preferred, crc32c fallback); never object content. */
  contentHash: string | null;
}

export interface ObjectStorageInventoryEntry {
  key: string;
  size: number;
  generation: string | null;
  contentHash: string | null;
}

export interface ObjectStorageInventory {
  bucketExists: boolean;
  objects: ObjectStorageInventoryEntry[];
}

/** Validate the durable JSON boundary before using it as a physical-data authority. */
export function parseObjectStorageInventory(value: unknown): ObjectStorageInventory | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as { bucketExists?: unknown; objects?: unknown };
  if (typeof record.bucketExists !== 'boolean' || !Array.isArray(record.objects)) return undefined;

  const objects: ObjectStorageInventoryEntry[] = [];

  for (const raw of record.objects) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const object = raw as Record<string, unknown>;
    if (
      typeof object.key !== 'string' ||
      typeof object.size !== 'number' ||
      !(typeof object.generation === 'string' || object.generation === null) ||
      !(typeof object.contentHash === 'string' || object.contentHash === null)
    ) {
      return undefined;
    }
    objects.push({
      key: object.key,
      size: object.size,
      generation: object.generation,
      contentHash: object.contentHash,
    });
  }

  return { bucketExists: record.bucketExists, objects };
}

export interface ListObjectsResult {
  objects: StoredObject[];

  /** Folder prefixes (when a delimiter is supplied), e.g. `src/`. */
  folders: string[];
}

/** Render only the immutable objects consented in a stored share inventory. */
export function listPinnedInventoryObjects(
  inventory: ObjectStorageInventory,
  opts: { prefix?: string; delimiter?: string } = {},
): ListObjectsResult {
  const prefix = opts.prefix ?? '';
  const delimiter = opts.delimiter;
  const folders = new Set<string>();
  const objects: StoredObject[] = [];

  for (const object of inventory.objects) {
    if (!object.key.startsWith(prefix)) continue;
    const remainder = object.key.slice(prefix.length);
    const separatorAt = delimiter ? remainder.indexOf(delimiter) : -1;

    if (delimiter && separatorAt >= 0) {
      folders.add(prefix + remainder.slice(0, separatorAt + delimiter.length));
      continue;
    }

    objects.push({
      key: object.key,
      size: object.size,
      updated: null,
      contentType: null,
      etag: null,
      generation: object.generation,
      contentHash: object.contentHash,
    });
  }

  return {
    objects: objects.sort((left, right) => left.key.localeCompare(right.key)),
    folders: [...folders].sort(),
  };
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
  ensureBucket(
    projectId: string,
    guard?: () => Promise<void>,
  ): Promise<{ bucket: string; created: boolean; location: string }>;

  /**
   * Whether THIS project's bucket already exists — the per-project "provisioned"
   * signal that lets the UI show an "Enable Object Storage" first-run CTA (bucket
   * missing) vs the live browser (bucket present), independent of the platform
   * feature flag.
   */
  bucketExists(projectId: string): Promise<boolean>;
  /**
   * Live provider proof that immutable object generations survive a later
   * overwrite. Implementations that cannot inspect this state must omit the
   * method; recovery then fails closed instead of certifying ENSURE_BUCKET.
   */
  bucketVersioningEnabled?(projectId: string): Promise<boolean>;
  listObjects(projectId: string, opts?: { prefix?: string; delimiter?: string }): Promise<ListObjectsResult>;
  /** Exhaustive live + noncurrent generations; destructive prefix verification fails closed without it. */
  listObjectVersions?(projectId: string, opts?: { prefix?: string }): Promise<ListObjectsResult>;
  /** `expiresAt` is a durable DB-reserved upper bound; raw signers reject an omitted value. */
  createUploadUrl(
    projectId: string,
    input: { key: string; contentType?: string; expiresAt?: string },
  ): Promise<UploadUrlResult>;
  /** `expiresAt` is a durable DB-reserved upper bound; raw signers reject an omitted value. */
  createDownloadUrl(
    projectId: string,
    input: { key: string; generation?: string; expiresAt?: string },
  ): Promise<SignedUrlResult>;

  /**
   * Server-side direct write (bytes originate on the server, e.g. an automatic
   * headless screenshot). Unlike createUploadUrl this does not hand a signed URL
   * to a browser — it uploads the buffer straight into the project bucket.
   */
  putObject(
    projectId: string,
    input: {
      key: string;
      body: Uint8Array;
      contentType?: string;
      /** Provider generation CAS; 0 means create-only. */
      ifGenerationMatch?: string | 0;
    },
  ): Promise<{ key: string; size: number; generation?: string; contentHash?: string }>;
  moveObject(
    projectId: string,
    input: { from: string; to: string; sourceGeneration?: string },
    guard?: () => Promise<void>,
  ): Promise<{ moved: boolean; key: string; generation?: string }>;
  deleteObject(
    projectId: string,
    input: { key: string; generation?: string },
  ): Promise<{ deleted: boolean; count: number }>;
  deletePrefix(
    projectId: string,
    input: { prefix: string },
    guard?: () => Promise<void>,
  ): Promise<{ deleted: boolean; count: number }>;
  deleteBucket(projectId: string, guard?: () => Promise<void>): Promise<{ deleted: boolean; bucket: string }>;
  /** Complete, generation-pinned inventory for a physical-data remix. */
  inventoryProjectObjects(projectId: string): Promise<ObjectStorageInventory>;
  /** Server-side copy followed by an exact per-object checksum verification. */
  cloneProjectObjects(
    sourceProjectId: string,
    targetProjectId: string,
    inventory: ObjectStorageInventory,
    guard?: () => Promise<void>,
  ): Promise<ObjectStorageInventory>;
}

/* -------------------------------------------------------------------------- */
/* Minimal structural view of @google-cloud/storage, so the service logic is   */
/* fully unit-testable with a fake and the SDK stays at the edge (the adapter). */
/* -------------------------------------------------------------------------- */

export interface FileLike {
  name: string;
  metadata?: {
    size?: string | number;
    updated?: string;
    contentType?: string;
    etag?: string;
    generation?: string | number;
    md5Hash?: string;
    crc32c?: string;
    metadata?: Record<string, string | undefined>;
  };
  getMetadata?(): Promise<[NonNullable<FileLike['metadata']>]>;
  getSignedUrl(opts: Record<string, unknown>): Promise<[string]>;
  save(data: Uint8Array | Buffer | string, opts?: Record<string, unknown>): Promise<unknown>;
  copy(destination: FileLike, opts?: Record<string, unknown>): Promise<unknown>;
  delete(opts?: Record<string, unknown>): Promise<unknown>;
}

export interface BucketLike {
  exists(): Promise<[boolean]>;
  create(opts: Record<string, unknown>): Promise<unknown>;
  setMetadata(metadata: Record<string, unknown>): Promise<unknown>;
  getMetadata?(): Promise<[{ versioning?: { enabled?: boolean } }]>;
  getFiles(query: Record<string, unknown>): Promise<[FileLike[], unknown, { prefixes?: string[] } | undefined]>;
  file(name: string, opts?: { generation?: string | number }): FileLike;
  deleteFiles(opts: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface StorageLike {
  bucket(name: string): BucketLike;
}

/** Inert object storage: the default while the feature is off and in tests. */
export class NoopObjectStorage implements ObjectStorage {
  readonly active: boolean = false;

  async ensureBucket(projectId: string, _guard?: () => Promise<void>) {
    return { bucket: projectBucketName(projectId), created: false, location: OBJECT_STORAGE_LOCATION };
  }

  async bucketExists(): Promise<boolean> {
    return false;
  }

  async bucketVersioningEnabled(): Promise<boolean> {
    return false;
  }

  async listObjects(): Promise<ListObjectsResult> {
    return { objects: [], folders: [] };
  }

  async listObjectVersions(): Promise<ListObjectsResult> {
    return { objects: [], folders: [] };
  }

  async createUploadUrl(): Promise<UploadUrlResult> {
    throw new ObjectStorageError('Object storage is not enabled', 'FEATURE_NOT_ENABLED');
  }

  async createDownloadUrl(): Promise<SignedUrlResult> {
    throw new ObjectStorageError('Object storage is not enabled', 'FEATURE_NOT_ENABLED');
  }

  async putObject(): Promise<{ key: string; size: number }> {
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

  async deleteBucket(projectId: string, _guard?: () => Promise<void>) {
    return { deleted: false, bucket: projectBucketName(projectId) };
  }

  async inventoryProjectObjects(_projectId: string): Promise<ObjectStorageInventory> {
    return { bucketExists: false, objects: [] };
  }

  async cloneProjectObjects(
    _sourceProjectId: string,
    _targetProjectId: string,
    _inventory: ObjectStorageInventory,
    _guard?: () => Promise<void>,
  ): Promise<ObjectStorageInventory> {
    throw new ObjectStorageError('A real object-storage backend is required for a physical clone', 'BACKEND_REQUIRED');
  }
}

/** Real GCS-backed object storage. Bucket-per-project, V4 signed URLs. */
export class GcsObjectStorage implements ObjectStorage {
  readonly active = true;

  constructor(private readonly _storage: StorageLike) {}

  private async verifyBucketVersioning(bucket: BucketLike, guard?: () => Promise<void>): Promise<void> {
    /* The real GCS adapter always exposes getMetadata; bounded polling covers propagation. */
    if (!bucket.getMetadata) {
      throw new ObjectStorageError('Bucket object versioning cannot be inspected', 'VERSIONING_INSPECTION_REQUIRED');
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await guard?.();
      const [metadata] = await bucket.getMetadata();
      if (metadata.versioning?.enabled === true) return;
      if (attempt < 4) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw new ObjectStorageError('Bucket object versioning could not be verified', 'VERSIONING_REQUIRED');
  }

  async ensureBucket(projectId: string, guard?: () => Promise<void>) {
    const name = projectBucketName(projectId);
    const bucket = this._storage.bucket(name);
    const [exists] = await bucket.exists();

    if (exists) {
      await guard?.();
      await bucket.setMetadata({ versioning: { enabled: true } });
      await this.verifyBucketVersioning(bucket, guard);
      return { bucket: name, created: false, location: OBJECT_STORAGE_LOCATION };
    }

    // The provider existence read is not the mutation point. Revalidate the
    // durable owner after that read and immediately before bucket creation.
    await guard?.();
    await bucket.create({
      location: OBJECT_STORAGE_LOCATION,
      uniformBucketLevelAccess: true,
      versioning: { enabled: true },
      lifecycle: { rule: buildLifecycleRules() },
      labels: {
        'vibecore-project': projectId
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '')
          .slice(0, 63),
      },
    });
    await this.verifyBucketVersioning(bucket, guard);

    return { bucket: name, created: true, location: OBJECT_STORAGE_LOCATION };
  }

  async bucketExists(projectId: string): Promise<boolean> {
    const [exists] = await this._storage.bucket(projectBucketName(projectId)).exists();

    return exists;
  }

  async bucketVersioningEnabled(projectId: string): Promise<boolean> {
    const bucket = this._storage.bucket(projectBucketName(projectId));
    const [exists] = await bucket.exists();
    if (!exists || !bucket.getMetadata) return false;
    const [metadata] = await bucket.getMetadata();
    return metadata.versioning?.enabled === true;
  }

  async listObjects(projectId: string, opts: { prefix?: string; delimiter?: string } = {}) {
    const bucket = this._storage.bucket(projectBucketName(projectId));

    const [files, , apiResponse] = await bucket.getFiles({
      prefix: opts.prefix || undefined,
      delimiter: opts.delimiter || undefined,
      // A remix inventory must be exhaustive. The previous one-page/1000-object
      // browser listing is not a safe primitive for a physical clone.
      autoPaginate: true,
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
        generation: file.metadata?.generation === undefined ? null : String(file.metadata.generation),
        contentHash: file.metadata?.metadata?.['vibecore-sha256']
          ? `sha256:${file.metadata.metadata['vibecore-sha256']}`
          : file.metadata?.md5Hash
            ? `md5:${file.metadata.md5Hash}`
            : file.metadata?.crc32c
              ? `crc32c:${file.metadata.crc32c}`
              : null,
      }));

    const folders = (apiResponse?.prefixes ?? []).slice().sort();

    return { objects, folders };
  }

  async listObjectVersions(projectId: string, opts: { prefix?: string } = {}): Promise<ListObjectsResult> {
    const bucket = this._storage.bucket(projectBucketName(projectId));
    const [files] = await bucket.getFiles({
      prefix: opts.prefix || undefined,
      versions: true,
      autoPaginate: true,
    });
    const objects = files
      .map((file) => ({
        key: file.name,
        size: Number(file.metadata?.size ?? 0),
        updated: file.metadata?.updated ?? null,
        contentType: file.metadata?.contentType ?? null,
        etag: file.metadata?.etag ?? null,
        generation: file.metadata?.generation === undefined ? null : String(file.metadata.generation),
        contentHash: file.metadata?.metadata?.['vibecore-sha256']
          ? `sha256:${file.metadata.metadata['vibecore-sha256']}`
          : file.metadata?.md5Hash
            ? `md5:${file.metadata.md5Hash}`
            : file.metadata?.crc32c
              ? `crc32c:${file.metadata.crc32c}`
              : null,
      }))
      .sort(
        (left, right) =>
          left.key.localeCompare(right.key) || String(left.generation).localeCompare(String(right.generation)),
      );
    return { objects, folders: [] };
  }

  async createUploadUrl(
    projectId: string,
    input: { key: string; contentType?: string; expiresAt?: string },
  ): Promise<UploadUrlResult> {
    const key = assertValidObjectKey(input.key);
    const expiresMs = this.signedUrlExpiration(input.expiresAt);
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

  async createDownloadUrl(
    projectId: string,
    input: { key: string; generation?: string; expiresAt?: string },
  ): Promise<SignedUrlResult> {
    const key = assertValidObjectKey(input.key);
    const expiresMs = this.signedUrlExpiration(input.expiresAt);

    const [url] = await this._storage
      .bucket(projectBucketName(projectId))
      .file(key, input.generation ? { generation: input.generation } : undefined)
      .getSignedUrl({ version: 'v4', action: 'read', expires: expiresMs });

    return { url, expiresAt: new Date(expiresMs).toISOString() };
  }

  private signedUrlExpiration(expiresAt: string | undefined): number {
    const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
      throw new ObjectStorageError(
        'A future database-reserved signed URL expiration is required',
        'CAPABILITY_EXPIRY_REQUIRED',
      );
    }
    return expiresMs;
  }

  async putObject(
    projectId: string,
    input: {
      key: string;
      body: Uint8Array;
      contentType?: string;
      ifGenerationMatch?: string | 0;
    },
  ): Promise<{ key: string; size: number; generation?: string; contentHash?: string }> {
    const key = assertValidObjectKey(input.key);
    const contentType = input.contentType || 'application/octet-stream';
    const body = Buffer.from(input.body);
    const file = this._storage.bucket(projectBucketName(projectId)).file(key);

    const contentHash = `sha256:${createHash('sha256').update(body).digest('hex')}`;
    await file.save(body, {
      contentType,
      resumable: false,
      metadata: { 'vibecore-sha256': contentHash.slice('sha256:'.length) },
      ...(input.ifGenerationMatch !== undefined
        ? { preconditionOpts: { ifGenerationMatch: input.ifGenerationMatch } }
        : {}),
    });
    const metadata = file.getMetadata ? (await file.getMetadata())[0] : file.metadata;

    return {
      key,
      size: body.byteLength,
      ...(metadata?.generation ? { generation: String(metadata.generation) } : {}),
      contentHash,
    };
  }

  async moveObject(
    projectId: string,
    input: { from: string; to: string; sourceGeneration?: string },
    guard?: () => Promise<void>,
  ) {
    const from = assertValidObjectKey(input.from);
    const to = assertValidObjectKey(input.to);
    const bucket = this._storage.bucket(projectBucketName(projectId));
    const sourceProbe = bucket.file(from);
    const sourceMetadata = input.sourceGeneration
      ? undefined
      : sourceProbe.getMetadata
        ? (await sourceProbe.getMetadata())[0]
        : sourceProbe.metadata;
    const sourceGeneration =
      input.sourceGeneration ?? (sourceMetadata?.generation ? String(sourceMetadata.generation) : undefined);

    if (!sourceGeneration) {
      throw new ObjectStorageError('The source object has no immutable provider generation', 'SOURCE_UNPINNABLE');
    }
    /*
     * @google-cloud/storage does not apply a made-up
     * ifSourceGenerationMatch copy option. Pin the source URI itself to the
     * immutable generation; the only copy precondition belongs to the target.
     */
    const source = bucket.file(from, { generation: sourceGeneration });
    const target = bucket.file(to);

    await guard?.();
    await source.copy(target, {
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    await guard?.();
    await source.delete({ ifGenerationMatch: sourceGeneration });
    await guard?.();
    const targetMetadata = target.getMetadata ? (await target.getMetadata())[0] : target.metadata;

    return {
      moved: true,
      key: to,
      ...(targetMetadata?.generation ? { generation: String(targetMetadata.generation) } : {}),
    };
  }

  async deleteObject(projectId: string, input: { key: string; generation?: string }) {
    const key = assertValidObjectKey(input.key);
    try {
      await this._storage
        .bucket(projectBucketName(projectId))
        .file(key, input.generation ? { generation: input.generation } : undefined)
        .delete(input.generation ? { ifGenerationMatch: input.generation } : undefined);
      return { deleted: true, count: 1 };
    } catch (error) {
      /* Provider 404 is the exact idempotent target state: nothing was deleted. */
      if (error && typeof error === 'object' && 'code' in error && (error.code === 404 || error.code === '404')) {
        return { deleted: false, count: 0 };
      }
      throw error;
    }
  }

  async deletePrefix(projectId: string, input: { prefix: string }, guard?: () => Promise<void>) {
    const prefix = assertValidObjectKey(input.prefix);
    const bucket = this._storage.bucket(projectBucketName(projectId));
    let count = 0;

    /*
     * A single maxResults=1000 page left every later object behind. Re-read the
     * first page after deleting it instead of advancing a page token over a
     * mutating listing; the loop terminates only from a live empty page.
     */
    while (true) {
      await guard?.();
      const [files] = await bucket.getFiles({
        prefix,
        versions: true,
        autoPaginate: false,
        maxResults: 1000,
      });

      if (files.length === 0) break;
      const pinned = files.map((file) => {
        const generation = file.metadata?.generation;
        if (generation === undefined || generation === null || String(generation).length === 0) {
          throw new ObjectStorageError(
            'Object generation history cannot be pinned for deletion',
            'GENERATION_INSPECTION_REQUIRED',
          );
        }
        return { key: file.name, generation: String(generation) };
      });
      await guard?.();
      await Promise.all(
        pinned.map(async (file) => {
          try {
            await bucket.file(file.key, { generation: file.generation }).delete({ ifGenerationMatch: file.generation });
          } catch (error) {
            if (
              !error ||
              typeof error !== 'object' ||
              !('code' in error) ||
              (error.code !== 404 && error.code !== '404')
            ) {
              throw error;
            }
          }
        }),
      );
      count += pinned.length;
      await guard?.();
    }

    return { deleted: true, count };
  }

  async deleteBucket(projectId: string, guard?: () => Promise<void>) {
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
    await guard?.();
    await bucket.deleteFiles({ force: true, versions: true });
    await guard?.();
    await bucket.delete();

    return { deleted: true, bucket: name };
  }

  async inventoryProjectObjects(projectId: string): Promise<ObjectStorageInventory> {
    if (!(await this.bucketExists(projectId))) {
      return { bucketExists: false, objects: [] };
    }

    const { objects } = await this.listObjects(projectId);

    return {
      bucketExists: true,
      objects: objects
        .map((object) => ({
          key: object.key,
          size: object.size,
          generation: object.generation,
          contentHash: object.contentHash,
        }))
        .sort((left, right) => left.key.localeCompare(right.key)),
    };
  }

  async cloneProjectObjects(
    sourceProjectId: string,
    targetProjectId: string,
    inventory: ObjectStorageInventory,
    guard?: () => Promise<void>,
  ): Promise<ObjectStorageInventory> {
    if (!inventory.bucketExists) {
      return { bucketExists: false, objects: [] };
    }

    if (inventory.objects.some((object) => object.generation === null || object.contentHash === null)) {
      throw new ObjectStorageError('A source object has no immutable generation and checksum', 'SOURCE_UNPINNABLE');
    }

    await this.ensureBucket(targetProjectId, guard);
    const source = this._storage.bucket(projectBucketName(sourceProjectId));
    const target = this._storage.bucket(projectBucketName(targetProjectId));

    for (const object of inventory.objects) {
      await guard?.();
      const sourceFile = source.file(object.key, { generation: object.generation! });
      await sourceFile.copy(target.file(object.key), {
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    }

    await guard?.();
    const verified = await this.inventoryProjectObjects(targetProjectId);
    const expected = inventory.objects.map(({ key, size, contentHash }) => ({ key, size, contentHash }));
    const actual = verified.objects.map(({ key, size, contentHash }) => ({ key, size, contentHash }));

    if (
      expected.length !== actual.length ||
      expected.some((entry, index) => {
        const copied = actual[index];

        return (
          !copied ||
          entry.key !== copied.key ||
          entry.size !== copied.size ||
          (entry.contentHash !== null && entry.contentHash !== copied.contentHash)
        );
      })
    ) {
      throw new ObjectStorageError('Physical object clone verification failed', 'CLONE_VERIFICATION_FAILED');
    }

    return verified;
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
