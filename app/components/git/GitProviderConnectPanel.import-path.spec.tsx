/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitProviderConnectPanel } from './GitProviderConnectPanel';
import { createI18nInstance } from '~/lib/i18n/runtime';

const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('react-toastify', () => ({ toast }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const cases = [
  {
    language: 'en' as const,
    picker: 'Choose from your GitHub repositories',
    action: 'Use as Git origin',
    explanation: 'Choosing a repository sets this workspace’s Git origin. Its files are not imported.',
    link: 'Import a repository into a new project',
    success: 'Git origin configured for main. Files were not imported.',
    error: 'Unable to configure this Git remote.',
  },
  {
    language: 'fr' as const,
    picker: 'Choisir parmi vos dépôts GitHub',
    action: 'Utiliser comme origine Git',
    explanation: 'Choisir un dépôt définit l’origine Git de cet espace de travail. Ses fichiers ne sont pas importés.',
    link: 'Importer un dépôt dans un nouveau projet',
    success: 'Origine Git configurée pour la branche main. Les fichiers n’ont pas été importés.',
    error: 'Impossible de configurer ce dépôt Git distant.',
  },
];

for (const copy of cases) {
  describe(copy.language, () => {
    function open(status = 200) {
      const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST'
          ? Response.json({ error: 'private backend detail' }, { status })
          : Response.json({
              repos: [
                {
                  id: 1,
                  full_name: 'isolated/repo',
                  clone_url: 'https://example.invalid/repo.git',
                  default_branch: 'main',
                  private: false,
                },
              ],
            }),
      );
      vi.stubGlobal('fetch', fetchMock);
      render(
        <I18nextProvider i18n={createI18nInstance(copy.language)}>
          <GitProviderConnectPanel projectId="isolated" />
        </I18nextProvider>,
      );

      return fetchMock;
    }
    it('separates configuring origin from the existing import route before selection', async () => {
      const fetchMock = open();
      expect(screen.getByText(copy.explanation)).toBeTruthy();

      const link = screen.getByRole('link', { name: copy.link });
      expect(link.getAttribute('href')).toBe('/import-github');
      expect(link.getAttribute('target')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: copy.picker }));

      const repository = await screen.findByRole('button', { name: /isolated\/repo/ });
      expect(repository.textContent).toContain(copy.action);
    });
    it('reports remote success without claiming files were imported', async () => {
      const fetchMock = open();
      fireEvent.click(screen.getByRole('button', { name: copy.picker }));
      fireEvent.click(await screen.findByRole('button', { name: /isolated\/repo/ }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(copy.success));

      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(posts).toHaveLength(1);
      expect(posts[0][0]).toBe('/api/projects/isolated/ide-panel/git');
      expect((posts[0][1]?.body as FormData).get('intent')).toBe('configure-remote');
    });
    it('keeps the origin failure visible without a success toast or implicit import', async () => {
      const fetchMock = open(503);
      fireEvent.click(screen.getByRole('button', { name: copy.picker }));
      fireEvent.click(await screen.findByRole('button', { name: /isolated\/repo/ }));
      expect((await screen.findByRole('alert')).textContent).toBe(copy.error);
      expect(screen.queryByText('private backend detail')).toBeNull();
      expect(toast.success).not.toHaveBeenCalled();
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    });
  });
}
