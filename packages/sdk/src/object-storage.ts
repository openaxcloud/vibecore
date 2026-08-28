/**
 * App-facing Object Storage client (Replit `@replit/object-storage` parity).
 *
 * A generated app running inside a VibeCore workspace imports this and gets a
 * ready-to-use client — the workspace injects `OBJECT_STORAGE_API_URL`,
 * `OBJECT_STORAGE_ACCESS_TOKEN`, and `PROJECT_ID`, so `new ObjectStorageClient()`
 * with no arguments just works. Bytes are uploaded/downloaded via short-lived V4
 * signed URLs (they never transit the API), exactly like the IDE panel.
 */

export interface StoredObject {
  key: string;
  size: number;
  updated: string | null;
  contentType: string | null;
  etag: string | null;
}

export interface ListObjectsResult {
  objects: StoredObject[];
  /** Folder prefixes when a delimiter is supplied (e.g. `src/`). */
  folders: string[];
}

export interface UploadUrl {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface DownloadUrl {
  url: string;
  expiresAt: string;
}

export interface ObjectStorageClientOptions {
  /** API base URL. Defaults to `OBJECT_STORAGE_API_URL`. */
  apiUrl?: string;
  /** Bearer access token. Defaults to `OBJECT_STORAGE_ACCESS_TOKEN`. */
  accessToken?: string;
  /** Project id. Defaults to `PROJECT_ID`. */
  projectId?: string;
  /** Injectable fetch (for tests / non-global-fetch runtimes). */
  fetch?: typeof fetch;
}

export class ObjectStorageError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ObjectStorageError';
  }
}

function envOf(name: string): string | undefined {
  // `process` may be absent in some runtimes; read defensively.
  return typeof process !== 'undefined' ? process.env?.[name] : undefined;
}

function mutationIdempotencyKey(provided?: string): string {
  if (provided && /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(provided)) return provided;
  if (provided) throw new Error('ObjectStorageClient: idempotencyKey must contain 16 to 128 safe characters.');
  return (
    globalThis.crypto?.randomUUID?.() ?? `object-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export class ObjectStorageClient {
  readonly #apiUrl: string;
  readonly #accessToken: string;
  readonly #projectId: string;
  readonly #fetch: typeof fetch;

  constructor(options: ObjectStorageClientOptions = {}) {
    const apiUrl = options.apiUrl ?? envOf('OBJECT_STORAGE_API_URL');
    const accessToken = options.accessToken ?? envOf('OBJECT_STORAGE_ACCESS_TOKEN');
    const projectId = options.projectId ?? envOf('PROJECT_ID');

    if (!apiUrl) {
      throw new Error('ObjectStorageClient: apiUrl is required (set OBJECT_STORAGE_API_URL or pass apiUrl).');
    }
    if (!accessToken) {
      throw new Error(
        'ObjectStorageClient: accessToken is required (set OBJECT_STORAGE_ACCESS_TOKEN or pass accessToken).',
      );
    }
    if (!projectId) {
      throw new Error('ObjectStorageClient: projectId is required (set PROJECT_ID or pass projectId).');
    }

    this.#apiUrl = apiUrl.replace(/\/+$/, '');
    this.#accessToken = accessToken;
    this.#projectId = projectId;
    this.#fetch = options.fetch ?? (globalThis.fetch as typeof fetch);

    if (!this.#fetch) {
      throw new Error('ObjectStorageClient: no fetch implementation available; pass options.fetch.');
    }
  }

  #base(): string {
    return `${this.#apiUrl}/projects/${encodeURIComponent(this.#projectId)}/object-storage`;
  }

  async #request<T>(path: string, init: RequestInit & { query?: Record<string, string | undefined> } = {}): Promise<T> {
    const { query, ...rest } = init;
    const search = query
      ? '?' +
        new URLSearchParams(
          Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
        ).toString()
      : '';

    const response = await this.#fetch(`${this.#base()}${path}${search}`, {
      ...rest,
      headers: {
        authorization: `Bearer ${this.#accessToken}`,
        ...(rest.body ? { 'content-type': 'application/json' } : {}),
        ...(rest.headers ?? {}),
      },
    });

    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      const body = (json ?? {}) as { error?: string; code?: string };
      throw new ObjectStorageError(
        body.error ?? `Request failed (${response.status})`,
        body.code ?? 'REQUEST_FAILED',
        response.status,
      );
    }

    return json as T;
  }

  /** Ensure this project's bucket exists. */
  ensureBucket(): Promise<{ bucket: string; created: boolean; location: string }> {
    return this.#request('/bucket', { method: 'POST', body: '{}' });
  }

  /** List objects, optionally under a prefix; pass `delimiter: '/'` for folders. */
  listObjects(opts: { prefix?: string; delimiter?: string } = {}): Promise<ListObjectsResult> {
    return this.#request('/objects', { method: 'GET', query: { prefix: opts.prefix, delimiter: opts.delimiter } });
  }

  /** Get a V4 signed PUT URL to upload an object (bytes bypass the API). */
  getUploadUrl(input: { key: string; contentType?: string }): Promise<UploadUrl> {
    return this.#request('/objects/upload-url', { method: 'POST', body: JSON.stringify(input) });
  }

  /** Get a V4 signed GET URL to download an object. */
  getDownloadUrl(input: { key: string }): Promise<DownloadUrl> {
    return this.#request('/objects/download-url', { method: 'GET', query: { key: input.key } });
  }

  /** Move/rename an object (copy + delete). */
  move(input: { from: string; to: string; idempotencyKey?: string }): Promise<{ moved: boolean; key: string }> {
    const { idempotencyKey, ...body } = input;
    return this.#request('/objects/move', {
      method: 'POST',
      headers: { 'idempotency-key': mutationIdempotencyKey(idempotencyKey) },
      body: JSON.stringify(body),
    });
  }

  /** Delete a single object. */
  delete(input: { key: string; idempotencyKey?: string }): Promise<{ deleted: boolean; count: number }> {
    return this.#request('/objects', {
      method: 'DELETE',
      headers: { 'idempotency-key': mutationIdempotencyKey(input.idempotencyKey) },
      body: JSON.stringify({ key: input.key }),
    });
  }

  /** Delete every object under a prefix (a "folder"). */
  deletePrefix(input: { prefix: string; idempotencyKey?: string }): Promise<{ deleted: boolean; count: number }> {
    return this.#request('/objects', {
      method: 'DELETE',
      headers: { 'idempotency-key': mutationIdempotencyKey(input.idempotencyKey) },
      body: JSON.stringify({ prefix: input.prefix }),
    });
  }

  /** Convenience: upload bytes by fetching the signed URL and PUTting to it. */
  async upload(input: { key: string; data: string | Uint8Array | ArrayBuffer; contentType?: string }): Promise<void> {
    const { url, headers } = await this.getUploadUrl({ key: input.key, contentType: input.contentType });
    const put = await this.#fetch(url, { method: 'PUT', headers, body: input.data });

    if (!put.ok) {
      throw new ObjectStorageError(`Upload failed (${put.status})`, 'UPLOAD_FAILED', put.status);
    }
  }

  /** Convenience: download an object's bytes via its signed URL. */
  async download(input: { key: string }): Promise<ArrayBuffer> {
    const { url } = await this.getDownloadUrl({ key: input.key });
    const get = await this.#fetch(url, { method: 'GET' });

    if (!get.ok) {
      throw new ObjectStorageError(`Download failed (${get.status})`, 'DOWNLOAD_FAILED', get.status);
    }

    return get.arrayBuffer();
  }
}
