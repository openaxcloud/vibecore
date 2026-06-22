import type { WorkspaceSession } from '@vibecore/runtime-contract';
import { describe, expect, it } from 'vitest';
import {
  appendWorkspaceLogLines,
  decodeArchiveEntry,
  isTransientCommandFailure,
  shouldUseExistingPreviewServer,
  workspaceNeedsReprovision,
} from './preview-recovery';

function session(status: WorkspaceSession['status']): WorkspaceSession {
  return {
    id: 'ws-1',
    runtimeMode: 'remote-kubernetes',
    status,
    workdir: '/home/project',
    createdAt: '',
    updatedAt: '',
  };
}

describe('shouldUseExistingPreviewServer', () => {
  it('does NOT short-circuit when dependencies are not installed, even with a detected port', () => {
    expect(shouldUseExistingPreviewServer([{ ready: true }], false)).toBe(false);
  });

  it('does NOT short-circuit on a merely-detected (ready undefined / not-true) port', () => {
    expect(shouldUseExistingPreviewServer([{ ready: false }], true)).toBe(false);

    /* ready can arrive undefined from the runtime; that must not count as ready. */
    expect(shouldUseExistingPreviewServer([{} as { ready: boolean }], true)).toBe(false);
  });

  it('short-circuits only with a genuinely-ready port AND installed dependencies', () => {
    expect(shouldUseExistingPreviewServer([{ ready: true }], true)).toBe(true);
  });

  it('does not short-circuit with no previews', () => {
    expect(shouldUseExistingPreviewServer([], true)).toBe(false);
  });
});

describe('workspaceNeedsReprovision', () => {
  it('flags stopped and error workspaces for reprovision', () => {
    expect(workspaceNeedsReprovision(session('stopped'))).toBe(true);
    expect(workspaceNeedsReprovision(session('error'))).toBe(true);
  });

  it('does not reprovision a healthy or still-starting workspace', () => {
    expect(workspaceNeedsReprovision(session('running'))).toBe(false);
    expect(workspaceNeedsReprovision(session('starting'))).toBe(false);
    expect(workspaceNeedsReprovision(session('booting'))).toBe(false);
  });

  it('does not reprovision when status is unknown (webcontainer mode)', () => {
    expect(workspaceNeedsReprovision(undefined)).toBe(false);
  });
});

describe('isTransientCommandFailure', () => {
  it('treats an interrupted command stream as transient', () => {
    expect(isTransientCommandFailure(['Command stream closed before completion'])).toBe(true);
  });

  it('treats 502 / unavailable / network drops as transient', () => {
    expect(isTransientCommandFailure(['request failed with 502'])).toBe(true);
    expect(isTransientCommandFailure(['WORKSPACE_MANAGER_UNAVAILABLE'])).toBe(true);
    expect(isTransientCommandFailure(['socket hang up'])).toBe(true);
    expect(isTransientCommandFailure(['ECONNRESET'])).toBe(true);
  });

  it('does NOT retry a deterministic install error', () => {
    expect(isTransientCommandFailure(['npm error 404 Not Found - GET https://registry/no-such-pkg'])).toBe(false);
    expect(isTransientCommandFailure(['npm error code ERESOLVE'])).toBe(false);
    expect(isTransientCommandFailure([])).toBe(false);
  });
});

describe('decodeArchiveEntry', () => {
  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
  const decodeUtf8 = (bytes: Uint8Array) => utf8Decoder.decode(bytes);
  const encodeBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

  it('decodes a text entry as utf8', () => {
    const decoded = decodeArchiveEntry(new TextEncoder().encode('hello'), decodeUtf8, encodeBase64);
    expect(decoded).toEqual({ content: 'hello', isBinary: false });
  });

  it('keeps binary bytes as base64 instead of dropping them', () => {
    /* Invalid utf8 (lone 0xFF / 0xFE bytes) → must base64-encode, not blank out. */
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const decoded = decodeArchiveEntry(bytes, decodeUtf8, encodeBase64);

    expect(decoded.isBinary).toBe(true);
    expect(decoded.content).toBe(Buffer.from(bytes).toString('base64'));
    expect(decoded.content.length).toBeGreaterThan(0);

    /* Round-trips back to the original bytes (the FileTree base64 reader). */
    expect([...Buffer.from(decoded.content, 'base64')]).toEqual([...bytes]);
  });
});

describe('appendWorkspaceLogLines', () => {
  it('appends and caps at the limit, keeping the newest lines', () => {
    expect(appendWorkspaceLogLines(['a'], ['b', 'c'], 5)).toEqual(['a', 'b', 'c']);
    expect(appendWorkspaceLogLines(['a', 'b', 'c'], ['d', 'e'], 3)).toEqual(['c', 'd', 'e']);
  });

  it('returns the current array unchanged when there is nothing to append', () => {
    const current = ['a'];
    expect(appendWorkspaceLogLines(current, [], 5)).toBe(current);
  });
});
