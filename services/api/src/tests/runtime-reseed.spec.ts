import { describe, expect, it } from 'vitest';

import { runtimeWorkspaceTreeHasProjectFiles } from '../runtime-reseed.js';

describe('runtimeWorkspaceTreeHasProjectFiles', () => {
  it('is false for a genuinely empty pod (empty tree) — must trigger a reseed', () => {
    expect(runtimeWorkspaceTreeHasProjectFiles([])).toBe(false);
  });

  it('is true when the pod already carries a real file (warm reattach) — skip reseed', () => {
    expect(
      runtimeWorkspaceTreeHasProjectFiles([
        { path: 'package.json', type: 'file' },
        { path: 'src', type: 'directory' },
      ]),
    ).toBe(true);
  });

  it('treats a pod with only dotfile scaffolding as empty (reseed still runs)', () => {
    expect(
      runtimeWorkspaceTreeHasProjectFiles([
        { path: '.gitignore', type: 'file' },
        { path: '.npmrc', type: 'file' },
      ]),
    ).toBe(false);
  });

  it('detects project files even when dotfiles are also present', () => {
    expect(
      runtimeWorkspaceTreeHasProjectFiles([
        { path: '.gitignore', type: 'file' },
        { path: 'index.html', type: 'file' },
      ]),
    ).toBe(true);
  });

  it('uses the basename, not the full path (a nested dotdir entry with a real leaf counts)', () => {
    // listTree returns relative paths; a top-level real dir is a project file.
    expect(runtimeWorkspaceTreeHasProjectFiles([{ path: 'app', type: 'directory' }])).toBe(true);
  });

  it('is defensive: a non-array agent response is treated as not-populated (reseed runs)', () => {
    expect(runtimeWorkspaceTreeHasProjectFiles(undefined)).toBe(false);
    expect(runtimeWorkspaceTreeHasProjectFiles(null)).toBe(false);
    expect(runtimeWorkspaceTreeHasProjectFiles({ files: [] })).toBe(false);
  });

  it('is defensive: nodes without a string path are ignored, not crash', () => {
    expect(runtimeWorkspaceTreeHasProjectFiles([{ type: 'file' }, { path: 42 }])).toBe(false);
    expect(runtimeWorkspaceTreeHasProjectFiles([{ path: '' }])).toBe(false);
  });
});
