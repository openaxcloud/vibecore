import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilesystemSnapshotStore } from './snapshot-store.js';

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

  async function seedWorkspace(name: string, files: Record<string, string>): Promise<string> {
    const dir = join(scratch, name);

    for (const [path, content] of Object.entries(files)) {
      const full = join(dir, path);
      await mkdir(join(full, '..'), { recursive: true });
      await writeFile(full, content);
    }

    return dir;
  }

  it('reports no snapshot for an unknown workspace', async () => {
    expect(await store.has('ws_unknown')).toBe(false);
    // Restoring a missing snapshot is a no-op that signals "provision empty".
    expect(await store.restore('ws_unknown', join(scratch, 'target'))).toBe(false);
  });

  it('round-trips a workspace filesystem through save + restore', async () => {
    const source = await seedWorkspace('ws_a-src', {
      'index.js': 'console.log(1)\n',
      'src/app.ts': 'export const x = 1\n',
    });

    await store.save('ws_a', source);
    expect(await store.has('ws_a')).toBe(true);

    const restored = join(scratch, 'ws_a-restored');
    expect(await store.restore('ws_a', restored)).toBe(true);

    expect(await readFile(join(restored, 'index.js'), 'utf8')).toBe('console.log(1)\n');
    expect(await readFile(join(restored, 'src/app.ts'), 'utf8')).toBe('export const x = 1\n');
  });

  it('overwrites a prior snapshot on re-save (latest wins, no stale files)', async () => {
    await store.save('ws_b', await seedWorkspace('ws_b-v1', { 'a.txt': 'v1', 'gone.txt': 'old' }));
    await store.save('ws_b', await seedWorkspace('ws_b-v2', { 'a.txt': 'v2' }));

    const restored = join(scratch, 'ws_b-restored');
    await store.restore('ws_b', restored);

    expect(await readFile(join(restored, 'a.txt'), 'utf8')).toBe('v2');
    // The file removed in v2 must not survive in the restored snapshot.
    await expect(readFile(join(restored, 'gone.txt'), 'utf8')).rejects.toThrow();
  });

  it('forks a snapshot into an independent workspace (instant duplicate)', async () => {
    await store.save('ws_src', await seedWorkspace('ws_src-fs', { 'main.py': 'print("hi")\n' }));

    await store.fork('ws_src', 'ws_fork');
    expect(await store.has('ws_fork')).toBe(true);

    // The fork is independent: mutating the source snapshot does not touch it.
    await store.save('ws_src', await seedWorkspace('ws_src-fs2', { 'main.py': 'print("changed")\n' }));

    const forkDir = join(scratch, 'ws_fork-restored');
    await store.restore('ws_fork', forkDir);
    expect(await readFile(join(forkDir, 'main.py'), 'utf8')).toBe('print("hi")\n');
  });

  it('refuses to fork from a source with no snapshot', async () => {
    await expect(store.fork('ws_missing', 'ws_target')).rejects.toThrow(/no snapshot/i);
  });

  it('removes a snapshot on delete', async () => {
    await store.save('ws_del', await seedWorkspace('ws_del-fs', { 'f.txt': 'x' }));
    expect(await store.has('ws_del')).toBe(true);

    await store.remove('ws_del');
    expect(await store.has('ws_del')).toBe(false);
    // Removing again is idempotent.
    await expect(store.remove('ws_del')).resolves.toBeUndefined();
  });

  it('rejects unsafe workspace ids (path traversal / absolute paths)', async () => {
    for (const bad of ['../escape', 'a/b', '/abs', 'name with space', '..']) {
      await expect(store.has(bad)).rejects.toThrow(/unsafe workspace id/i);
    }
  });
});
