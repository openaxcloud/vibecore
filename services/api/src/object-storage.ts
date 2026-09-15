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

/**
 * Objects per GCS list page. 1 000 is the API's own default page size; it is a
 * PAGE size, never a total. Treating it as a total is AUDX-024.
 */
export const OBJECT_LIST_PAGE_SIZE = 1_000;

/**
 * Hard bound on pages walked by a full inventory, so a runaway bucket cannot
 * spin forever. Exceeding it THROWS rather than returning a short count — a
 * silently capped inventory is the very defect being fixed.
 */
export const OBJECT_LIST_MAX_PAGES = 10_000;

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

/*
 * Le seau d'un projet est créé À LA DEMANDE, pas à la création du projet. Toute
 * LECTURE arrivant avant cette création tombe donc sur un « The specified bucket
 * does not exist » brut du client GCS — une erreur sans type, que
 * `sendObjectStorageError` ne reconnaissait pas et relançait : Fastify répondait
 * alors 500 avec un corps VIDE.
 *
 * Constaté en production le 2026-08-30 sur un projet créé la minute d'avant :
 * `GET /projects/<id>/thumbnail` → 500, 0 octet. C'est aussi ce que décrit
 * BUG-QA-THUMBNAIL-500-001 (« 3 vignettes sur 6 renvoient 500 avec un corps
 * vide ») : les trois projets concernés étaient ceux qui n'avaient pas encore de
 * seau.
 *
 * On lui donne un TYPE plutôt que de le laisser remonter nu. L'absence de seau
 * n'est pas une panne : c'est « ce projet n'a encore rien stocké ». Les appelants
 * peuvent alors répondre comme pour un objet absent, au lieu d'un 500 muet.
 */
export const BUCKET_NOT_PROVISIONED = 'BUCKET_NOT_PROVISIONED';

/**
 * Reconnaît l'erreur « le seau n'existe pas » du client GCS.
 *
 * Le code 404 seul ne suffit pas : un OBJET absent le porte aussi, et les deux
 * situations n'appellent pas la même réponse. Le message est donc vérifié en
 * plus, et la comparaison est faite sur une forme normalisée pour ne pas dépendre
 * de la casse.
 */
export function isMissingBucketError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();

  return (code === 404 || code === '404') && message.includes('bucket does not exist');
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

  /*
   * AUDX-024 — set when GCS has more objects than this page carries. Pass it
   * back as `pageToken` to fetch the next page. Its ABSENCE is the only honest
   * way for a caller to know the listing is complete; before this existed, a
   * bucket with 2 500 objects returned a flat 1 000 with no marker, and a
   * truncated listing was indistinguishable from a complete one.
   */
  nextPageToken?: string;
}

/** Full-inventory result: every page walked, never truncated. */
export interface FullInventoryResult {
  objects: StoredObject[];
  totalBytes: number;
  /** Number of GCS list calls it took — non-zero proof the walk actually paged. */
  pages: number;
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

  /**
   * Whether THIS project's bucket already exists — the per-project "provisioned"
   * signal that lets the UI show an "Enable Object Storage" first-run CTA (bucket
   * missing) vs the live browser (bucket present), independent of the platform
   * feature flag.
   */
  bucketExists(projectId: string): Promise<boolean>;
  listObjects(
    projectId: string,
    opts?: { prefix?: string; delimiter?: string; pageToken?: string; pageSize?: number },
  ): Promise<ListObjectsResult>;

  /**
   * Every object under a prefix, all pages walked. Inventory, quota and metering
   * MUST use this rather than `listObjects`, whose single page silently stopped
   * at 1 000 objects (AUDX-024).
   */
  listAllObjects(projectId: string, opts?: { prefix?: string }): Promise<FullInventoryResult>;
  createUploadUrl(projectId: string, input: { key: string; contentType?: string }): Promise<UploadUrlResult>;
  createDownloadUrl(projectId: string, input: { key: string }): Promise<SignedUrlResult>;

  /**
   * Server-side direct write (bytes originate on the server, e.g. an automatic
   * headless screenshot). Unlike createUploadUrl this does not hand a signed URL
   * to a browser — it uploads the buffer straight into the project bucket.
   */
  putObject(
    projectId: string,
    input: { key: string; body: Uint8Array; contentType?: string },
  ): Promise<{ key: string; size: number }>;
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
  save(data: Uint8Array | Buffer | string, opts?: Record<string, unknown>): Promise<unknown>;
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

  async bucketExists(): Promise<boolean> {
    return false;
  }

  async listObjects(): Promise<ListObjectsResult> {
    return { objects: [], folders: [] };
  }

  async listAllObjects(): Promise<FullInventoryResult> {
    return { objects: [], totalBytes: 0, pages: 0 };
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

  async bucketExists(projectId: string): Promise<boolean> {
    const [exists] = await this._storage.bucket(projectBucketName(projectId)).exists();

    return exists;
  }

  /** Fetch ONE page and normalise it, exposing the continuation token. */
  private async _listPage(
    projectId: string,
    opts: { prefix?: string; delimiter?: string; pageToken?: string; pageSize?: number },
  ): Promise<ListObjectsResult> {
    const bucket = this._storage.bucket(projectBucketName(projectId));

    let files: Awaited<ReturnType<typeof bucket.getFiles>>[0];
    let nextQuery: Awaited<ReturnType<typeof bucket.getFiles>>[1];
    let apiResponse: Awaited<ReturnType<typeof bucket.getFiles>>[2];

    try {
      [files, nextQuery, apiResponse] = await bucket.getFiles({
        prefix: opts.prefix || undefined,
        delimiter: opts.delimiter || undefined,
        autoPaginate: false,
        maxResults: opts.pageSize ?? OBJECT_LIST_PAGE_SIZE,
        ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
      });
    } catch (error) {
      /*
       * Seau pas encore créé : on le DIT, au lieu de laisser une erreur GCS nue
       * remonter jusqu'à un 500 sans corps. Voir `isMissingBucketError`.
       */
      if (isMissingBucketError(error)) {
        throw new ObjectStorageError('This project has no object storage bucket yet', BUCKET_NOT_PROVISIONED);
      }

      throw error;
    }

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

    /*
     * AUDX-024 — with autoPaginate:false the SDK returns the query for the NEXT
     * page, or null when the listing is exhausted. That token is the whole
     * point: it is what distinguishes "this is everything" from "this is the
     * first 1 000". Without it, a truncated listing was indistinguishable from a
     * complete one, for every caller.
     */
    const token = (nextQuery as { pageToken?: string } | null | undefined)?.pageToken;

    return { objects, folders, ...(token ? { nextPageToken: token } : {}) };
  }

  async listObjects(
    projectId: string,
    opts: { prefix?: string; delimiter?: string; pageToken?: string; pageSize?: number } = {},
  ): Promise<ListObjectsResult> {
    return this._listPage(projectId, opts);
  }

  /**
   * Walk EVERY page. This is what an inventory, a quota check or a metering
   * sweep must use: `listObjects` deliberately returns one page, and reading a
   * page as if it were the whole bucket is exactly AUDX-024.
   *
   * Throws past OBJECT_LIST_MAX_PAGES instead of returning a short count — an
   * inventory that quietly stopped early would reintroduce the same defect with
   * a different number.
   */
  async listAllObjects(projectId: string, opts: { prefix?: string } = {}): Promise<FullInventoryResult> {
    const objects: StoredObject[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      const page: ListObjectsResult = await this._listPage(projectId, { prefix: opts.prefix, pageToken });
      objects.push(...page.objects);
      pageToken = page.nextPageToken;
      pages += 1;

      if (pages > OBJECT_LIST_MAX_PAGES) {
        throw new ObjectStorageError(
          `Object inventory exceeded ${OBJECT_LIST_MAX_PAGES} pages for project ${projectId}`,
          'INVENTORY_TOO_LARGE',
        );
      }
    } while (pageToken);

    return { objects, totalBytes: objects.reduce((sum, object) => sum + object.size, 0), pages };
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

  async putObject(
    projectId: string,
    input: { key: string; body: Uint8Array; contentType?: string },
  ): Promise<{ key: string; size: number }> {
    const key = assertValidObjectKey(input.key);
    const contentType = input.contentType || 'application/octet-stream';
    const body = Buffer.from(input.body);

    await this._storage.bucket(projectBucketName(projectId)).file(key).save(body, { contentType, resumable: false });

    return { key, size: body.byteLength };
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

  /**
   * Delete EVERY object under a prefix.
   *
   * AUDX-024 — this used to list a single 1 000-object page, delete those, and
   * return `{ deleted: true }`. A prefix holding 2 500 objects therefore left
   * 1 500 behind while reporting success: worse than a truncated listing,
   * because the caller believes the data is gone.
   *
   * `count` is incremented only AFTER a delete resolves, and a rejection
   * propagates — a partial delete must never be reported as a completed one.
   */
  async deletePrefix(projectId: string, input: { prefix: string }) {
    const prefix = assertValidObjectKey(input.prefix);
    const bucket = this._storage.bucket(projectBucketName(projectId));

    let deleted = 0;
    let pages = 0;

    /*
     * Re-listing from the start each round rather than following a page token:
     * the deletes mutate the very listing being walked, so a token captured
     * before the deletions can skip objects that shifted into an earlier page.
     */
    for (;;) {
      const page = await this._listPage(projectId, { prefix, pageSize: OBJECT_LIST_PAGE_SIZE });

      if (page.objects.length === 0) {
        break;
      }

      await Promise.all(
        page.objects.map(async (object) => {
          await bucket.file(object.key).delete();
          deleted += 1;
        }),
      );

      pages += 1;

      if (pages > OBJECT_LIST_MAX_PAGES) {
        throw new ObjectStorageError(
          `Prefix delete exceeded ${OBJECT_LIST_MAX_PAGES} pages for project ${projectId}`,
          'INVENTORY_TOO_LARGE',
        );
      }
    }

    return { deleted: true, count: deleted };
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
