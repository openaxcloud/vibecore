import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createGcsObjectStorageClient, type GcsBucketLike, type GcsFileLike } from './gcs-object-storage-client.js';
import { ObjectStorageSnapshotStore } from './object-storage-snapshot-store.js';

/**
 * In-memory bucket structurally compatible with @google-cloud/storage's Bucket,
 * so this exercises the real adapter code path without the SDK or cloud creds.
 */
class FakeGcsBucket implements GcsBucketLike {
  readonly objects = new Map<string, Buffer>();

  file(name: string): GcsFileLike {
    const bucket = this;

    return {
      createWriteStream(): PassThrough {
        const sink = new PassThrough();
        const chunks: Buffer[] = [];
        sink.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        sink.on('finish', () => bucket.objects.set(name, Buffer.concat(chunks)));

        return sink;
      },
      createReadStream(): Readable {
        return Readable.from(bucket.objects.get(name) ?? Buffer.alloc(0));
      },
      async exists(): Promise<[boolean]> {
        return [bucket.objects.has(name)];
      },
      async copy(destination: GcsFileLike): Promise<unknown> {
        // The fake's File closes over its own name; resolve the destination by
        // writing the source bytes through its write stream.
        const value = bucket.objects.get(name) ?? Buffer.alloc(0);
        await new Promise<void>((resolve, reject) => {
          const ws = destination.createWriteStream();
          ws.on('finish', resolve);
          ws.on('error', reject);
          ws.end(value);
        });

        return undefined;
      },
      async delete(): Promise<unknown> {
        bucket.objects.delete(name);

        return undefined;
      },
    };
  }
}

async function collect(stream: Readable | undefined): Promise<string | undefined> {
  if (!stream) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString();
}

describe('createGcsObjectStorageClient', () => {
  it('put/get/exists/delete round-trip over a bucket-like object', async () => {
    const bucket = new FakeGcsBucket();
    const client = createGcsObjectStorageClient(bucket);

    expect(await client.exists('k1')).toBe(false);
    expect(await client.get('k1')).toBeUndefined();

    await client.put('k1', Readable.from(Buffer.from('hello-gcs')));
    expect(await client.exists('k1')).toBe(true);
    expect(await collect(await client.get('k1'))).toBe('hello-gcs');

    await client.delete('k1');
    expect(await client.exists('k1')).toBe(false);
    // delete is idempotent.
    await expect(client.delete('k1')).resolves.toBeUndefined();
  });

  it('copies an object server-side', async () => {
    const client = createGcsObjectStorageClient(new FakeGcsBucket());

    await client.put('src', Readable.from(Buffer.from('payload')));
    await client.copy('src', 'dst');

    expect(await collect(await client.get('dst'))).toBe('payload');
  });

  it('drives the ObjectStorageSnapshotStore end to end', async () => {
    const store = new ObjectStorageSnapshotStore(createGcsObjectStorageClient(new FakeGcsBucket()), 'snaps');

    await store.saveStream('ws_1', Readable.from(Buffer.from('archive-bytes')));
    await store.fork('ws_1', 'ws_2');
    await store.saveStream('ws_1', Readable.from(Buffer.from('changed')));

    expect(await collect(await store.restoreStream('ws_2'))).toBe('archive-bytes');
    expect(await store.has('ws_1')).toBe(true);

    await store.remove('ws_1');
    expect(await store.has('ws_1')).toBe(false);
  });
});
