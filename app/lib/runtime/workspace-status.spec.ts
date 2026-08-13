import { describe, expect, it } from 'vitest';
import { hasLivePreviewPort, isWorkspaceReallyRunning, workspaceUiState } from './workspace-status';

describe('workspace status helpers', () => {
  it('does not treat a null workspace as running even when stale ports exist', () => {
    expect(isWorkspaceReallyRunning(null, [{ port: 5173 }])).toBe(false);
    expect(workspaceUiState(null, { ports: [{ port: 5173 }] })).toBe('stopped');
  });

  it('hasLivePreviewPort requires a serving indicator, not mere port presence', () => {
    expect(hasLivePreviewPort([{ port: 5173 }])).toBe(false);
    expect(hasLivePreviewPort([{ port: 5173, ready: true }])).toBe(true);
    expect(hasLivePreviewPort([{ port: 5173, url: 'https://x.preview' }])).toBe(true);

    // The previews store exposes the forwarded URL as baseUrl, not url.
    expect(hasLivePreviewPort([{ port: 5173, baseUrl: 'https://x.preview' }])).toBe(true);
  });

  it('treats a genuinely-serving port as running even while the status field lags at PENDING', () => {
    /*
     * Cold-start: pod already serving the app, but the backend status has not
     * reconciled PENDING→RUNNING yet. The live port is the ground truth.
     */
    expect(isWorkspaceReallyRunning({ status: 'PENDING' }, [{ port: 5173, ready: true }])).toBe(true);
    expect(isWorkspaceReallyRunning({ status: 'PENDING' }, [{ port: 5173, baseUrl: 'https://x.preview' }])).toBe(true);
    expect(workspaceUiState({ status: 'PENDING' }, { ports: [{ port: 5173, baseUrl: 'https://x.preview' }] })).toBe(
      'running',
    );

    // Without a serving port a PENDING workspace is not running.
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
