import type { WorkspaceSession } from '@vibecore/runtime-contract';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendWorkspaceLogLines,
  canKickDeadPreview,
  decodeArchiveEntry,
  isTransientCommandFailure,
  isTransientFailureMessage,
  previewPortsToPrune,
  resetDeadPreviewKicks,
  resolvePreviewBootOverlay,
  shouldKickReopenPreview,
  shouldLatchPreviewStartFailure,
  shouldReattachRunningPreview,
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

describe('shouldReattachRunningPreview', () => {
  it('REATTACHES when the workspace is running and a port is already serving (reopen of a live pod)', () => {
    expect(shouldReattachRunningPreview(session('running'), [{ port: 5173, ready: true }])).toBe(true);

    /*
     * REGRESSION — SOLUTIONS_REAL_PROOF_BLOCKERS.md §5: a forwarded URL is NOT a
     * serving signal (the API stamps one on every port it reports, without ever
     * touching the network). Reattaching to a URL-bearing but unprobed port is
     * how the IDE ended up attached to a dead dev server showing a blank frame.
     */
    expect(shouldReattachRunningPreview(session('running'), [{ port: 5173, baseUrl: 'https://x.preview' }])).toBe(
      false,
    );

    // A live serving port makes even a status still lagging at STARTING a reattach.
    expect(shouldReattachRunningPreview(session('starting'), [{ port: 5173, ready: true }])).toBe(true);
  });

  it('COLD-BOOTS (no reattach) when nothing is actually serving', () => {
    // Running status but only a detected (not-serving) port → nothing to attach to.
    expect(shouldReattachRunningPreview(session('running'), [{ port: 5173 }])).toBe(false);
    expect(shouldReattachRunningPreview(session('running'), [])).toBe(false);
    expect(shouldReattachRunningPreview(session('stopped'), [{ port: 5173 }])).toBe(false);
    expect(shouldReattachRunningPreview(undefined, [{ port: 5173 }])).toBe(false);
    expect(shouldReattachRunningPreview(undefined, undefined)).toBe(false);
  });

  it('a genuinely-live serving port is ground truth even if the status field lags/conflicts', () => {
    // The live port is the reattach signal: if the pod is actually answering, adopt it.
    expect(shouldReattachRunningPreview(session('stopped'), [{ port: 5173, ready: true }])).toBe(true);
  });
});

describe('resolvePreviewBootOverlay (resume skeleton vs rebuild)', () => {
  it('shows nothing when the overlay is not visible', () => {
    expect(resolvePreviewBootOverlay({ overlayVisible: false, reattaching: true })).toBe('none');
    expect(resolvePreviewBootOverlay({ overlayVisible: false, reattaching: false })).toBe('none');
  });

  it('shows the lightweight resume skeleton when reattaching to a live workspace', () => {
    expect(resolvePreviewBootOverlay({ overlayVisible: true, reattaching: true })).toBe('resume');
  });

  it('shows the full rebuild overlay for a genuine cold boot', () => {
    expect(resolvePreviewBootOverlay({ overlayVisible: true, reattaching: false })).toBe('rebuild');
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

describe('previewPortsToPrune', () => {
  it('prunes a previously-detected port the authoritative poll no longer lists (dev server died)', () => {
    // vite (5173) crashed; poll only still sees an api on 3001.
    expect(previewPortsToPrune([{ port: 5173 }, { port: 3001 }], new Set([3001]))).toEqual([5173]);
  });

  it('prunes everything when a resolved poll returns an EMPTY live set (nothing listening)', () => {
    expect(previewPortsToPrune([{ port: 5173 }], new Set())).toEqual([5173]);
  });

  it('keeps ports that are still listening (no spurious teardown of a live preview)', () => {
    expect(previewPortsToPrune([{ port: 5173 }], new Set([5173]))).toEqual([]);
    expect(previewPortsToPrune([], new Set([5173]))).toEqual([]);
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

/*
 * BUG-AGENT-007 — un workspace VIVANT sans serveur de dev.
 *
 * Mesuré en direct le 21/08 : workspace `running`, 18 fichiers écrits,
 * `ps aux | grep -c '[v]ite'` → 0, rien sur 5173, `HTTP 000`, et ZÉRO appel
 * `/commands` à la réouverture. Le prédicat confondait « workspace vivant » et
 * « serveur de dev vivant ».
 */
describe('BUG-AGENT-007 — relancer un aperçu mort sur un workspace vivant', () => {
  const vivant = {
    autoStart: true,
    hasProject: true,
    isStartingPreview: false,
    workspaceStatus: session('running'),
  };

  it('relance quand le workspace tourne mais qu_aucun port n_est SERVI', () => {
    expect(shouldKickReopenPreview({ ...vivant, hasServingPreview: false })).toBe(true);
  });

  it('ne relance pas un aperçu réellement servi', () => {
    expect(shouldKickReopenPreview({ ...vivant, hasServingPreview: true })).toBe(false);
  });

  it('ne relance pas tant que l_information est INCONNUE — le serveur monte peut-être', () => {
    expect(shouldKickReopenPreview({ ...vivant, hasServingPreview: undefined })).toBe(false);
    expect(shouldKickReopenPreview(vivant)).toBe(false);
  });

  it('ne relance pas un workspace qui DÉMARRE, même sans port servi', () => {
    expect(shouldKickReopenPreview({ ...vivant, workspaceStatus: session('starting'), hasServingPreview: false })).toBe(
      false,
    );
  });

  it('respecte les gardes existants (autoStart, projet, démarrage en cours)', () => {
    expect(shouldKickReopenPreview({ ...vivant, hasServingPreview: false, autoStart: false })).toBe(false);
    expect(shouldKickReopenPreview({ ...vivant, hasServingPreview: false, hasProject: false })).toBe(false);
    expect(shouldKickReopenPreview({ ...vivant, hasServingPreview: false, isStartingPreview: true })).toBe(false);
  });
});

describe('BUG-AGENT-007 — le plafond anti-boucle', () => {
  beforeEach(() => {
    resetDeadPreviewKicks();
  });

  it('autorise deux relances puis COUPE — une boucle prod est pire que pas d_aperçu', () => {
    const t = 1_000_000;
    expect(canKickDeadPreview(t)).toBe(true);
    expect(canKickDeadPreview(t + 1000)).toBe(true);
    expect(canKickDeadPreview(t + 2000)).toBe(false);
    expect(canKickDeadPreview(t + 60_000)).toBe(false);
  });

  it('se réarme après la fenêtre — un problème résolu ne doit pas bloquer à jamais', () => {
    const t = 2_000_000;
    canKickDeadPreview(t);
    canKickDeadPreview(t + 1000);
    expect(canKickDeadPreview(t + 2000)).toBe(false);

    // au-delà de la fenêtre glissante de 5 min
    expect(canKickDeadPreview(t + 5 * 60 * 1000 + 1)).toBe(true);
  });

  it('un refus ne consomme PAS de jeton', () => {
    const t = 3_000_000;
    canKickDeadPreview(t);
    canKickDeadPreview(t);
    expect(canKickDeadPreview(t)).toBe(false);
    expect(canKickDeadPreview(t)).toBe(false);

    // toujours exactement 2 consommés : la fenêtre s'ouvre pile après 5 min
    expect(canKickDeadPreview(t + 5 * 60 * 1000 + 1)).toBe(true);
  });
});
