import { describe, expect, it, vi } from 'vitest';

import {
  GcsObjectStorage,
  OBJECT_UPLOAD_MAX_BYTES,
  NoopObjectStorage,
  ObjectStorageError,
  assertValidObjectKey,
  buildLifecycleRules,
  projectBucketName,
  type BucketLike,
  type FileLike,
  type StorageLike,
  isMissingBucketError,
} from './object-storage.js';

/* ---------------------------- in-memory fake GCS ---------------------------- */

interface FakeObject {
  name: string;
  size: number;
  updated: string;
  contentType: string;
  etag: string;
}

class FakeStorage implements StorageLike {
  readonly buckets = new Map<string, Map<string, FakeObject>>();
  readonly created: Array<{ name: string; opts: Record<string, unknown> }> = [];
  readonly signed: Array<Record<string, unknown>> = [];
  readonly listCalls: Array<{ prefix: string; maxResults: unknown; pageToken: unknown }> = [];

  seed(bucketName: string, keys: string[]) {
    const map = this.buckets.get(bucketName) ?? new Map<string, FakeObject>();

    for (const key of keys) {
      map.set(key, { name: key, size: 10, updated: '2026-06-29T00:00:00.000Z', contentType: 'text/plain', etag: 'e' });
    }

    this.buckets.set(bucketName, map);
  }

  bucket(name: string): BucketLike {
    const self = this;

    const ensureMap = () => {
      const existing = self.buckets.get(name);

      if (existing) {
        return existing;
      }

      const map = new Map<string, FakeObject>();
      self.buckets.set(name, map);

      return map;
    };

    return {
      async exists() {
        return [self.buckets.has(name)] as [boolean];
      },
      async create(opts: Record<string, unknown>) {
        self.created.push({ name, opts });
        ensureMap();

        return undefined;
      },
      async setMetadata() {
        return undefined;
      },
      /*
       * Models the REAL GCS contract, which the previous fake did not: it
       * ignored `maxResults` and returned every object, so a caller capped at
       * one page looked complete and the 1 000-object truncation was invisible
       * to the whole suite. With `autoPaginate: false`, GCS returns at most
       * `maxResults` files plus a `nextQuery` to fetch the following page, and
       * `null` once exhausted.
       */
      async getFiles(query: Record<string, unknown>) {
        const map = self.buckets.get(name) ?? new Map<string, FakeObject>();
        const prefix = (query.prefix as string) || '';
        const delimiter = query.delimiter as string | undefined;
        const matched = [...map.values()]
          .filter((object) => object.name.startsWith(prefix))
          .sort((a, b) => a.name.localeCompare(b.name));
        const prefixes = new Set<string>();
        const collected: FakeObject[] = [];

        for (const object of matched) {
          if (delimiter) {
            const rest = object.name.slice(prefix.length);
            const idx = rest.indexOf(delimiter);

            if (idx >= 0) {
              prefixes.add(prefix + rest.slice(0, idx + 1));
              continue;
            }
          }

          collected.push(object);
        }

        self.listCalls.push({ prefix, maxResults: query.maxResults, pageToken: query.pageToken });

        const pageToken = query.pageToken as string | undefined;
        const start = pageToken ? collected.findIndex((object) => object.name === pageToken) : 0;
        const from = start < 0 ? 0 : start;
        const limit = typeof query.maxResults === 'number' ? query.maxResults : collected.length;
        const page = collected.slice(from, from + limit);
        const next = from + limit < collected.length ? collected[from + limit].name : undefined;

        const files: FileLike[] = page.map((object) => self._file(name, object.name));
        const nextQuery = next && query.autoPaginate === false ? { ...query, pageToken: next } : null;

        return [files, nextQuery, { prefixes: [...prefixes] }] as [
          FileLike[],
          unknown,
          { prefixes?: string[] },
        ];
      },
      file(fileName: string) {
        return self._file(name, fileName);
      },
      async deleteFiles() {
        self.buckets.set(name, new Map());

        return undefined;
      },
      async delete() {
        self.buckets.delete(name);

        return undefined;
      },
    };
  }

  private _file(bucketName: string, fileName: string): FileLike {
    const self = this;

    return {
      name: fileName,
      metadata: self.buckets.get(bucketName)?.get(fileName)
        ? {
            size: self.buckets.get(bucketName)!.get(fileName)!.size,
            updated: self.buckets.get(bucketName)!.get(fileName)!.updated,
            contentType: self.buckets.get(bucketName)!.get(fileName)!.contentType,
            etag: self.buckets.get(bucketName)!.get(fileName)!.etag,
          }
        : undefined,
      async getSignedUrl(opts: Record<string, unknown>) {
        self.signed.push({ bucket: bucketName, file: fileName, ...opts });

        return [`https://signed.example/${bucketName}/${fileName}?action=${String(opts.action)}`] as [string];
      },
      async save(data: Uint8Array | Buffer | string, opts?: Record<string, unknown>) {
        const map = self.buckets.get(bucketName) ?? new Map<string, FakeObject>();
        const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;

        map.set(fileName, {
          name: fileName,
          size,
          updated: '2026-06-29T00:00:00.000Z',
          contentType: (opts?.contentType as string | undefined) ?? 'application/octet-stream',
          etag: 'e',
        });
        self.buckets.set(bucketName, map);

        return undefined;
      },
      async copy(destination: FileLike) {
        const map = self.buckets.get(bucketName);
        const source = map?.get(fileName);

        if (map && source) {
          map.set(destination.name, { ...source, name: destination.name });
        }

        return undefined;
      },
      async delete() {
        self.buckets.get(bucketName)?.delete(fileName);

        return undefined;
      },
    };
  }
}

/** Wraps a FakeStorage so one object refuses deletion, like a real IAM denial. */
class ThrowingDeleteStorage implements StorageLike {
  constructor(
    private readonly inner: FakeStorage,
    private readonly failingKey: string,
  ) {}

  get buckets() {
    return this.inner.buckets;
  }

  bucket(name: string): BucketLike {
    const real = this.inner.bucket(name);
    const failingKey = this.failingKey;

    return {
      ...real,
      file: (fileName: string): FileLike => {
        const file = real.file(fileName);

        if (fileName !== failingKey) {
          return file;
        }

        return {
          ...file,
          async delete() {
            throw new Error('permission denied');
          },
        };
      },
    };
  }
}

/* --------------------------------- tests ---------------------------------- */

describe('projectBucketName', () => {
  it('derives a deterministic, GCS-valid name', () => {
    expect(projectBucketName('cmQ_un-mv1B')).toBe('vc-cmqunmv1b');
  });

  it('honours a custom prefix and stays within 63 chars', () => {
    const name = projectBucketName('a'.repeat(80), 'pre');
    expect(name.length).toBeLessThanOrEqual(63);
    expect(name.startsWith('pre-')).toBe(true);
  });

  it('never ends on a hyphen', () => {
    expect(projectBucketName('x', 'vc').endsWith('-')).toBe(false);
  });
});

describe('buildLifecycleRules', () => {
  it('expires the tmp/ prefix', () => {
    const [rule] = buildLifecycleRules(3);
    expect(rule).toEqual({ action: { type: 'Delete' }, condition: { age: 3, matchesPrefix: ['tmp/'] } });
  });
});

describe('assertValidObjectKey', () => {
  it('accepts a normal nested key', () => {
    expect(assertValidObjectKey('src/index.ts')).toBe('src/index.ts');
  });

  it.each(['/abs', '../escape', 'a/../b', './x', '', '   '])('rejects %p', (bad) => {
    expect(() => assertValidObjectKey(bad)).toThrow(ObjectStorageError);
  });
});

describe('NoopObjectStorage', () => {
  it('is inert', async () => {
    const svc = new NoopObjectStorage();
    expect(svc.active).toBe(false);
    expect(await svc.listObjects()).toEqual({ objects: [], folders: [] });
    await expect(svc.createUploadUrl()).rejects.toThrow(ObjectStorageError);
  });
});

describe('GcsObjectStorage', () => {
  const projectId = 'proj1';
  const bucket = projectBucketName(projectId);

  it('ensureBucket creates with lifecycle + uniform access, idempotently', async () => {
    const storage = new FakeStorage();
    const svc = new GcsObjectStorage(storage);

    const first = await svc.ensureBucket(projectId);
    expect(first).toMatchObject({ bucket, created: true });
    expect(storage.created[0].opts.uniformBucketLevelAccess).toBe(true);
    expect((storage.created[0].opts.lifecycle as { rule: unknown[] }).rule).toEqual(buildLifecycleRules());

    const second = await svc.ensureBucket(projectId);
    expect(second.created).toBe(false);
    expect(storage.created).toHaveLength(1);
  });

  it('bucketExists reflects whether the project bucket has been provisioned', async () => {
    const storage = new FakeStorage();
    const svc = new GcsObjectStorage(storage);

    expect(await svc.bucketExists(projectId)).toBe(false);

    await svc.ensureBucket(projectId);
    expect(await svc.bucketExists(projectId)).toBe(true);
  });

  it('listObjects splits files and folders by delimiter', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['readme.md', 'src/index.ts', 'src/util/x.ts', 'tmp/scratch']);

    const svc = new GcsObjectStorage(storage);

    const result = await svc.listObjects(projectId, { delimiter: '/' });
    expect(result.objects.map((object) => object.key)).toEqual(['readme.md']);
    expect(result.folders).toEqual(['src/', 'tmp/']);
  });

  it('listObjects with a prefix descends one level', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['src/index.ts', 'src/util/x.ts']);

    const svc = new GcsObjectStorage(storage);

    const result = await svc.listObjects(projectId, { prefix: 'src/', delimiter: '/' });
    expect(result.objects.map((object) => object.key)).toEqual(['src/index.ts']);
    expect(result.folders).toEqual(['src/util/']);
  });

  it('createUploadUrl returns a V4 write URL + headers', async () => {
    const storage = new FakeStorage();
    const svc = new GcsObjectStorage(storage);

    const out = await svc.createUploadUrl(projectId, { key: 'a/b.bin', contentType: 'image/png' });
    expect(out.method).toBe('PUT');
    // AUDX-021 — the size ceiling is now part of the signed contract, so the
    // header set is deliberately larger than it was. Kept as an exact equality
    // rather than a subset check: an upload URL must carry exactly the headers
    // it was signed with, and a stray extra one is a signature mismatch waiting
    // to happen.
    expect(out.headers).toEqual({
      'Content-Type': 'image/png',
      'x-goog-content-length-range': `0,${OBJECT_UPLOAD_MAX_BYTES}`,
    });
    expect(out.url).toContain('action=write');
    expect(storage.signed[0]).toMatchObject({ version: 'v4', action: 'write', contentType: 'image/png' });
    expect(Date.parse(out.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('createDownloadUrl returns a V4 read URL', async () => {
    const storage = new FakeStorage();
    const svc = new GcsObjectStorage(storage);

    const out = await svc.createDownloadUrl(projectId, { key: 'a/b.bin' });
    expect(out.url).toContain('action=read');
    expect(storage.signed[0]).toMatchObject({ version: 'v4', action: 'read' });
  });

  it('moveObject copies then deletes the source', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['old/name.txt']);

    const svc = new GcsObjectStorage(storage);

    const out = await svc.moveObject(projectId, { from: 'old/name.txt', to: 'new/name.txt' });
    expect(out).toEqual({ moved: true, key: 'new/name.txt' });

    const keys = [...storage.buckets.get(bucket)!.keys()];
    expect(keys).toEqual(['new/name.txt']);
  });

  it('deleteObject removes one key', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['gone.txt', 'stay.txt']);

    const svc = new GcsObjectStorage(storage);

    const out = await svc.deleteObject(projectId, { key: 'gone.txt' });
    expect(out).toEqual({ deleted: true, count: 1 });
    expect([...storage.buckets.get(bucket)!.keys()]).toEqual(['stay.txt']);
  });

  it('deletePrefix removes every object under a folder', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['logs/a', 'logs/b', 'logs/c', 'keep']);

    const svc = new GcsObjectStorage(storage);

    const out = await svc.deletePrefix(projectId, { prefix: 'logs/' });
    expect(out).toEqual({ deleted: true, count: 3 });
    expect([...storage.buckets.get(bucket)!.keys()]).toEqual(['keep']);
  });

  it('rejects traversal keys before touching the backend', async () => {
    const svc = new GcsObjectStorage(new FakeStorage());
    await expect(svc.deleteObject('p', { key: '../escape' })).rejects.toThrow(ObjectStorageError);
  });

  it('deleteBucket purges all objects then removes the bucket', async () => {
    const storage = new FakeStorage();
    storage.seed(projectBucketName('p1'), ['a.txt', 'dir/b.txt']);

    const svc = new GcsObjectStorage(storage);

    const result = await svc.deleteBucket('p1');

    expect(result.deleted).toBe(true);
    expect(result.bucket).toBe(projectBucketName('p1'));
    expect(storage.buckets.has(projectBucketName('p1'))).toBe(false);
  });

  it('deleteBucket returns deleted:false when the bucket does not exist', async () => {
    const svc = new GcsObjectStorage(new FakeStorage());
    const result = await svc.deleteBucket('missing');

    expect(result.deleted).toBe(false);
  });
});

describe('seau pas encore créé — BUCKET_NOT_PROVISIONED', () => {
  /*
   * Le seau d'un projet est créé À LA DEMANDE. Une lecture arrivant avant tombait
   * sur un « The specified bucket does not exist » brut du client GCS : sans type,
   * il traversait `sendObjectStorageError` et Fastify répondait 500 avec un corps
   * VIDE.
   *
   * Reproduit en production le 2026-08-30 sur un projet créé la minute d'avant :
   * `GET /projects/<id>/thumbnail` → 500, 0 octet. Le log de l'API disait
   * exactement « request failed with server error: The specified bucket does not
   * exist ».
   */
  const gcsMissingBucket = () => Object.assign(new Error('The specified bucket does not exist.'), { code: 404 });

  it('reconnaît l’erreur « le seau n’existe pas » du client GCS', () => {
    expect(isMissingBucketError(gcsMissingBucket())).toBe(true);
  });

  it('ne confond pas un OBJET absent avec un SEAU absent', () => {
    /*
     * Les deux portent 404 ; seul le message les sépare, et les deux situations
     * n'appellent pas la même réponse.
     */
    expect(isMissingBucketError(Object.assign(new Error('No such object: foo/bar'), { code: 404 }))).toBe(false);
  });

  it('ignore une panne de stockage réelle, qui doit rester une erreur', () => {
    expect(isMissingBucketError(Object.assign(new Error('Internal error'), { code: 500 }))).toBe(false);
    expect(isMissingBucketError(new Error('The specified bucket does not exist.'))).toBe(false);
  });

  it('résiste à une entrée qui n’est pas une erreur', () => {
    for (const value of [null, undefined, 'boom', 42]) {
      expect(isMissingBucketError(value)).toBe(false);
    }
  });

  it('lit le message sans dépendre de la casse', () => {
    expect(isMissingBucketError(Object.assign(new Error('The Specified Bucket Does Not Exist.'), { code: 404 }))).toBe(
      true,
    );
  });
});

/* ------------------- AUDX-024 — beyond one GCS page (1 000) ------------------ */

describe('AUDX-024 pagination beyond a single 1 000-object page', () => {
  const project = 'proj-big';
  const bucket = projectBucketName(project);

  /** 2 500 objects = three GCS pages at the 1 000 default. */
  function seedBig(storage: FakeStorage, count = 2_500, prefix = 'data/') {
    storage.seed(
      bucket,
      Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(5, '0')}.bin`),
    );
  }

  it('reports that more objects exist instead of truncating in silence', async () => {
    const storage = new FakeStorage();
    seedBig(storage);

    const page = await new GcsObjectStorage(storage).listObjects(project, { prefix: 'data/' });

    /*
     * A page is fine — loading 100 000 objects into one response is not. What
     * was NOT fine is that the caller had no way to tell a complete listing from
     * a truncated one: pre-fix, 2 500 objects came back as a flat 1 000 with no
     * marker at all.
     */
    expect(page.objects).toHaveLength(1_000);
    expect(page.nextPageToken).toBeTruthy();
  });

  it('walks every page when the caller asks for the whole inventory', async () => {
    const storage = new FakeStorage();
    seedBig(storage);

    const all = await new GcsObjectStorage(storage).listAllObjects(project, { prefix: 'data/' });

    // The inventory behind metering and quotas must see all 2 500, not 1 000.
    expect(all.objects).toHaveLength(2_500);
    expect(all.totalBytes).toBe(2_500 * 10);
    expect(storage.listCalls.length).toBeGreaterThan(1);
  });

  it('follows the caller-supplied page token to the end', async () => {
    const storage = new FakeStorage();
    seedBig(storage, 2_100);
    const service = new GcsObjectStorage(storage);

    const first = await service.listObjects(project, { prefix: 'data/' });
    const second = await service.listObjects(project, { prefix: 'data/', pageToken: first.nextPageToken });
    const third = await service.listObjects(project, { prefix: 'data/', pageToken: second.nextPageToken });

    expect(second.objects).toHaveLength(1_000);
    expect(third.objects).toHaveLength(100);
    // Exhausted: no token means no more pages, which is how a caller knows it is done.
    expect(third.nextPageToken).toBeUndefined();

    const keys = new Set([...first.objects, ...second.objects, ...third.objects].map((object) => object.key));
    expect(keys.size).toBe(2_100);
  });

  it('deletes every object under a prefix instead of only the first page', async () => {
    const storage = new FakeStorage();
    seedBig(storage);

    const result = await new GcsObjectStorage(storage).deletePrefix(project, { prefix: 'data/' });

    /*
     * Pre-fix this deleted 1 000 objects, left 1 500 behind, and still returned
     * `{ deleted: true }`. Reporting success for a partial delete is worse than
     * truncating a listing: the caller believes the data is gone.
     */
    expect(result.count).toBe(2_500);
    expect(storage.buckets.get(bucket)!.size).toBe(0);
  });

  it('fails loudly when the backend refuses to delete an object', async () => {
    /*
     * ANTI-REGRESSION GUARD, GREEN ON BOTH SIDES — stated as such rather than
     * passed off as a counter-proof. The pre-fix `Promise.all` already
     * propagated a rejection; this pins that a partial delete can never be
     * reported as success once the loop is rewritten to page and batch, which is
     * exactly where a naive implementation starts swallowing per-object errors.
     */
    const storage = new FakeStorage();
    seedBig(storage, 1_200);

    const service = new GcsObjectStorage(new ThrowingDeleteStorage(storage, 'data/00007.bin'));

    await expect(service.deletePrefix(project, { prefix: 'data/' })).rejects.toThrow(/permission denied/);
  });
});

/* ------------- AUDX-021 — bornes de taille et intégrité à l'upload ------------ */

describe('AUDX-021 upload URL binds a size ceiling and an integrity check', () => {
  const project = 'proj-up';

  it('binds x-goog-content-length-range so an unbounded PUT is refused by GCS', async () => {
    const storage = new FakeStorage();

    const result = await new GcsObjectStorage(storage).createUploadUrl(project, { key: 'a.bin' });

    /*
     * Pre-fix the signed URL bound ONLY Content-Type: the holder could PUT any
     * number of bytes. A signed URL is handed to the browser and used directly
     * against GCS, so nothing server-side ever saw the size — no API limit could
     * have caught it. The ceiling has to be signed INTO the URL.
     */
    const signed = storage.signed.at(-1)!;
    const extension = signed.extensionHeaders as Record<string, string> | undefined;

    expect(extension?.['x-goog-content-length-range']).toBe(`0,${OBJECT_UPLOAD_MAX_BYTES}`);

    // The caller must be told to send it, or GCS rejects the PUT as unsigned.
    expect(result.headers['x-goog-content-length-range']).toBe(`0,${OBJECT_UPLOAD_MAX_BYTES}`);
    expect(result.maxBytes).toBe(OBJECT_UPLOAD_MAX_BYTES);
  });

  it('honours a smaller caller ceiling but never a larger one', async () => {
    const storage = new FakeStorage();
    const service = new GcsObjectStorage(storage);

    await service.createUploadUrl(project, { key: 'small.bin', maxBytes: 1_024 });
    expect((storage.signed.at(-1)!.extensionHeaders as Record<string, string>)['x-goog-content-length-range']).toBe(
      '0,1024',
    );

    // A caller asking for more than the platform ceiling is clamped, not obeyed.
    await service.createUploadUrl(project, { key: 'big.bin', maxBytes: OBJECT_UPLOAD_MAX_BYTES * 10 });
    expect((storage.signed.at(-1)!.extensionHeaders as Record<string, string>)['x-goog-content-length-range']).toBe(
      `0,${OBJECT_UPLOAD_MAX_BYTES}`,
    );
  });

  it('binds the caller-declared MD5 so corrupted bytes are rejected at the source', async () => {
    const storage = new FakeStorage();
    const md5 = Buffer.from('0123456789abcdef').toString('base64');

    const result = await new GcsObjectStorage(storage).createUploadUrl(project, { key: 'c.bin', contentMd5: md5 });

    // GCS verifies Content-MD5 against the bytes it received and fails the PUT
    // on mismatch — an integrity check the API never had.
    expect(storage.signed.at(-1)!.contentMd5).toBe(md5);
    expect(result.headers['Content-MD5']).toBe(md5);
  });

  it('rejects a malformed MD5 before signing anything', async () => {
    const storage = new GcsObjectStorage(new FakeStorage());

    await expect(storage.createUploadUrl(project, { key: 'c.bin', contentMd5: 'not-base64-md5' })).rejects.toThrow(
      /Content-MD5/,
    );
  });

  it('rejects a non-positive ceiling instead of signing an unbounded URL', async () => {
    const storage = new GcsObjectStorage(new FakeStorage());

    await expect(storage.createUploadUrl(project, { key: 'c.bin', maxBytes: 0 })).rejects.toThrow(/maxBytes/);
    await expect(storage.createUploadUrl(project, { key: 'c.bin', maxBytes: -1 })).rejects.toThrow(/maxBytes/);
  });
});
