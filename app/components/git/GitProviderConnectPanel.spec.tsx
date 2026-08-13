/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitProviderConnectPanel } from './GitProviderConnectPanel';

describe('<GitProviderConnectPanel />', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts provider OAuth from the Git panel instead of linking to settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ provider: 'github', authorizationUrl: 'https://github.com/login/oauth/authorize' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const openMock = vi.fn().mockReturnValue({ closed: false });

    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockImplementation(openMock as unknown as typeof window.open);

    render(<GitProviderConnectPanel projectId="project_123" />);

    fireEvent.click(screen.getByRole('button', { name: /Connect GitHub from Git panel/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/oauth/github/connect',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectId: 'project_123' }),
      }),
    );
    expect(openMock).toHaveBeenCalledWith(
      'https://github.com/login/oauth/authorize',
      'e-code-github-oauth',
      'width=720,height=820,resizable=yes,scrollbars=yes',
    );
    expect(screen.queryByText('Configure remote')).toBeNull();
  });

  it('opens an in-panel custom remote drawer and saves origin through the Git panel action', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    render(<GitProviderConnectPanel projectId="project_123" workspaceId="workspace_1" defaultBranch="main" />);

    fireEvent.click(screen.getByRole('button', { name: /Add remote URL from Git panel/i }));

    const dialog = screen.getByRole('dialog', { name: /Configure Custom Remote remote/i });

    fireEvent.change(within(dialog).getByLabelText(/Remote URL/i), {
      target: { value: 'git@github.com:acme/app.git' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Default branch/i), { target: { value: 'trunk' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Save remote/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    const body = init.body as FormData;

    expect(url).toBe('/api/projects/project_123/ide-panel/git');
    expect(init.method).toBe('POST');
    expect(body.get('intent')).toBe('configure-remote');
    expect(body.get('remoteUrl')).toBe('git@github.com:acme/app.git');
    expect(body.get('branch')).toBe('trunk');
    expect(body.get('workspaceId')).toBe('workspace_1');
  });

  it('starts GitLab and Bitbucket OAuth from their provider cards', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            provider: url.includes('gitlab') ? 'gitlab' : 'bitbucket',
            authorizationUrl: url.includes('gitlab')
              ? 'https://gitlab.com/oauth/authorize'
              : 'https://bitbucket.org/site/oauth2/authorize',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const openMock = vi.fn().mockReturnValue({ closed: false });

    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'open').mockImplementation(openMock as unknown as typeof window.open);

    render(<GitProviderConnectPanel projectId="project_123" />);

    fireEvent.click(screen.getByRole('button', { name: /Connect GitLab from Git panel/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/integrations/oauth/gitlab/connect', expect.anything()),
    );

    cleanup();
    render(<GitProviderConnectPanel projectId="project_123" />);

    fireEvent.click(screen.getByRole('button', { name: /Connect Bitbucket from Git panel/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/integrations/oauth/bitbucket/connect', expect.anything()),
    );
  });
});
