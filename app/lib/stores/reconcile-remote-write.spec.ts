import { describe, expect, it } from 'vitest';
import { reconcileRemoteWrite } from './reconcile-remote-write';
import { KeyedMutex } from '~/lib/common/keyed-mutex';

describe('reconcileRemoteWrite', () => {
  it('unions concurrent package.json edits (neither lane loses its deps)', () => {
    const fresh = JSON.stringify({ name: 'app', dependencies: { react: '^18.2.0' } });
    const ours = JSON.stringify({ dependencies: { zustand: '^4.5.0' }, scripts: { dev: 'vite' } });

    const parsed = JSON.parse(reconcileRemoteWrite('package.json', fresh, ours));

    expect(parsed.dependencies).toEqual({ react: '^18.2.0', zustand: '^4.5.0' });
    expect(parsed.scripts).toEqual({ dev: 'vite' });
  });

  it('keeps OUR content for a non-JSON file (index.html): coherent last-write-wins', () => {
    const fresh = '<!doctype html><html><body>old</body></html>';
    const ours = '<!doctype html><html><body><div id="root"></div></body></html>';

    expect(reconcileRemoteWrite('index.html', fresh, ours)).toBe(ours);
  });

  it('resolves nested-directory package.json by basename', () => {
    const fresh = JSON.stringify({ name: 'pkg', version: '1.0.0' });
    const ours = JSON.stringify({ dependencies: { lodash: '^4' } });

    const parsed = JSON.parse(reconcileRemoteWrite('packages/app/package.json', fresh, ours));

    expect(parsed.version).toBe('1.0.0');
    expect(parsed.dependencies).toEqual({ lodash: '^4' });
  });

  it('falls back to OUR content when a JSON merge is impossible', () => {
    // fresh is garbage but ours is what we intend to write.
    expect(reconcileRemoteWrite('data.json', '{ not json', '{ also not json')).toBe('{ also not json');
  });

  it('two serialized lanes on package.json converge to a union with no conflict', async () => {
    /*
     * Simulate the real pipeline: a shared "remote" file, two lanes each adding a
     * dependency, serialized per path by KeyedMutex + reconciled on write.
     */
    const mutex = new KeyedMutex();

    let remote = JSON.stringify({ name: 'app', private: true, dependencies: {} });

    const conflicts: string[] = [];

    const lane = (dep: string, version: string) =>
      mutex.run('package.json', async () => {
        const base = remote; // the version this lane loaded
        const proposed = JSON.stringify({ dependencies: { [dep]: version } });

        // On write, the file may have moved on (another lane) → reconcile, never fail.
        if (remote !== base) {
          conflicts.push('unexpected'); // should never happen under the mutex
        }

        remote = reconcileRemoteWrite('package.json', remote, mergeOnto(remote, proposed));
      });

    await Promise.all([lane('react', '^18.2.0'), lane('zustand', '^4.5.0'), lane('vite', '^5.0.0')]);

    const parsed = JSON.parse(remote);
    expect(conflicts).toEqual([]);
    expect(parsed.dependencies).toEqual({ react: '^18.2.0', zustand: '^4.5.0', vite: '^5.0.0' });
    expect(parsed.name).toBe('app');
  });
});

// Small helper mirroring how the pipeline merges a proposed patch onto current.
function mergeOnto(current: string, proposed: string): string {
  return reconcileRemoteWrite('package.json', current, proposed);
}
