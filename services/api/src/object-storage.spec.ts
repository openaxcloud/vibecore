import { describe, expect, it } from 'vitest';

import { recoverPersistedObjectStorageCommand } from './object-storage-command.js';

import {
  GcsObjectStorage,
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

class PutRecoveryStorage extends NoopObjectStorage {
  override readonly active = true;

  constructor(
    private readonly object: {
      key: string;
      size: number;
      generation: string;
      contentHash: string;
    },
  ) {
    super();
  }

  override async listObjects() {
    return {
      objects: [
        {
          ...this.object,
          updated: '2026-08-28T00:00:00.000Z',
          contentType: 'application/octet-stream',
          etag: `etag-${this.object.generation}`,
        },
      ],
      folders: [],
    };
  }
}

describe('persisted PUT recovery causality', () => {
  const payload = {
    command: 'PUT_OBJECT',
    projectId: 'project-put-recovery',
    key: 'artifact.bin',
    expectedContentHash: 'sha256:stable-body',
    byteLength: 4,
    expectedTargetGeneration: 'G1',
  } as const;

  it('does not certify an unchanged pre-effect generation with the same bytes', async () => {
    const storage = new PutRecoveryStorage({
      key: 'artifact.bin',
      size: 4,
      generation: 'G1',
      contentHash: 'sha256:stable-body',
    });

    await expect(recoverPersistedObjectStorageCommand(storage, { payload })).rejects.toThrow(
      'OBJECT_STORAGE_PUT_VERIFICATION_FAILED',
    );
  });

  it('certifies an overwrite only when the provider exposes a new generation', async () => {
    const storage = new PutRecoveryStorage({
      key: 'artifact.bin',
      size: 4,
      generation: 'G2',
      contentHash: 'sha256:stable-body',
    });

    await expect(recoverPersistedObjectStorageCommand(storage, { payload })).resolves.toMatchObject({
      execution: { type: 'PUT_OBJECT', result: { generation: 'G2' } },
      verification: {
        evidence: { expectedTargetGeneration: 'G1', generation: 'G2' },
      },
    });
  });
});

/* ---------------------------- in-memory fake GCS ---------------------------- */

interface FakeObject {
  name: string;
  size: number;
  updated: string;
  contentType: string;
  etag: string;
  generation: string;
  md5Hash: string;
  sha256Hash?: string;
}

class FakeStorage implements StorageLike {
  readonly buckets = new Map<string, Map<string, FakeObject>>();
  readonly versioning = new Map<string, boolean>();
  readonly created: Array<{ name: string; opts: Record<string, unknown> }> = [];
  readonly signed: Array<Record<string, unknown>> = [];
  readonly listQueries: Record<string, unknown>[] = [];
  readonly copies: Array<{
    sourceBucket: string;
    sourceGeneration?: string | number;
    targetBucket: string;
    key: string;
    opts?: Record<string, unknown>;
  }> = [];
  readonly deletes: Array<{ bucket: string; key: string; opts?: Record<string, unknown> }> = [];
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
        self.versioning.set(
          name,
          Boolean(
            opts.versioning && typeof opts.versioning === 'object' && Reflect.get(opts.versioning, 'enabled') === true,
          ),
        );

        return undefined;
      },
      async setMetadata(metadata: Record<string, unknown>) {
        if (
          metadata.versioning &&
          typeof metadata.versioning === 'object' &&
          Reflect.get(metadata.versioning, 'enabled') === true
        ) {
          self.versioning.set(name, true);
        }
        return undefined;
      },
      async getMetadata() {
        return [{ versioning: { enabled: self.versioning.get(name) === true } }];
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

        const maxResults = typeof query.maxResults === 'number' ? query.maxResults : files.length;
        return [files.slice(0, maxResults), undefined, { prefixes: [...prefixes] }] as [
          FileLike[],
          unknown,
          { prefixes?: string[] },
        ];
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
        self.versioning.delete(name);

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
            ...(self.buckets.get(bucketName)!.get(fileName)!.sha256Hash
              ? { metadata: { 'vibecore-sha256': self.buckets.get(bucketName)!.get(fileName)!.sha256Hash } }
              : {}),
          }
        : undefined,
      async getMetadata() {
        const object = self.buckets.get(bucketName)?.get(fileName);

        if (!object) {
          throw new ObjectStorageError('object not found', 'NOT_FOUND');
        }

        return [
          {
            size: object.size,
            updated: object.updated,
            contentType: object.contentType,
            etag: object.etag,
            generation: object.generation,
            md5Hash: object.md5Hash,
            ...(object.sha256Hash ? { metadata: { 'vibecore-sha256': object.sha256Hash } } : {}),
          },
        ];
      },
      async getSignedUrl(signedOpts: Record<string, unknown>) {
        self.signed.push({ bucket: bucketName, file: fileName, generation: opts?.generation, ...signedOpts });

        return [`https://signed.example/${bucketName}/${fileName}?action=${String(signedOpts.action)}`] as [string];
      },
      async save(data: Uint8Array | Buffer | string, opts?: Record<string, unknown>) {
        const map = self.buckets.get(bucketName) ?? new Map<string, FakeObject>();
        const size = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
        const expectedGeneration = (opts?.preconditionOpts as Record<string, unknown> | undefined)?.ifGenerationMatch;
        const existing = map.get(fileName);
        if (
          (expectedGeneration === 0 && existing) ||
          (typeof expectedGeneration === 'string' && existing?.generation !== expectedGeneration)
        ) {
          throw new ObjectStorageError('target generation changed', 'TARGET_CHANGED');
        }
        const customMetadata = opts?.metadata as Record<string, unknown> | undefined;

        map.set(fileName, {
          name: fileName,
          size,
          updated: '2026-06-29T00:00:00.000Z',
          contentType: (opts?.contentType as string | undefined) ?? 'application/octet-stream',
          etag: 'e',
          generation: String(Number(existing?.generation ?? 7) + 1),
          md5Hash: `hash-${fileName}`,
          ...(typeof customMetadata?.['vibecore-sha256'] === 'string'
            ? { sha256Hash: customMetadata['vibecore-sha256'] }
            : {}),
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
          const preconditions = copyOpts?.preconditionOpts as Record<string, unknown> | undefined;

          if (preconditions?.ifGenerationMatch === 0 && target.has(destination.name)) {
            throw new ObjectStorageError('target already exists', 'TARGET_CHANGED');
          }

          target.set(destination.name, { ...source, name: destination.name, generation: '1' });
          self.buckets.set(targetBucket, target);
          self.copies.push({
            sourceBucket: bucketName,
            ...(opts?.generation ? { sourceGeneration: opts.generation } : {}),
            targetBucket,
            key: fileName,
            opts: copyOpts,
          });
        }

        return undefined;
      },
      async delete(deleteOpts?: Record<string, unknown>) {
        const current = self.buckets.get(bucketName)?.get(fileName);
        if (!current) {
          throw Object.assign(new Error('object not found'), { code: 404 });
        }
        const expectedGeneration = deleteOpts?.ifGenerationMatch;

        if (expectedGeneration !== undefined && String(expectedGeneration) !== current?.generation) {
          throw new ObjectStorageError('source generation changed', 'SOURCE_CHANGED');
        }

        self.deletes.push({ bucket: bucketName, key: fileName, opts: deleteOpts });
        self.buckets.get(bucketName)?.delete(fileName);

        return undefined;
      },
    } as FileLike;
  }
}

class VersionedPrefixStorage implements StorageLike {
  readonly generations = new Map<string, Map<string, { name: string; generation: string }>>();
  readonly listQueries: Record<string, unknown>[] = [];

  seed(key: string, generation: string): void {
    const versions = this.generations.get(key) ?? new Map<string, { name: string; generation: string }>();
    versions.set(generation, { name: key, generation });
    this.generations.set(key, versions);
  }

  private file(key: string, generation: string): FileLike {
    return {
      name: key,
      metadata: { size: 1, generation, md5Hash: `hash-${key}-${generation}` },
      async getSignedUrl() {
        throw new Error('not used');
      },
      async save() {
        throw new Error('not used');
      },
      async copy() {
        throw new Error('not used');
      },
      delete: async (options?: Record<string, unknown>) => {
        if (String(options?.ifGenerationMatch) !== generation) {
          throw new Error('GENERATION_PRECONDITION_REQUIRED');
        }
        this.generations.get(key)?.delete(generation);
        if (this.generations.get(key)?.size === 0) this.generations.delete(key);
      },
    };
  }

  bucket(): BucketLike {
    return {
      exists: async () => [true],
      create: async () => undefined,
      setMetadata: async () => undefined,
      getMetadata: async () => [{ versioning: { enabled: true } }],
      getFiles: async (query) => {
        this.listQueries.push(query);
        const prefix = String(query.prefix ?? '');
        const all = [...this.generations.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .flatMap(([key, versions]) =>
            query.versions === true
              ? [...versions.keys()].map((generation) => this.file(key, generation))
              : [...versions.keys()]
                  .sort()
                  .slice(-1)
                  .map((generation) => this.file(key, generation)),
          )
          .sort(
            (left, right) =>
              left.name.localeCompare(right.name) ||
              String(left.metadata?.generation).localeCompare(String(right.metadata?.generation)),
          );
        const maxResults = typeof query.maxResults === 'number' ? query.maxResults : all.length;
        return [all.slice(0, maxResults), undefined, { prefixes: [] }];
      },
      file: (key, options) => this.file(key, String(options?.generation ?? '')),
      deleteFiles: async () => this.generations.clear(),
      delete: async () => undefined,
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
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const out = await svc.createUploadUrl(projectId, { key: 'a/b.bin', contentType: 'image/png', expiresAt });
    expect(out.method).toBe('PUT');
    expect(out.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(out.url).toContain('action=write');
    expect(storage.signed[0]).toMatchObject({ version: 'v4', action: 'write', contentType: 'image/png' });
    expect(out.expiresAt).toBe(expiresAt);
    expect(storage.signed[0]).toMatchObject({ expires: Date.parse(expiresAt) });
  });

  it('createDownloadUrl returns a V4 read URL', async () => {
    const storage = new FakeStorage();
    const svc = new GcsObjectStorage(storage);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const out = await svc.createDownloadUrl(projectId, { key: 'a/b.bin', expiresAt });
    expect(out.url).toContain('action=read');
    expect(storage.signed[0]).toMatchObject({ version: 'v4', action: 'read' });
  });

  it('pins a shared download URL to the consented immutable generation', async () => {
    const storage = new FakeStorage();
    const svc = new GcsObjectStorage(storage);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    await svc.createDownloadUrl(projectId, { key: 'a/b.bin', generation: '42', expiresAt });
    expect(storage.signed[0]).toMatchObject({ action: 'read', generation: '42' });
  });

  it('refuses to sign without the absolute DB-reserved expiration', async () => {
    const svc = new GcsObjectStorage(new FakeStorage());

    await expect(svc.createUploadUrl(projectId, { key: 'a/b.bin' })).rejects.toMatchObject({
      code: 'CAPABILITY_EXPIRY_REQUIRED',
    });
    await expect(svc.createDownloadUrl(projectId, { key: 'a/b.bin' })).rejects.toMatchObject({
      code: 'CAPABILITY_EXPIRY_REQUIRED',
    });
  });

  it('returns immutable provider generation and a server-computed content hash after direct writes', async () => {
    const storage = new FakeStorage();
    const svc = new GcsObjectStorage(storage);
    const body = new TextEncoder().encode('exact bytes');

    await expect(svc.putObject(projectId, { key: 'server/output.bin', body })).resolves.toEqual({
      key: 'server/output.bin',
      size: body.byteLength,
      generation: '8',
      contentHash: 'sha256:e38e581aade78b64cc86f7ac9f3555ca78c2dcca747942a7f1d9b3275a834f75',
    });
  });

  it('moveObject copies then deletes the source', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['old/name.txt']);

    const svc = new GcsObjectStorage(storage);

    const out = await svc.moveObject(projectId, {
      from: 'old/name.txt',
      to: 'new/name.txt',
      sourceGeneration: '7',
    });
    expect(out).toEqual({ moved: true, key: 'new/name.txt', generation: '1' });
    expect(storage.copies[0]).toMatchObject({
      sourceGeneration: '7',
      opts: { preconditionOpts: { ifGenerationMatch: 0 } },
    });
    expect(storage.deletes[0]).toEqual({
      bucket,
      key: 'old/name.txt',
      opts: { ifGenerationMatch: '7' },
    });

    const keys = [...storage.buckets.get(bucket)!.keys()];
    expect(keys).toEqual(['new/name.txt']);
  });

  it('moveObject never overwrites an existing target or deletes the pinned source on copy failure', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['old/name.txt', 'new/name.txt']);
    const svc = new GcsObjectStorage(storage);

    await expect(svc.moveObject(projectId, { from: 'old/name.txt', to: 'new/name.txt' })).rejects.toMatchObject({
      code: 'TARGET_CHANGED',
    });
    expect([...storage.buckets.get(bucket)!.keys()]).toEqual(['old/name.txt', 'new/name.txt']);
    expect(storage.deletes).toEqual([]);
  });

  it('revalidates the durable lease after copy and never deletes the source with a lost fence', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['old/name.txt']);
    const svc = new GcsObjectStorage(storage);
    let guardCalls = 0;

    await expect(
      svc.moveObject(projectId, { from: 'old/name.txt', to: 'new/name.txt', sourceGeneration: '7' }, async () => {
        guardCalls += 1;
        if (guardCalls === 2) throw new Error('OBJECT_STORAGE_OPERATION_FENCE_LOST');
      }),
    ).rejects.toThrow('OBJECT_STORAGE_OPERATION_FENCE_LOST');
    expect(storage.copies).toHaveLength(1);
    expect(storage.deletes).toEqual([]);
    expect([...storage.buckets.get(bucket)!.keys()].sort()).toEqual(['new/name.txt', 'old/name.txt']);
  });

  it('deleteObject removes one key', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['gone.txt', 'stay.txt']);

    const svc = new GcsObjectStorage(storage);

    const out = await svc.deleteObject(projectId, { key: 'gone.txt' });
    expect(out).toEqual({ deleted: true, count: 1 });
    expect([...storage.buckets.get(bucket)!.keys()]).toEqual(['stay.txt']);
  });

  it('deleteObject treats an already-absent key as the exact idempotent result', async () => {
    const svc = new GcsObjectStorage(new FakeStorage());

    await expect(svc.deleteObject(projectId, { key: 'already-gone.txt' })).resolves.toEqual({
      deleted: false,
      count: 0,
    });
  });

  it('deletePrefix removes every object under a folder', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, ['logs/a', 'logs/b', 'logs/c', 'keep']);

    const svc = new GcsObjectStorage(storage);

    const out = await svc.deletePrefix(projectId, { prefix: 'logs/' });
    expect(out).toEqual({ deleted: true, count: 3 });
    expect([...storage.buckets.get(bucket)!.keys()]).toEqual(['keep']);
  });

  it('deletePrefix exhausts every provider page instead of stopping at 1000 objects', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, [...Array.from({ length: 2_005 }, (_, index) => `logs/${index}`), 'keep']);
    const svc = new GcsObjectStorage(storage);

    await expect(svc.deletePrefix(projectId, { prefix: 'logs/' })).resolves.toEqual({
      deleted: true,
      count: 2_005,
    });
    expect([...storage.buckets.get(bucket)!.keys()]).toEqual(['keep']);
    expect(storage.listQueries.filter((query) => query.prefix === 'logs/')).toHaveLength(4);
  });

  it('deletePrefix removes every live and noncurrent generation from a versioned bucket', async () => {
    const storage = new VersionedPrefixStorage();
    storage.seed('logs/versioned.txt', 'G1');
    storage.seed('logs/versioned.txt', 'G2');
    storage.seed('keep.txt', 'G1');
    const svc = new GcsObjectStorage(storage);

    await expect(svc.deletePrefix(projectId, { prefix: 'logs/' })).resolves.toEqual({ deleted: true, count: 2 });
    await expect(svc.listObjectVersions(projectId, { prefix: 'logs/' })).resolves.toEqual({
      objects: [],
      folders: [],
    });
    expect(storage.generations.get('keep.txt')?.has('G1')).toBe(true);
    expect(storage.listQueries.filter((query) => query.prefix === 'logs/')).not.toHaveLength(0);
    expect(
      storage.listQueries.filter((query) => query.prefix === 'logs/').every((query) => query.versions === true),
    ).toBe(true);
  });

  it('stops prefix deletion after the first batch when the durable lease is lost', async () => {
    const storage = new FakeStorage();
    storage.seed(bucket, [...Array.from({ length: 2_005 }, (_, index) => `logs/${index}`), 'keep']);
    const svc = new GcsObjectStorage(storage);
    let guardCalls = 0;

    await expect(
      svc.deletePrefix(projectId, { prefix: 'logs/' }, async () => {
        guardCalls += 1;
        if (guardCalls === 3) throw new Error('OBJECT_STORAGE_OPERATION_FENCE_LOST');
      }),
    ).rejects.toThrow('OBJECT_STORAGE_OPERATION_FENCE_LOST');
    expect(storage.listQueries.filter((query) => query.prefix === 'logs/')).toHaveLength(1);
    expect([...storage.buckets.get(bucket)!.keys()].filter((key) => key.startsWith('logs/'))).toHaveLength(1_005);
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

    // target create + live versioning proof + one guard per copy + final verification
    expect(guardCalls).toHaveLength(inventory.objects.length + 3);
    expect(verified.objects.map(({ key, contentHash }) => ({ key, contentHash }))).toEqual(
      inventory.objects.map(({ key, contentHash }) => ({ key, contentHash })),
    );
    expect(storage.copies.every(({ targetBucket }) => targetBucket === projectBucketName('target1'))).toBe(true);
    expect(storage.copies[0]).toMatchObject({
      sourceGeneration: '7',
      opts: { preconditionOpts: { ifGenerationMatch: 0 } },
    });
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
});
