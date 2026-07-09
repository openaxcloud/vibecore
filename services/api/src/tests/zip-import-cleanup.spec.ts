import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resilientRm } from '../project-storage.js';

/*
 * #26 sub-part 3 — the zip-import cache cleanup must be idempotent/robust so a
 * concurrent cache write (deploy build home) can't crash the import with ENOTEMPTY.
 */

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)));
  created.length = 0;
});

async function makeTree() {
  const root = await mkdtemp(join(tmpdir(), 'vc-rm-cleanup-'));
  created.push(root);
  const target = join(root, '.vibecore-deploy-home');
  await mkdir(join(target, '.npm-cache', '_cacache', 'tmp'), { recursive: true });
  await writeFile(join(target, '.npm-cache', '_cacache', 'tmp', 'chunk.bin'), 'x'.repeat(1024));
  await writeFile(join(target, 'marker.txt'), 'here');
  return { root, target };
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('resilientRm', () => {
  it('does not throw against a missing directory', async () => {
    await expect(resilientRm(join(tmpdir(), 'vc-rm-cleanup-does-not-exist-xyz'))).resolves.toBeUndefined();
  });

  it('removes a non-empty nested directory', async () => {
    const { target } = await makeTree();

    await expect(resilientRm(target)).resolves.toBeUndefined();
    expect(await exists(target)).toBe(false);
  });

  it('is idempotent: a second call after removal does not throw', async () => {
    const { target } = await makeTree();

    await resilientRm(target);
    await expect(resilientRm(target)).resolves.toBeUndefined();
    expect(await exists(target)).toBe(false);
  });

  it('does not throw while a concurrent writer keeps populating a subdir', async () => {
    const { target } = await makeTree();
    const cacheTmp = join(target, '.npm-cache', '_cacache', 'tmp');
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Simulate the deploy build's npm cache writing chunks INTO the tree while the
    // import cleanup runs — the classic ENOTEMPTY race the fix must survive. Bounded
    // + yielding so the writer overlaps the rm without starving the event loop.
    let writing = true;
    const writer = (async () => {
      for (let i = 0; writing && i < 40; i += 1) {
        await mkdir(cacheTmp, { recursive: true }).catch(() => undefined);
        await writeFile(join(cacheTmp, `chunk-${i}.bin`), 'x'.repeat(256)).catch(() => undefined);
        await delay(5);
      }
    })();

    // The cleanup must resolve (never throw) even with the writer racing it — the
    // ENOTEMPTY thrown mid-delete is retried and ultimately swallowed.
    await expect(resilientRm(target)).resolves.toBeUndefined();

    writing = false;
    await writer;

    // Once the writer stops, a settling pass leaves the tree gone with no error.
    await expect(resilientRm(target)).resolves.toBeUndefined();
    expect(await exists(target)).toBe(false);
  }, 20_000);
});
