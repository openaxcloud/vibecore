import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ObjectStorageSnapshotStore, type ObjectStorageClient } from './object-storage-snapshot-store.js';

/** In-memory bucket implementing the object-storage port — no cloud creds. */
class FakeBucket implements ObjectStorageClient {
  readonly objects = new Map<string, Buffer>();

  async put(key: string, body: Readable): Promise<void> {
    const chunks: Buffer[] = [];

    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }

    this.objects.set(key, Buffer.concat(chunks));
  }

  async get(key: string): Promise<Readable | undefined> {
    const value = this.objects.get(key);

    return value ? Readable.from(value) : undefined;
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async copy(sourceKey: string, targetKey: string): Promise<void> {
    const value = this.objects.get(sourceKey);

    if (value) {
      this.objects.set(targetKey, Buffer.from(value));
    }
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
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

describe('ObjectStorageSnapshotStore', () => {
  it('stores each workspace under a prefixed .tar.gz object key', async () => {
    const bucket = new FakeBucket();
    const store = new ObjectStorageSnapshotStore(bucket, 'snaps');

    await store.saveStream('ws_1', Readable.from(Buffer.from('archive')));

    expect([...bucket.objects.keys()]).toEqual(['snaps/ws_1.tar.gz']);
  });

  it('round-trips an archive through save + restore', async () => {
    const store = new ObjectStorageSnapshotStore(new FakeBucket());

    await store.saveStream('ws_1', Readable.from(Buffer.from('opaque-bytes')));

    expect(await store.has('ws_1')).toBe(true);
    expect(await collect(await store.restoreStream('ws_1'))).toBe('opaque-bytes');
    expect(await store.restoreStream('ws_missing')).toBeUndefined();
  });

  it('forks via a server-side object copy and stays independent', async () => {
    const store = new ObjectStorageSnapshotStore(new FakeBucket());

    await store.saveStream('ws_src', Readable.from(Buffer.from('original')));
    await store.fork('ws_src', 'ws_fork');
    await store.saveStream('ws_src', Readable.from(Buffer.from('changed')));

    expect(await collect(await store.restoreStream('ws_fork'))).toBe('original');
  });

  it('refuses to fork a source with no snapshot', async () => {
    const store = new ObjectStorageSnapshotStore(new FakeBucket());

    await expect(store.fork('ws_missing', 'ws_dst')).rejects.toThrow(/no snapshot/i);
  });

  it('removes a snapshot object on delete', async () => {
    const store = new ObjectStorageSnapshotStore(new FakeBucket());

    await store.saveStream('ws_del', Readable.from(Buffer.from('x')));
    await store.remove('ws_del');

    expect(await store.has('ws_del')).toBe(false);
  });

  it('rejects unsafe workspace ids', async () => {
    const store = new ObjectStorageSnapshotStore(new FakeBucket());

    await expect(store.has('../escape')).rejects.toThrow(/unsafe workspace id/i);
  });
});
