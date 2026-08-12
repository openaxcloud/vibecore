import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * BUG-PERF-LOAD regression guard.
 *
 * `app/root.tsx` is on EVERY route, marketing pages included, so anything in
 * its static import graph is emitted as `<link rel="modulepreload">` on every
 * page. Importing `installEditorPwaServiceWorker` from the `@vibecore/editor`
 * BARREL dragged the barrel's `@codemirror/*` value imports into that graph.
 *
 * Measured on prod (e-code.ai, 2026-08-12) before the fix: 104 modulepreload
 * links, 2 113 KB transferred, 8 101 KB decoded, `load` at 6 062 ms — of which
 * ~912 KB was IDE-only vendor code (monaco 573 / codemirror 257 / xterm 82 KB)
 * that a marketing visitor never executes.
 *
 * These assertions are cheap and catch the reintroduction directly, which a
 * bundle-size budget alone would only catch after the fact.
 */

const repoRoot = join(__dirname, '..', '..', '..');

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('root route module graph', () => {
  it('never imports the @vibecore/editor barrel (it pulls all of CodeMirror)', () => {
    const root = read('app/root.tsx');

    expect(root).not.toMatch(/from\s+'@vibecore\/editor'/);
    expect(root).toMatch(/from\s+'@vibecore\/editor\/install-pwa-sw'/);
  });

  it('the install-pwa-sw leaf module stays dependency-free', () => {
    const leaf = read('packages/editor/src/install-pwa-sw.ts');
    const imports = leaf.match(/^\s*import\s.+$/gm) ?? [];

    expect(imports).toEqual([]);
  });

  it('the editor package exposes the leaf module as a subpath export', () => {
    const pkg = JSON.parse(read('packages/editor/package.json')) as {
      exports?: Record<string, string>;
    };

    expect(pkg.exports?.['./install-pwa-sw']).toBe('./src/install-pwa-sw.ts');

    // The default entry must stay intact so existing barrel consumers keep working.
    expect(pkg.exports?.['.']).toBe('./src/index.ts');
  });
});
