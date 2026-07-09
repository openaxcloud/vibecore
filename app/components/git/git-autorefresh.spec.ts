import { describe, expect, it } from 'vitest';
import {
  computeWorkspaceFilesSignature,
  shouldAdvanceLastFetched,
  shouldApplyEnvelopeForLoad,
  shouldSurfaceLoadError,
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

describe('shouldSurfaceLoadError', () => {
  it('surfaces errors for foreground loads', () => {
    expect(shouldSurfaceLoadError(false)).toBe(true);
    expect(shouldSurfaceLoadError(undefined)).toBe(true);
  });

  it('suppresses errors for silent background refreshes', () => {
    /*
     * A transient 5xx/lock during agent generation must not pop a red banner,
     * nor contradict an already-fired success toast after a commit/discard.
     */
    expect(shouldSurfaceLoadError(true)).toBe(false);
  });
});

describe('shouldApplyEnvelopeForLoad', () => {
  it('always applies a successful (non-error) envelope', () => {
    expect(shouldApplyEnvelopeForLoad(false, false)).toBe(true);
    expect(shouldApplyEnvelopeForLoad(true, false)).toBe(true);
    expect(shouldApplyEnvelopeForLoad(undefined, false)).toBe(true);
  });

  it('applies an error envelope only for a foreground load', () => {
    expect(shouldApplyEnvelopeForLoad(false, true)).toBe(true);
    expect(shouldApplyEnvelopeForLoad(undefined, true)).toBe(true);
  });

  it('preserves the previous view: does not apply an error envelope on a silent refresh', () => {
    /*
     * An error envelope has no `data`; applying it would blank the live
     * working-tree list mid-generation.
     */
    expect(shouldApplyEnvelopeForLoad(true, true)).toBe(false);
  });

  it('does NOT apply a soft-degraded (gitLoadError) envelope on a silent refresh — retains the last known list', () => {
    /*
     * The degraded envelope is `status:'ok'` with an EMPTY status + gitLoadError
     * marker; without the degraded guard the silent refresh would apply it and
     * collapse the live "N changed files" list to zero mid-generation.
     */
    expect(shouldApplyEnvelopeForLoad(true, false, true)).toBe(false);
  });

  it('still applies a soft-degraded envelope on a foreground (user-initiated) refresh', () => {
    expect(shouldApplyEnvelopeForLoad(false, false, true)).toBe(true);
    expect(shouldApplyEnvelopeForLoad(undefined, false, true)).toBe(true);
  });

  it('still applies a healthy (non-degraded) envelope on a silent refresh', () => {
    expect(shouldApplyEnvelopeForLoad(true, false, false)).toBe(true);
  });
});

describe('shouldAdvanceLastFetched', () => {
  it('advances the timestamp when real data was loaded (non-error envelope)', () => {
    expect(shouldAdvanceLastFetched(false)).toBe(true);
  });

  it('does not advance the timestamp for an error envelope', () => {
    /*
     * A swallowed silent-refresh error leaves the previous working-tree list on
     * screen; advancing "last fetched" would falsely report stale data as fresh.
     */
    expect(shouldAdvanceLastFetched(true)).toBe(false);
  });

  it('does not advance the timestamp for a soft-degraded envelope (no real git status)', () => {
    expect(shouldAdvanceLastFetched(false, true)).toBe(false);
  });
});
