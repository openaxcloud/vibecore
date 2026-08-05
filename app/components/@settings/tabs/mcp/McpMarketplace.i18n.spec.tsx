/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import McpMarketplace from './McpMarketplace';
import { createI18nInstance } from '~/lib/i18n/runtime';

const catalogEntry = {
  id: 'catalog-filesystem',
  slug: 'filesystem',
  name: 'Système de fichiers',
  description: 'Lecture, écriture et recherche de fichiers dans une arborescence autorisée.',
  domain: 'FILESYSTEM',
  tags: ['fichiers', 'officiel', 'référence'],
  author: 'modelcontextprotocol',
  homepageUrl: null,
  iconUrl: null,
  version: '0.7.0',
  transport: 'STDIO',
  configTemplate: {},
  configSchema: {
    type: 'object',
    properties: {
      rootDir: {
        type: 'string',
        title: 'Répertoire racine autorisé',
        description: 'Chemin absolu auquel le serveur est autorisé à accéder.',
      },
    },
    required: ['rootDir'],
  },
  installCount: 1,
  featured: true,
  verified: true,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('McpMarketplace dynamic French copy', () => {
  it('requests the active locale and renders localized API fields, including config labels', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/mcp/catalog/domains') {
        return Promise.resolve(
          new Response(JSON.stringify({ domains: [{ domain: 'FILESYSTEM', count: 1 }] }), { status: 200 }),
        );
      }

      if (url.startsWith('/api/mcp/catalog?')) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [catalogEntry], nextCursor: null }), { status: 200 }),
        );
      }

      if (url.startsWith('/api/mcp/installs?')) {
        if (init?.method === 'POST') {
          return Promise.resolve(
            new Response(JSON.stringify({ install: { id: 'install-1', catalogEntry } }), { status: 201 }),
          );
        }

        return Promise.resolve(new Response(JSON.stringify({ installs: [] }), { status: 200 }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <McpMarketplace />
      </I18nextProvider>,
    );

    expect((await screen.findAllByText('Système de fichiers')).length).toBeGreaterThan(0);
    expect(screen.getByText(catalogEntry.description)).toBeInTheDocument();
    expect(screen.getByText('officiel')).toBeInTheDocument();
    expect(screen.queryByText('Filesystem')).not.toBeInTheDocument();

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url));

      expect(requestedUrls.some((url) => url.includes('/api/mcp/catalog?') && url.includes('locale=fr'))).toBe(true);
      expect(requestedUrls).toContain('/api/mcp/installs?locale=fr');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Installer' }));

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveTextContent('Installer Système de fichiers');
    expect(screen.getByLabelText(/Répertoire racine autorisé/u)).toBeInTheDocument();
    expect(screen.getByText('Chemin absolu auquel le serveur est autorisé à accéder.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Répertoire racine autorisé/u), { target: { value: '/workspace' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Installer' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/mcp/installs?locale=fr',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
