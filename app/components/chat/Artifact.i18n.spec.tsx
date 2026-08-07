/** @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { actionsStore, artifactsStore, currentViewStore, selectedFileMock, showWorkbenchStore } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Vitest mock state must be created in the hoisted closure.
  const { atom, map } = require('nanostores') as typeof import('nanostores');

  return {
    actionsStore: map<Record<string, Record<string, unknown>>>({}),
    artifactsStore: map<Record<string, Record<string, unknown>>>({}),
    currentViewStore: atom('code'),
    selectedFileMock: vi.fn(),
    showWorkbenchStore: atom(false),
  };
});

vi.mock('shiki', () => ({
  createHighlighter: vi.fn(async () => ({
    codeToHtml: (code: string) => `<pre><code>${code}</code></pre>`,
  })),
}));

vi.mock('~/lib/stores/theme', async () => {
  const { atom } = await vi.importActual<typeof import('nanostores')>('nanostores');

  return { themeStore: atom('light') };
});

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    artifacts: artifactsStore,
    currentView: currentViewStore,
    setSelectedFile: selectedFileMock,
    showWorkbench: showWorkbenchStore,
  },
}));

import { Artifact } from './Artifact';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderArtifact(artifactId: string, language: 'en' | 'fr' = 'en') {
  const i18n = createI18nInstance(language);

  const result = render(
    <I18nextProvider i18n={i18n}>
      <Artifact artifactId={artifactId} messageId="assistant-message" />
    </I18nextProvider>,
  );

  return { ...result, i18n };
}

describe('<Artifact /> i18n', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
    actionsStore.set({});
    artifactsStore.set({});
    currentViewStore.set('code');
    showWorkbenchStore.set(false);
    selectedFileMock.mockClear();
  });

  afterEach(cleanup);

  it('localizes bundled restore states live and never renders the raw runner error', async () => {
    actionsStore.set({
      restore: {
        type: 'file',
        filePath: 'src/App.tsx',
        content: 'export const locale = "fr";',
        status: 'running',
      },
    });
    artifactsStore.set({
      'restored-project-setup': {
        id: 'restored-project-setup',
        title: 'Snapshot restore',
        type: 'bundled',
        closed: false,
        runner: { actions: actionsStore },
      },
    });

    const { i18n } = renderArtifact('restored-project-setup', 'fr');

    expect(screen.getByText('Restauration du projet…')).toBeTruthy();
    expect(screen.getByText('Ouvrir l’espace de travail')).toBeTruthy();
    expect(screen.getByText('Création des fichiers initiaux')).toBeTruthy();

    act(() => {
      actionsStore.set({
        restore: {
          type: 'file',
          filePath: 'src/App.tsx',
          content: 'export const locale = "fr";',
          status: 'failed',
          error: 'EACCES: upstream secret detail',
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Échec de la restauration du projet')).toBeTruthy();
    });
    expect(screen.getByText('L’action a échoué. Vérifiez l’étape concernée, puis réessayez.')).toBeTruthy();
    expect(screen.queryByText(/EACCES|upstream secret detail/i)).toBeNull();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('Project restore failed')).toBeTruthy();
    expect(screen.getByText('The action failed. Review the failed step and try again.')).toBeTruthy();
  });

  it('localizes action chrome while preserving file paths and shell commands', async () => {
    actionsStore.set({
      file: {
        type: 'file',
        filePath: 'src/Écran.tsx',
        content: 'export const Écran = true;',
        status: 'complete',
      },
      shell: {
        type: 'shell',
        content: 'pnpm run build --filter @vibecore/web',
        status: 'failed',
        error: 'TOKEN=must-not-render',
      },
    });
    artifactsStore.set({
      application: {
        id: 'application',
        title: 'Customer application',
        type: 'standard',
        closed: false,
        runner: { actions: actionsStore },
      },
    });

    renderArtifact('application', 'fr');

    await waitFor(() => {
      expect(screen.getByText('Créer')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Ouvrir src/Écran.tsx' })).toBeTruthy();
    expect(screen.getByText('Exécuter la commande')).toBeTruthy();
    expect(screen.getByText('pnpm run build --filter @vibecore/web')).toBeTruthy();
    expect(screen.getByText('Cette action a échoué. Vérifiez la commande ou le fichier, puis réessayez.')).toBeTruthy();
    expect(screen.queryByText(/TOKEN=must-not-render/i)).toBeNull();
  });
});
