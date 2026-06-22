import { describe, expect, it } from 'vitest';
import {
  computeWorkspaceFilesSignature,
  shouldRefreshOnFilesChange,
  shouldRefreshOnVisibility,
} from './git-autorefresh';
import type { FileMap } from '~/lib/stores/files';

function file(content: string): FileMap[string] {
  return { type: 'file', content, isBinary: false };
}

describe('computeWorkspaceFilesSignature', () => {
  it('is stable regardless of key insertion order', () => {
    const a: FileMap = { 'b.ts': file('two'), 'a.ts': file('one') };
    const b: FileMap = { 'a.ts': file('one'), 'b.ts': file('two') };

    expect(computeWorkspaceFilesSignature(a)).toBe(computeWorkspaceFilesSignature(b));
  });

  it('changes when a file is added', () => {
    const before: FileMap = { 'a.ts': file('one') };
    const after: FileMap = { 'a.ts': file('one'), 'b.ts': file('two') };

    expect(computeWorkspaceFilesSignature(before)).not.toBe(computeWorkspaceFilesSignature(after));
  });

  it('changes when a file is removed', () => {
    const before: FileMap = { 'a.ts': file('one'), 'b.ts': file('two') };
    const after: FileMap = { 'a.ts': file('one') };

    expect(computeWorkspaceFilesSignature(before)).not.toBe(computeWorkspaceFilesSignature(after));
  });

  it('changes when a file content length changes (an edit)', () => {
    const before: FileMap = { 'a.ts': file('one') };
    const after: FileMap = { 'a.ts': file('one-plus-more') };

    expect(computeWorkspaceFilesSignature(before)).not.toBe(computeWorkspaceFilesSignature(after));
  });

  it('ignores undefined dirents (deleted-but-present keys)', () => {
    const withUndefined: FileMap = { 'a.ts': file('one'), 'gone.ts': undefined };
    const without: FileMap = { 'a.ts': file('one') };

    expect(computeWorkspaceFilesSignature(withUndefined)).toBe(computeWorkspaceFilesSignature(without));
  });
});

describe('shouldRefreshOnFilesChange', () => {
  it('is true only when the signature actually changed (no refetch storm on no-op emissions)', () => {
    expect(shouldRefreshOnFilesChange('sig-1', 'sig-2')).toBe(true);
    expect(shouldRefreshOnFilesChange('sig-1', 'sig-1')).toBe(false);
  });
});

describe('shouldRefreshOnVisibility', () => {
  it('refreshes only when the tab becomes visible', () => {
    expect(shouldRefreshOnVisibility('visible')).toBe(true);
    expect(shouldRefreshOnVisibility('hidden')).toBe(false);
  });
});
