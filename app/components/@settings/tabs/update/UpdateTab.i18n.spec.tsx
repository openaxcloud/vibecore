/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('react-toastify', () => ({ toast: toastMock }));

import UpdateTab from './UpdateTab';
import { createI18nInstance } from '~/lib/i18n/runtime';

function streamResponse(payloads: unknown[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`${payloads.map((payload) => JSON.stringify(payload)).join('\n')}\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toastMock.error.mockReset();
  toastMock.success.mockReset();
});

describe('update tab i18n', () => {
  it('switches the idle state from French to English', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <UpdateTab />
      </I18nextProvider>,
    );

    expect(screen.getByText('Statut des mises à jour')).toBeTruthy();
    expect(screen.getByText('Recherchez les modifications sur upstream/main.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rechercher les mises à jour' })).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('Update status')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeTruthy();
  });

  it('renders a validated French update result and preserves repository data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        streamResponse([
          {
            stage: 'complete',
            message: 'Raw server completion message.',
            progress: 100,
            details: {
              updateReady: true,
              currentCommit: 'abc123',
              remoteCommit: 'def456',
              additions: 1234,
              deletions: 2,
              compareUrl: 'https://github.com/openaxcloud/vibecore/compare/abc123...def456',
              commitMessages: ['fix: preserve repository content'],
              changedFiles: ['src/runtime/update.ts'],
              changelog: 'v2.0.0',
            },
          },
        ]),
      ),
    );

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <UpdateTab />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechercher les mises à jour' }));

    expect(await screen.findByText('Des mises à jour sont disponibles pour examen.')).toBeTruthy();
    expect(screen.getByText('Version actuelle')).toBeTruthy();
    expect(screen.getByText('abc123')).toBeTruthy();
    expect(screen.getByText('def456')).toBeTruthy();
    expect(screen.getByText('1 commit')).toBeTruthy();
    expect(screen.getByText('1 fichier modifié')).toBeTruthy();
    expect(screen.getByText('fix: preserve repository content')).toBeTruthy();
    expect(screen.getByText('src/runtime/update.ts')).toBeTruthy();
    expect(screen.queryByText('Raw server completion message.')).toBeNull();
    expect(screen.getByRole('link', { name: /Comparer les modifications/u }).getAttribute('href')).toContain(
      'abc123...def456',
    );
    expect(toastMock.success).toHaveBeenCalledWith('Des mises à jour sont disponibles pour examen.');
  });

  it('masks HTTP and stream errors with recoverable localized feedback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Private upstream failure.', { status: 502 })));

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <UpdateTab />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rechercher les mises à jour' }));

    await waitFor(() => {
      expect(screen.getByText('Impossible de rechercher les mises à jour. Réessayez.')).toBeTruthy();
    });
    expect(screen.queryByText('Private upstream failure.')).toBeNull();
    expect(toastMock.error).toHaveBeenCalledWith('Impossible de rechercher les mises à jour. Réessayez.');
  });
});
