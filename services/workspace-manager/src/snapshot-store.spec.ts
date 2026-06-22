import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilesystemSnapshotStore } from './snapshot-store.js';

async function collect(stream: Readable | undefined): Promise<string | undefined> {
  if (!stream) {
    return undefined;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

const archiveOf = (content: string) => Readable.from(Buffer.from(content));

describe('FilesystemSnapshotStore', () => {
  let scratch: string;
  let store: FilesystemSnapshotStore;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'snap-store-'));
    store = new FilesystemSnapshotStore(join(scratch, 'snapshots'));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('reports no snapshot for an unknown workspace', async () => {
    expect(await store.has('ws_unknown')).toBe(false);
    // Restoring a missing snapshot signals "provision empty".
    expect(await store.restoreStream('ws_unknown')).toBeUndefined();
  });

  it('round-trips an opaque archive blob through save + restore', async () => {
    await store.saveStream('ws_a', archiveOf('totally-opaque-tar-bytes'));

    expect(await store.has('ws_a')).toBe(true);
    expect(await collect(await store.restoreStream('ws_a'))).toBe('totally-opaque-tar-bytes');
  });

  it('overwrites a prior snapshot on re-save (latest wins)', async () => {
    await store.saveStream('ws_b', archiveOf('v1'));
    await store.saveStream('ws_b', archiveOf('v2'));

    expect(await collect(await store.restoreStream('ws_b'))).toBe('v2');
  });

  it('forks a snapshot into an independent workspace (instant duplicate)', async () => {
    await store.saveStream('ws_src', archiveOf('original'));
    await store.fork('ws_src', 'ws_fork');

    expect(await store.has('ws_fork')).toBe(true);

    // The fork is independent: mutating the source does not touch it.
    await store.saveStream('ws_src', archiveOf('changed'));

    expect(await collect(await store.restoreStream('ws_fork'))).toBe('original');
    expect(await collect(await store.restoreStream('ws_src'))).toBe('changed');
  });

  it('refuses to fork from a source with no snapshot', async () => {
    await expect(store.fork('ws_missing', 'ws_target')).rejects.toThrow(/no snapshot/i);
  });

  it('removes a snapshot on delete (idempotent)', async () => {
    await store.saveStream('ws_del', archiveOf('x'));
    expect(await store.has('ws_del')).toBe(true);

    await store.remove('ws_del');
    expect(await store.has('ws_del')).toBe(false);
    await expect(store.remove('ws_del')).resolves.toBeUndefined();
  });

  it('does not leave a partial blob when the source stream errors mid-write', async () => {
    await store.saveStream('ws_good', archiveOf('good-snapshot'));

    const failing = new Readable({
      read() {
        this.push(Buffer.from('partial'));
        this.destroy(new Error('boom'));
      },
    });

    await expect(store.saveStream('ws_good', failing)).rejects.toThrow();
    // The previous good snapshot survives; no half-written blob replaced it.
    expect(await collect(await store.restoreStream('ws_good'))).toBe('good-snapshot');
  });

  it('rejects unsafe workspace ids (path traversal / absolute paths)', async () => {
    for (const bad of ['../escape', 'a/b', '/abs', 'name with space', '..']) {
      await expect(store.has(bad)).rejects.toThrow(/unsafe workspace id/i);
    }
  });
});
