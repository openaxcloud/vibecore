import { describe, expect, it } from 'vitest';
import { hasLivePreviewPort, isWorkspaceReallyRunning, workspaceUiState } from './workspace-status';

describe('workspace status helpers', () => {
  it('does not treat a null workspace as running even when stale ports exist', () => {
    expect(isWorkspaceReallyRunning(null, [{ port: 5173 }])).toBe(false);
    expect(workspaceUiState(null, { ports: [{ port: 5173 }] })).toBe('stopped');
  });

  it('hasLivePreviewPort requires a PROBED-ready port, not merely a URL', () => {
    expect(hasLivePreviewPort([{ port: 5173 }])).toBe(false);
    expect(hasLivePreviewPort([{ port: 5173, ready: true }])).toBe(true);
  });

  /*
   * REGRESSION — SOLUTIONS_REAL_PROOF_BLOCKERS.md §5.
   *
   * These four cases previously asserted `true`, encoding the very lie that
   * produced "Workspace RUNNING + port open + 0 Problems + blank webview": the
   * API stamps a URL on EVERY port it reports (pure string templating, never a
   * network call — even a `close` event carries one), and the previews store
   * refuses to create an entry without a URL. Accepting `url`/`baseUrl` as a
   * serving signal therefore made the predicate vacuously true, and a port that
   * had died still read as live forever.
   *
   * A URL now proves only that a port was once forwarded. Readiness comes solely
   * from the HTTP probe.
   */
  it('does NOT treat a URL-bearing port as serving', () => {
    expect(hasLivePreviewPort([{ port: 5173, url: 'https://x.preview' }])).toBe(false);
    expect(hasLivePreviewPort([{ port: 5173, baseUrl: 'https://x.preview' }])).toBe(false);

    // A port explicitly probed not-ready is not live no matter what URL it carries.
    expect(hasLivePreviewPort([{ port: 5173, ready: false, baseUrl: 'https://x.preview' }])).toBe(false);
  });

  it('treats a genuinely-serving port as running even while the status field lags at PENDING', () => {
    /*
     * Cold-start: pod already serving the app, but the backend status has not
     * reconciled PENDING→RUNNING yet. A PROBED-ready port is the ground truth.
     */
    expect(isWorkspaceReallyRunning({ status: 'PENDING' }, [{ port: 5173, ready: true }])).toBe(true);
    expect(workspaceUiState({ status: 'PENDING' }, { ports: [{ port: 5173, ready: true }] })).toBe('running');

    // A URL alone no longer promotes a PENDING workspace to running.
    expect(isWorkspaceReallyRunning({ status: 'PENDING' }, [{ port: 5173, baseUrl: 'https://x.preview' }])).toBe(false);
    expect(isWorkspaceReallyRunning({ status: 'PENDING' }, [{ port: 5173 }])).toBe(false);
  });

  it('requires a running workspace and at least one port', () => {
    expect(isWorkspaceReallyRunning({ status: 'running' }, [])).toBe(false);
    expect(isWorkspaceReallyRunning({ status: 'running' }, [{ port: 5173 }])).toBe(true);
    expect(isWorkspaceReallyRunning({ status: 'stopped', ports: [{ port: 5173 }] })).toBe(false);
  });

  it('maps running-without-ports to starting instead of running', () => {
    expect(workspaceUiState({ status: 'running' }, { ports: [] })).toBe('starting');
    expect(workspaceUiState({ status: 'running' }, { ports: [{ port: 5173 }] })).toBe('running');
  });
});
