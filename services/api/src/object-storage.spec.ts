import { describe, expect, it } from 'vitest';

import {
  GcsObjectStorage,
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
      async getFiles(query: Record<string, unknown>) {
        const map = self.buckets.get(name) ?? new Map<string, FakeObject>();
        const prefix = (query.prefix as string) || '';
        const delimiter = query.delimiter as string | undefined;
        const matched = [...map.values()].filter((object) => object.name.startsWith(prefix));
        const prefixes = new Set<string>();
        const files: FileLike[] = [];

        for (const object of matched) {
          if (delimiter) {
            const rest = object.name.slice(prefix.length);
            const idx = rest.indexOf(delimiter);

            if (idx >= 0) {
              prefixes.add(prefix + rest.slice(0, idx + 1));
              continue;
            }
          }

          files.push(self._file(name, object.name));
        }

        return [files, undefined, { prefixes: [...prefixes] }] as [FileLike[], unknown, { prefixes?: string[] }];
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
    expect(out.headers).toEqual({ 'Content-Type': 'image/png' });
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
