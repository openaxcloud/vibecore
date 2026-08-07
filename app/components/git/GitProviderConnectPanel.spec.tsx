/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitProviderConnectPanel } from './GitProviderConnectPanel';
import type { SupportedLanguage } from '~/lib/i18n/language';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderPanel(props: ComponentProps<typeof GitProviderConnectPanel>, language: SupportedLanguage = 'en') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <GitProviderConnectPanel {...props} />
    </I18nextProvider>,
  );
}

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

    renderPanel({ projectId: 'project_123' });

    fireEvent.click(screen.getByRole('button', { name: /Connect GitHub from the Git panel/i }));

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

    renderPanel({ projectId: 'project_123', workspaceId: 'workspace_1', defaultBranch: 'main' });

    fireEvent.click(screen.getByRole('button', { name: /Add remote URL from the Git panel/i }));

    const dialog = screen.getByRole('dialog', { name: /Configure Custom Remote/i });

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

    renderPanel({ projectId: 'project_123' });

    fireEvent.click(screen.getByRole('button', { name: /Connect GitLab from the Git panel/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/integrations/oauth/gitlab/connect', expect.anything()),
    );

    cleanup();
    renderPanel({ projectId: 'project_123' });

    fireEvent.click(screen.getByRole('button', { name: /Connect Bitbucket from the Git panel/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/integrations/oauth/bitbucket/connect', expect.anything()),
    );
  });

  it('renders complete French chrome while preserving provider brands and technical values', () => {
    renderPanel(
      {
        projectId: 'project_123',
        gitRepositoryUrl: 'git@github.com:openaxcloud/vibecore.git',
        defaultBranch: 'feature/i18n-fr',
      },
      'fr',
    );

    expect(screen.getByText('Aucun dépôt distant connecté')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connecter GitHub depuis le panneau Git' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connecter GitLab depuis le panneau Git' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connecter Bitbucket depuis le panneau Git' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ajouter l’URL distante depuis le panneau Git' })).toBeTruthy();
    expect(screen.getByText('git@github.com:openaxcloud/vibecore.git')).toBeTruthy();
    expect(screen.queryByText('No remote connected yet')).toBeNull();
    expect(screen.queryByText('Choose from your GitHub repositories')).toBeNull();
  });

  it('masks raw OAuth and remote API errors in French', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Raw backend English stack detail' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    renderPanel({ projectId: 'project_123' }, 'fr');

    fireEvent.click(screen.getByRole('button', { name: 'Connecter GitHub depuis le panneau Git' }));
    expect(await screen.findByText('Impossible de lancer le flux OAuth GitHub.')).toBeTruthy();
    expect(screen.queryByText('Raw backend English stack detail')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’URL distante depuis le panneau Git' }));

    const dialog = screen.getByRole('dialog', { name: 'Configurer Dépôt distant personnalisé' });
    fireEvent.change(within(dialog).getByLabelText('URL distante'), {
      target: { value: 'git@github.com:openaxcloud/vibecore.git' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le dépôt distant' }));

    expect(await within(dialog).findByText('Impossible de configurer ce dépôt Git distant.')).toBeTruthy();
    expect(within(dialog).queryByText('Raw backend English stack detail')).toBeNull();
  });

  it('localizes repository states without translating repository data', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/github-stats') {
        return new Response(
          JSON.stringify({
            repos: [
              {
                id: 42,
                full_name: 'openaxcloud/vibecore',
                html_url: 'https://github.com/openaxcloud/vibecore',
                clone_url: 'https://github.com/openaxcloud/vibecore.git',
                default_branch: 'main',
                private: true,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    renderPanel({ projectId: 'project_123' }, 'fr');

    fireEvent.click(screen.getByRole('button', { name: 'Choisir parmi vos dépôts GitHub' }));

    expect(await screen.findByText('openaxcloud/vibecore')).toBeTruthy();
    expect(screen.getByText('privé')).toBeTruthy();
    expect(screen.getByPlaceholderText('propriétaire/nom')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /openaxcloud\/vibecore/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const configureCall = fetchMock.mock.calls[1];
    const body = configureCall[1]?.body as FormData;
    expect(body.get('remoteUrl')).toBe('https://github.com/openaxcloud/vibecore.git');
    expect(body.get('branch')).toBe('main');
  });
});
