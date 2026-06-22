import { describe, expect, it } from 'vitest';
import { pathBreaksCommaSerialization } from './git-staged-files';

/*
 * GitTab's per-file "Discard changes" button posts `filePaths` to the git panel
 * action, which parses it with `String(body.filePaths).split(',')`. A working-tree
 * path containing a comma (e.g. `report,final.tsx`) would therefore be split into
 * two bogus paths — the real file is never discarded and nonexistent paths are
 * sent to /git/discard, yet the user still sees a success toast.
 *
 * The button now refuses the discard when the single target path contains a comma
 * (mirroring the commit-path guard). This spec pins the pure decision the button
 * relies on, and replicates the button's branch logic to prove the right files
 * are blocked vs. allowed.
 */

/** Replicates the GitTab discard button's "should this discard be blocked?" decision. */
function discardWouldBeBlocked(target: { all: boolean; path?: string }): boolean {
  return Boolean(!target.all && target.path && pathBreaksCommaSerialization(target.path));
}

describe('GitTab per-file discard comma guard', () => {
  it('flags a single working-tree path containing a comma as unserializable', () => {
    expect(pathBreaksCommaSerialization('report,final.tsx')).toBe(true);
    expect(pathBreaksCommaSerialization('src/a,b/c.ts')).toBe(true);
  });

  it('treats ordinary paths as serializable', () => {
    expect(pathBreaksCommaSerialization('src/index.ts')).toBe(false);
    expect(pathBreaksCommaSerialization('app/components/git/GitTab.tsx')).toBe(false);
  });

  it('blocks a single-file discard when the path contains a comma', () => {
    expect(discardWouldBeBlocked({ all: false, path: 'report,final.tsx' })).toBe(true);
  });

  it('allows a single-file discard for a comma-free path', () => {
    expect(discardWouldBeBlocked({ all: false, path: 'report-final.tsx' })).toBe(false);
  });

  it('never blocks the discard-all action (no per-file path is wired)', () => {
    expect(discardWouldBeBlocked({ all: true })).toBe(false);

    // Even if a stale path lingers, discard-all takes the `{}` branch and is never blocked.
    expect(discardWouldBeBlocked({ all: true, path: 'report,final.tsx' })).toBe(false);
  });

  it('does not block when no path is selected (falls back to the {} payload branch)', () => {
    expect(discardWouldBeBlocked({ all: false, path: undefined })).toBe(false);
  });
});
