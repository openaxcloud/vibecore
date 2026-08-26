import { describe, expect, it, beforeEach } from 'vitest';
import { FileHistoryStore } from './fileHistory';

/*
 * IndexedDB is undefined under vitest, so ordinary captures use the in-memory
 * cache. Destructive recovery flows call captureDurably() and must fail closed
 * without a committed browser database.
 */

const FILE = '/home/project/src/app.ts';

describe('FileHistoryStore', () => {
  let store: FileHistoryStore;

  beforeEach(() => {
    store = new FileHistoryStore();
    store.configure('proj-1');
  });

  it('captures the first version as seq 1 with the given source', async () => {
    const version = await store.capture(FILE, 'v1', 'save');

    expect(version).toBeDefined();
    expect(version?.seq).toBe(1);
    expect(version?.source).toBe('save');
    expect(version?.content).toBe('v1');
    expect(store.getVersions(FILE)).toHaveLength(1);
  });

  it('dedupes an identical capture (no new version)', async () => {
    await store.capture(FILE, 'same', 'save');

    const dup = await store.capture(FILE, 'same', 'save');

    expect(dup).toBeUndefined();
    expect(store.getVersions(FILE)).toHaveLength(1);
  });

  it('appends monotonically increasing versions for changed content', async () => {
    await store.capture(FILE, 'a', 'initial');
    await store.capture(FILE, 'b', 'save');
    await store.capture(FILE, 'c', 'agent');

    const versions = store.getVersions(FILE);
    expect(versions.map((v) => v.seq)).toEqual([1, 2, 3]);
    expect(versions.map((v) => v.content)).toEqual(['a', 'b', 'c']);
    expect(versions.map((v) => v.source)).toEqual(['initial', 'save', 'agent']);
  });

  it('serialises rapid captures so recovery sequence numbers cannot collide', async () => {
    const captures = Array.from({ length: 20 }, (_, index) => store.capture(FILE, `draft-${index}`, 'conflict'));

    await Promise.all(captures);

    const versions = store.getVersions(FILE);
    expect(versions.map((version) => version.seq)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(versions.at(-1)?.content).toBe('draft-19');
  });

  it('keeps an in-flight capture bound to the project where it started', async () => {
    const capture = store.capture(FILE, 'project-one draft', 'recovery');
    store.configure('proj-2');

    await expect(capture).resolves.toMatchObject({ projectId: 'proj-1', content: 'project-one draft' });
    expect(store.getVersions(FILE)).toHaveLength(0);
  });

  it('restore is append-only: keeps history and records restoredFromSeq', async () => {
    await store.capture(FILE, 'a', 'initial'); // seq 1
    await store.capture(FILE, 'b', 'save'); // seq 2
    await store.capture(FILE, 'c', 'save'); // seq 3

    // Restore seq 1's content — appends a NEW version, nothing removed.
    const restored = await store.capture(FILE, 'a', 'restore', { restoredFromSeq: 1 });

    const versions = store.getVersions(FILE);
    expect(versions).toHaveLength(4);
    expect(restored?.seq).toBe(4);
    expect(restored?.source).toBe('restore');
    expect(restored?.restoredFromSeq).toBe(1);
    expect(restored?.content).toBe('a');

    // The earlier versions are all still present.
    expect(versions.map((v) => v.content)).toEqual(['a', 'b', 'c', 'a']);
  });

  it('open seeds a baseline when there is no history', async () => {
    await store.open(FILE, 'baseline content');

    const versions = store.getVersions(FILE);
    expect(versions).toHaveLength(1);
    expect(versions[0].source).toBe('initial');
    expect(versions[0].content).toBe('baseline content');
    expect(store.status.get()).toBe('ready');
  });

  it('open records an external version when disk drifted from the last version', async () => {
    await store.capture(FILE, 'tracked', 'save');
    await store.open(FILE, 'changed on disk');

    const versions = store.getVersions(FILE);
    expect(versions.map((v) => v.content)).toEqual(['tracked', 'changed on disk']);
    expect(versions[1].source).toBe('external');
  });

  it('open does not duplicate when disk matches the latest version', async () => {
    await store.capture(FILE, 'stable', 'save');
    await store.open(FILE, 'stable');

    expect(store.getVersions(FILE)).toHaveLength(1);
  });

  it('reports an error status when no project is configured', async () => {
    const fresh = new FileHistoryStore();
    await fresh.open(FILE, 'x');

    expect(fresh.status.get()).toBe('error');
    expect(fresh.error.get()).toBeTruthy();
  });

  it('switching projects clears cached history', async () => {
    await store.capture(FILE, 'a', 'save');
    expect(store.getVersions(FILE)).toHaveLength(1);

    store.configure('proj-2');
    expect(store.getVersions(FILE)).toHaveLength(0);
  });

  it('fails closed when a destructive recovery capture cannot reach IndexedDB', async () => {
    await expect(store.captureDurably(FILE, 'irreplaceable local draft', 'conflict')).rejects.toThrow(
      'FILE_HISTORY_PERSISTENCE_UNAVAILABLE',
    );
    expect(store.getVersions(FILE)).toHaveLength(0);
  });
});
