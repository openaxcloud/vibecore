import type { WorkspaceSession } from '@vibecore/runtime-contract';
import { describe, expect, it } from 'vitest';
import {
  appendWorkspaceLogLines,
  decodeArchiveEntry,
  isTransientCommandFailure,
  isTransientFailureMessage,
  shouldKickReopenPreview,
  shouldLatchPreviewStartFailure,
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

describe('shouldKickReopenPreview', () => {
  const base = { autoStart: true, hasProject: true, isStartingPreview: false, workspaceStatus: session('stopped') };

  it('kicks a reopened desktop project whose workspace is stopped or crashed', () => {
    expect(shouldKickReopenPreview(base)).toBe(true);
    expect(shouldKickReopenPreview({ ...base, workspaceStatus: session('error') })).toBe(true);
  });

  it('does not kick a healthy, still-starting, or unknown workspace', () => {
    expect(shouldKickReopenPreview({ ...base, workspaceStatus: session('running') })).toBe(false);
    expect(shouldKickReopenPreview({ ...base, workspaceStatus: session('starting') })).toBe(false);
    expect(shouldKickReopenPreview({ ...base, workspaceStatus: undefined })).toBe(false);
  });

  it('does not kick without autoStart, without a project, or while already starting', () => {
    expect(shouldKickReopenPreview({ ...base, autoStart: false })).toBe(false);
    expect(shouldKickReopenPreview({ ...base, hasProject: false })).toBe(false);
    expect(shouldKickReopenPreview({ ...base, isStartingPreview: true })).toBe(false);
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

describe('isTransientFailureMessage', () => {
  it('matches cold-start / dropped-socket / aborted signatures', () => {
    expect(isTransientFailureMessage('Remote runtime request failed: 502')).toBe(true);
    expect(isTransientFailureMessage('workspace unavailable')).toBe(true);
    expect(isTransientFailureMessage('connect ECONNREFUSED 10.0.0.1:5173')).toBe(true);
    expect(isTransientFailureMessage('stream closed before completion')).toBe(true);
    expect(isTransientFailureMessage('The operation was aborted')).toBe(true);
  });

  it('does NOT match a deterministic failure', () => {
    expect(isTransientFailureMessage('No package.json found in the project')).toBe(false);
    expect(isTransientFailureMessage('project file archive returned 404')).toBe(false);
    expect(isTransientFailureMessage('ERESOLVE unable to resolve dependency tree')).toBe(false);
  });
});

describe('shouldLatchPreviewStartFailure', () => {
  it('does NOT latch a transient failure on the auto path (boot loop keeps retrying)', () => {
    expect(shouldLatchPreviewStartFailure({ manual: false, message: 'Remote runtime request failed: 502' })).toBe(
      false,
    );
    expect(shouldLatchPreviewStartFailure({ manual: false, message: 'workspace_not_started' })).toBe(false);
  });

  it('latches a deterministic failure on the auto path (no 5-min wait for a broken project)', () => {
    expect(shouldLatchPreviewStartFailure({ manual: false, message: 'No package.json found' })).toBe(true);
    expect(shouldLatchPreviewStartFailure({ manual: false, message: 'ERESOLVE unable to resolve' })).toBe(true);
  });

  it('always latches a manual run/restart failure, transient or not', () => {
    expect(shouldLatchPreviewStartFailure({ manual: true, message: 'Remote runtime request failed: 502' })).toBe(true);
    expect(shouldLatchPreviewStartFailure({ manual: true, message: 'No package.json found' })).toBe(true);
  });
});
