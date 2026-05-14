import { describe, expect, it } from 'vitest';
import { isWorkspaceReallyRunning, workspaceUiState } from './workspace-status';

describe('workspace status helpers', () => {
  it('does not treat a null workspace as running even when stale ports exist', () => {
    expect(isWorkspaceReallyRunning(null, [{ port: 5173 }])).toBe(false);
    expect(workspaceUiState(null, { ports: [{ port: 5173 }] })).toBe('stopped');
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
