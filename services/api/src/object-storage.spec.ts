import { describe, expect, it } from 'vitest';

import {
  GcsObjectStorage,
  guardSharedObjectStorageWrites,
  listPinnedInventoryObjects,
  NoopObjectStorage,
  ObjectStorageError,
  assertValidObjectKey,
  buildLifecycleRules,
  projectBucketName,
  type BucketLike,
  type FileLike,
  type StorageLike,
} from './object-storage.js';

/* ---------------------------- in-memory fake GCS ---------------------------- */

interface FakeObject {
  name: string;
  size: number;
  updated: string;
  contentType: string;
  etag: string;
  generation: string;
  md5Hash: string;
}

class FakeStorage implements StorageLike {
  readonly buckets = new Map<string, Map<string, FakeObject>>();
  readonly created: Array<{ name: string; opts: Record<string, unknown> }> = [];
  readonly signed: Array<Record<string, unknown>> = [];
  readonly listQueries: Record<string, unknown>[] = [];
  readonly copies: Array<{ sourceBucket: string; targetBucket: string; key: string; opts?: Record<string, unknown> }> =
    [];
  afterExists?: (bucketName: string) => void;
  afterDeleteFiles?: (bucketName: string) => void;

  seed(bucketName: string, keys: string[]) {
    const map = this.buckets.get(bucketName) ?? new Map<string, FakeObject>();

    for (const key of keys) {
      map.set(key, {
        name: key,
        size: 10,
        updated: '2026-06-29T00:00:00.000Z',
        contentType: 'text/plain',
        etag: 'e',
        generation: '7',
        md5Hash: `hash-${key}`,
      });
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
        const exists = self.buckets.has(name);
        self.afterExists?.(name);
        return [exists] as [boolean];
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
        self.listQueries.push(query);
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
      file(fileName: string, opts?: { generation?: string | number }) {
        return self._file(name, fileName, opts);
      },
      async deleteFiles() {
        self.buckets.set(name, new Map());
        self.afterDeleteFiles?.(name);

        return undefined;
      },
      async delete() {
        self.buckets.delete(name);

        return undefined;
      },
    };
  }

  private _file(bucketName: string, fileName: string, opts?: { generation?: string | number }): FileLike {
    const self = this;

    return {
      _bucketName: bucketName,
      name: fileName,
      metadata: self.buckets.get(bucketName)?.get(fileName)
        ? {
            size: self.buckets.get(bucketName)!.get(fileName)!.size,
            updated: self.buckets.get(bucketName)!.get(fileName)!.updated,
            contentType: self.buckets.get(bucketName)!.get(fileName)!.contentType,
            etag: self.buckets.get(bucketName)!.get(fileName)!.etag,
            generation: self.buckets.get(bucketName)!.get(fileName)!.generation,
            md5Hash: self.buckets.get(bucketName)!.get(fileName)!.md5Hash,
          }
        : undefined,
      async getSignedUrl(signedOpts: Record<string, unknown>) {
        self.signed.push({ bucket: bucketName, file: fileName, generation: opts?.generation, ...signedOpts });

        return [`https://signed.example/${bucketName}/${fileName}?action=${String(signedOpts.action)}`] as [string];
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
          generation: '8',
          md5Hash: `hash-${fileName}`,
        });
        self.buckets.set(bucketName, map);

        return undefined;
      },
      async copy(destination: FileLike, copyOpts?: Record<string, unknown>) {
        const map = self.buckets.get(bucketName);
        const source = map?.get(fileName);

        if (opts?.generation && String(opts.generation) !== source?.generation) {
          throw new ObjectStorageError('source generation changed', 'SOURCE_CHANGED');
        }

        if (source) {
          const targetBucket = (destination as FileLike & { _bucketName: string })._bucketName;
          const target = self.buckets.get(targetBucket) ?? new Map<string, FakeObject>();
          target.set(destination.name, { ...source, name: destination.name, generation: '1' });
          self.buckets.set(targetBucket, target);
          self.copies.push({ sourceBucket: bucketName, targetBucket, key: fileName, opts: copyOpts });
        }

        return undefined;
      },
      async delete() {
        self.buckets.get(bucketName)?.delete(fileName);

        return undefined;
      },
    } as FileLike;
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

  it('pins a shared download URL to the consented immutable generation', async () => {
    const storage = new FakeStorage();
    const svc = new GcsObjectStorage(storage);

    await svc.createDownloadUrl(projectId, { key: 'a/b.bin', generation: '42' });
    expect(storage.signed[0]).toMatchObject({ action: 'read', generation: '42' });
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

  it('revalidates cleanup ownership after bucket.exists and before the first delete effect', async () => {
    const storage = new FakeStorage();
    const targetBucket = projectBucketName('cleanup-target');
    storage.seed(targetBucket, ['must-remain.txt']);
    let lost = false;
    storage.afterExists = (name) => {
      if (name === targetBucket) lost = true;
    };
    const svc = new GcsObjectStorage(storage);

    await expect(
      svc.deleteBucket('cleanup-target', async () => {
        if (lost) throw Object.assign(new Error('lease lost'), { code: 'REMIX_OWNERSHIP_LOST' });
      }),
    ).rejects.toMatchObject({ code: 'REMIX_OWNERSHIP_LOST' });
    expect([...storage.buckets.get(targetBucket)!.keys()]).toEqual(['must-remain.txt']);
  });

  it('revalidates cleanup ownership between object deletion and bucket deletion', async () => {
    const storage = new FakeStorage();
    const targetBucket = projectBucketName('cleanup-between-effects');
    storage.seed(targetBucket, ['target-only.txt']);
    let lost = false;
    storage.afterDeleteFiles = (name) => {
      if (name === targetBucket) lost = true;
    };
    const svc = new GcsObjectStorage(storage);

    await expect(
      svc.deleteBucket('cleanup-between-effects', async () => {
        if (lost) throw Object.assign(new Error('lease lost'), { code: 'REMIX_OWNERSHIP_LOST' });
      }),
    ).rejects.toMatchObject({ code: 'REMIX_OWNERSHIP_LOST' });

    // The first target-only cleanup effect happened while owned, but the next
    // mutation is fenced as soon as the durable lease is lost.
    expect(storage.buckets.has(targetBucket)).toBe(true);
    expect(storage.buckets.get(targetBucket)?.size).toBe(0);
  });

  it('inventories every object with generation + checksum and performs an exact target-bucket clone', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['z.txt', 'nested/a.txt']);
    const svc = new GcsObjectStorage(storage);
    const inventory = await svc.inventoryProjectObjects(projectId);
    const guardCalls: number[] = [];

    expect(inventory.objects.map(({ key }) => key)).toEqual(['nested/a.txt', 'z.txt']);
    expect(
      inventory.objects.every(({ generation, contentHash }) => generation === '7' && contentHash?.startsWith('md5:')),
    ).toBe(true);
    expect(storage.listQueries.at(-1)).toMatchObject({ autoPaginate: true });

    const verified = await svc.cloneProjectObjects(projectId, 'target1', inventory, async () => {
      guardCalls.push(1);
    });

    expect(guardCalls).toHaveLength(inventory.objects.length + 2);
    expect(verified.objects.map(({ key, contentHash }) => ({ key, contentHash }))).toEqual(
      inventory.objects.map(({ key, contentHash }) => ({ key, contentHash })),
    );
    expect(storage.copies.every(({ targetBucket }) => targetBucket === projectBucketName('target1'))).toBe(true);
    expect(storage.copies[0].opts).toMatchObject({ preconditionOpts: { ifSourceGenerationMatch: '7' } });
  });

  it('mutation guard: refuses a clone when the source generation changed after the inventory pin', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['data.json']);
    const svc = new GcsObjectStorage(storage);
    const inventory = await svc.inventoryProjectObjects(projectId);
    storage.buckets.get(bucket)!.get('data.json')!.generation = '8';

    await expect(svc.cloneProjectObjects(projectId, 'target2', inventory)).rejects.toMatchObject({
      code: 'SOURCE_CHANGED',
    });
  });

  it('fails closed before target creation when any source object lacks an immutable generation', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['legacy.bin']);
    const svc = new GcsObjectStorage(storage);
    const inventory = await svc.inventoryProjectObjects(projectId);
    inventory.objects[0].generation = null;

    await expect(svc.cloneProjectObjects(projectId, 'unpinable-target', inventory)).rejects.toMatchObject({
      code: 'SOURCE_UNPINNABLE',
    });
    expect(storage.buckets.has(projectBucketName('unpinable-target'))).toBe(false);
    expect(storage.copies).toEqual([]);
  });

  it('revalidates ownership after target bucket.exists and immediately before bucket.create', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['data.json']);
    const svc = new GcsObjectStorage(storage);
    const inventory = await svc.inventoryProjectObjects(projectId);
    const targetBucket = projectBucketName('target-after-read');
    let lost = false;
    storage.afterExists = (name) => {
      if (name === targetBucket) lost = true;
    };

    await expect(
      svc.cloneProjectObjects(projectId, 'target-after-read', inventory, async () => {
        if (lost) throw Object.assign(new Error('lease lost'), { code: 'REMIX_OWNERSHIP_LOST' });
      }),
    ).rejects.toMatchObject({ code: 'REMIX_OWNERSHIP_LOST' });
    expect(storage.created.some(({ name }) => name === targetBucket)).toBe(false);
    expect(storage.buckets.has(targetBucket)).toBe(false);
    expect(storage.copies).toEqual([]);
  });
});

describe('consented read-only storage snapshots', () => {
  it('lists only pinned inventory paths with folder semantics', () => {
    const listed = listPinnedInventoryObjects(
      {
        bucketExists: true,
        objects: [
          { key: 'root.txt', size: 1, generation: '1', contentHash: 'md5:a' },
          { key: 'src/a.ts', size: 2, generation: '2', contentHash: 'md5:b' },
          { key: 'src/deep/b.ts', size: 3, generation: '3', contentHash: 'md5:c' },
        ],
      },
      { prefix: 'src/', delimiter: '/' },
    );

    expect(listed.objects.map(({ key }) => key)).toEqual(['src/a.ts']);
    expect(listed.folders).toEqual(['src/deep/']);
  });

  it('blocks every target mutation while preserving read access', async () => {
    const raw = new GcsObjectStorage(new FakeStorage());
    const guarded = guardSharedObjectStorageWrites(raw, async (projectId) => projectId === 'shared');
    const mutations = [
      () => guarded.ensureBucket('shared'),
      () => guarded.createUploadUrl('shared', { key: 'a' }),
      () => guarded.putObject('shared', { key: 'a', body: new Uint8Array() }),
      () => guarded.moveObject('shared', { from: 'a', to: 'b' }),
      () => guarded.deleteObject('shared', { key: 'a' }),
      () => guarded.deletePrefix('shared', { prefix: 'a/' }),
      () => guarded.deleteBucket('shared'),
    ];

    for (const mutate of mutations) {
      await expect(mutate()).rejects.toMatchObject({ code: 'SHARED_READ_ONLY' });
    }
    await expect(guarded.listObjects('shared')).resolves.toEqual({ objects: [], folders: [] });
  });
});
