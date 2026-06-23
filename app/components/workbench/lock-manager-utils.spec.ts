import { describe, it, expect } from 'vitest';
import { removeLockedPaths, removeSelectedPath, type LockedItem } from './LockManager';

describe('removeLockedPaths', () => {
  const items: LockedItem[] = [
    { path: '/home/project/a.ts', type: 'file' },
    { path: '/home/project/b.ts', type: 'file' },
    { path: '/home/project/dir', type: 'folder' },
  ];

  it('removes a single path immediately (per-row Unlock path)', () => {
    const result = removeLockedPaths(items, '/home/project/a.ts');
    expect(result.map((i) => i.path)).toEqual(['/home/project/b.ts', '/home/project/dir']);
  });

  it('removes multiple paths from a set (bulk "Unlock all" path)', () => {
    const result = removeLockedPaths(items, new Set(['/home/project/a.ts', '/home/project/dir']));
    expect(result.map((i) => i.path)).toEqual(['/home/project/b.ts']);
  });

  it('does not mutate the input array', () => {
    const copy = [...items];
    removeLockedPaths(items, '/home/project/a.ts');
    expect(items).toEqual(copy);
  });

  it('is a no-op when the path is not present', () => {
    const result = removeLockedPaths(items, '/home/project/missing.ts');
    expect(result).toEqual(items);
  });
});

describe('removeSelectedPath', () => {
  it('removes the path and returns a new set', () => {
    const selected = new Set(['/home/project/a.ts', '/home/project/b.ts']);
    const result = removeSelectedPath(selected, '/home/project/a.ts');

    expect(result.has('/home/project/a.ts')).toBe(false);
    expect(result.has('/home/project/b.ts')).toBe(true);
    expect(result).not.toBe(selected);

    // original untouched
    expect(selected.has('/home/project/a.ts')).toBe(true);
  });

  it('is a no-op (new set, same contents) when path absent', () => {
    const selected = new Set(['/home/project/a.ts']);
    const result = removeSelectedPath(selected, '/home/project/x.ts');
    expect([...result]).toEqual(['/home/project/a.ts']);
  });
});
