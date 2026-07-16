/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectResourcesPopover } from './ProjectResourcesPopover';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const MONITORING_PAYLOAD = {
  panel: 'monitoring',
  status: 'ok',
  data: {
    selectedWorkspaceId: 'workspace_1',
    runtimeStatus: { id: 'workspace_1', status: 'running' },
    files: [
      { path: 'src/App.tsx', sizeBytes: 1024 },
      { path: 'package.json', sizeBytes: 512 },
    ],
  },
};

describe('<ProjectResourcesPopover />', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows a skeleton, then only real measured storage while CPU and RAM stay unavailable', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;

    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    render(<ProjectResourcesPopover projectId="project_1" projectName="Analytics App" workspaceId="workspace_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Resources for Analytics App' }));

    expect(screen.getByRole('dialog', { name: 'Resources for Analytics App' })).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Loading project resources' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project_1/ide-panel/monitoring?workspaceId=workspace_1',
      expect.objectContaining({ credentials: 'include', headers: { Accept: 'application/json' } }),
    );

    resolveFetch?.(
      new Response(JSON.stringify(MONITORING_PAYLOAD), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const storage = await screen.findByTestId('project-resource-storage');
    const cpu = screen.getByTestId('project-resource-cpu');
    const memory = screen.getByTestId('project-resource-memory');

    expect(within(storage).getByText('1.5 KB')).toBeTruthy();
    expect(within(storage).getByText(/2 indexed project files/i)).toBeTruthy();
    expect(within(cpu).getByText('Unavailable')).toBeTruthy();
    expect(within(memory).getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('Runtime Running')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Resources for Analytics App' })).toBeNull());
  });

  it('surfaces a recoverable error and retries the same real endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Monitoring is temporarily unavailable' } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MONITORING_PAYLOAD), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    render(<ProjectResourcesPopover projectId="project_1" projectName="Analytics App" />);

    fireEvent.click(screen.getByRole('button', { name: 'Resources for Analytics App' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Monitoring is temporarily unavailable');

    /* Radix marks its zero-layout jsdom wrapper hidden, so click the rendered control directly. */
    const retryButton = alert.querySelector<HTMLButtonElement>('button');
    expect(retryButton?.getAttribute('aria-label')).toBe('Retry loading project resources');
    fireEvent.click(retryButton!);

    await waitFor(() => expect(screen.getByTestId('project-resource-storage')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/project_1/ide-panel/monitoring');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/projects/project_1/ide-panel/monitoring');
  });
});
