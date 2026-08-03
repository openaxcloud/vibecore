import { describe, expect, it } from 'vitest';

import {
  flattenRuntimeTreeFilePaths,
  normalizeRuntimePath,
  runtimeFilesMissingFromPersisted,
} from '../runtime-reseed.js';

describe('normalizeRuntimePath', () => {
  it('strips a leading ./ and leading slashes so runtime/persisted paths compare equal', () => {
    expect(normalizeRuntimePath('./package.json')).toBe('package.json');
    expect(normalizeRuntimePath('/src/App.tsx')).toBe('src/App.tsx');
    expect(normalizeRuntimePath('src/App.tsx')).toBe('src/App.tsx');
  });
});

describe('flattenRuntimeTreeFilePaths', () => {
  it('recursively collects file paths and walks directories (not recording the dir)', () => {
    const tree = [
      { path: 'package.json', type: 'file' },
      {
        path: 'src',
        type: 'directory',
        children: [
          { path: 'src/App.tsx', type: 'file' },
          { path: 'src/main.tsx', type: 'file' },
        ],
      },
    ];
    expect([...flattenRuntimeTreeFilePaths(tree)].sort()).toEqual(['package.json', 'src/App.tsx', 'src/main.tsx']);
  });

  it('is empty for an empty tree (every persisted file will count as missing)', () => {
    expect(flattenRuntimeTreeFilePaths([]).size).toBe(0);
  });

  it('is defensive: a non-array / malformed response yields an empty set', () => {
    expect(flattenRuntimeTreeFilePaths(undefined).size).toBe(0);
    expect(flattenRuntimeTreeFilePaths({ files: [] }).size).toBe(0);
    expect(flattenRuntimeTreeFilePaths([{ type: 'file' }, { path: 42 }]).size).toBe(0);
  });
});

describe('runtimeFilesMissingFromPersisted', () => {
  const persisted = ['README.md', 'index.html', 'src/App.tsx', 'src/main.tsx', 'tsconfig.json', 'vite.config.ts', 'package.json'];

  it('returns the one persisted file absent from the runtime (the live package.json divergence)', () => {
    // Runtime carried everything EXCEPT package.json — the exact bug the proof hit.
    const tree = [
      { path: 'README.md', type: 'file' },
      { path: 'index.html', type: 'file' },
      { path: 'src', type: 'directory', children: [
        { path: 'src/App.tsx', type: 'file' },
        { path: 'src/main.tsx', type: 'file' },
      ] },
      { path: 'tsconfig.json', type: 'file' },
      { path: 'vite.config.ts', type: 'file' },
    ];
    expect(runtimeFilesMissingFromPersisted(tree, persisted)).toEqual(['package.json']);
  });

  it('returns ALL persisted files for a genuinely empty pod', () => {
    expect(runtimeFilesMissingFromPersisted([], persisted)).toEqual(persisted);
  });

  it('returns nothing when the runtime already carries every persisted file (warm reattach → no-op)', () => {
    const tree = [
      { path: 'README.md', type: 'file' },
      { path: 'index.html', type: 'file' },
      { path: 'src', type: 'directory', children: [
        { path: 'src/App.tsx', type: 'file' },
        { path: 'src/main.tsx', type: 'file' },
      ] },
      { path: 'tsconfig.json', type: 'file' },
      { path: 'vite.config.ts', type: 'file' },
      { path: 'package.json', type: 'file' },
    ];
    expect(runtimeFilesMissingFromPersisted(tree, persisted)).toEqual([]);
  });

  it('is purely additive: a runtime-only file never causes an overwrite, only persisted-missing paths are returned', () => {
    // Runtime has an extra user-added file AND is missing package.json.
    const tree = [
      { path: 'index.html', type: 'file' },
      { path: 'src', type: 'directory', children: [{ path: 'src/App.tsx', type: 'file' }] },
      { path: 'notes.txt', type: 'file' }, // runtime-only, must be ignored
    ];
    const missing = runtimeFilesMissingFromPersisted(tree, persisted);
    expect(missing).toContain('package.json');
    expect(missing).toContain('src/main.tsx');
    expect(missing).not.toContain('index.html');
    expect(missing).not.toContain('src/App.tsx');
    expect(missing).not.toContain('notes.txt');
  });

  it('normalizes ./ and / prefixes on both sides before diffing', () => {
    const tree = [{ path: './package.json', type: 'file' }];
    expect(runtimeFilesMissingFromPersisted(tree, ['/package.json', 'src/main.tsx'])).toEqual(['src/main.tsx']);
  });
});
