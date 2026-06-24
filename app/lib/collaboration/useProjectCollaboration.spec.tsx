/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const collaborationMock = vi.hoisted(() => {
  class MockProjectCollaborationClient {
    static instances: MockProjectCollaborationClient[] = [];
    readonly sessionId: string;
    snapshot: any;
    connect = vi.fn();
    close = vi.fn();
    updatePresence = vi.fn();
    listeners = new Set<(snapshot: any) => void>();

    constructor(readonly options: any) {
      this.sessionId = options.sessionId ?? 'session';
      this.snapshot = { status: 'idle', sessionId: this.sessionId, presence: [], comments: [] };
      MockProjectCollaborationClient.instances.push(this);
    }

    subscribe(listener: (snapshot: any) => void) {
      this.listeners.add(listener);
      listener(this.snapshot);

      return () => {
        this.listeners.delete(listener);
      };
    }
  }

  return { MockProjectCollaborationClient };
});

vi.mock('./projectCollaborationClient', () => ({
  ProjectCollaborationClient: collaborationMock.MockProjectCollaborationClient,
}));

import { useProjectCollaboration } from './useProjectCollaboration';

describe('useProjectCollaboration', () => {
  beforeEach(() => {
    collaborationMock.MockProjectCollaborationClient.instances = [];
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  it('shares one collaboration client for multiple project consumers in the same tab', async () => {
    const { unmount } = renderHook(() => {
      useProjectCollaboration({ projectId: 'project-1', enabled: true, mode: 'editing' });
      useProjectCollaboration({
        projectId: 'project-1',
        enabled: true,
        filePath: 'src/App.tsx',
        mode: 'editing',
      });
    });

    await waitFor(() => {
      expect(collaborationMock.MockProjectCollaborationClient.instances).toHaveLength(1);
    });

    const client = collaborationMock.MockProjectCollaborationClient.instances[0];
    await waitFor(() => {
      expect(client.updatePresence).toHaveBeenCalledWith({
        status: 'online',
        filePath: undefined,
        mode: 'editing',
      });
      expect(client.updatePresence).toHaveBeenCalledWith({
        status: 'online',
        filePath: 'src/App.tsx',
        mode: 'editing',
      });
    });

    vi.useFakeTimers();
    unmount();

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(client.close).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it('sends an explicit filePath clear when the open file is closed', async () => {
    const { rerender } = renderHook(
      ({ filePath }: { filePath?: string }) =>
        useProjectCollaboration({ projectId: 'project-3', enabled: true, filePath, mode: 'editing' }),
      { initialProps: { filePath: 'src/App.tsx' as string | undefined } },
    );

    await waitFor(() => {
      expect(collaborationMock.MockProjectCollaborationClient.instances).toHaveLength(1);
    });

    const client = collaborationMock.MockProjectCollaborationClient.instances[0];
    await waitFor(() => {
      expect(client.updatePresence).toHaveBeenCalledWith({
        status: 'online',
        filePath: 'src/App.tsx',
        mode: 'editing',
      });
    });

    // Close the file: the consumer now passes filePath: undefined.
    rerender({ filePath: undefined });

    await waitFor(() => {
      expect(client.updatePresence).toHaveBeenCalledWith({
        status: 'online',
        filePath: undefined,
        mode: 'editing',
      });
    });
  });

  it('reuses the shared client when a strict-mode remount happens immediately', async () => {
    const first = renderHook(() => useProjectCollaboration({ projectId: 'project-2', enabled: true }));

    await waitFor(() => {
      expect(collaborationMock.MockProjectCollaborationClient.instances).toHaveLength(1);
    });

    const client = collaborationMock.MockProjectCollaborationClient.instances[0];
    vi.useFakeTimers();
    first.unmount();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const second = renderHook(() => useProjectCollaboration({ projectId: 'project-2', enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(collaborationMock.MockProjectCollaborationClient.instances).toHaveLength(1);
    expect(client.close).not.toHaveBeenCalled();

    second.unmount();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });
});
