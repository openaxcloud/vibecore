/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { actionsStore, artifactsStore, currentViewStore, showWorkbenchStore, startPreviewServerMock } = vi.hoisted(
  () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Vitest mock state must be created in the hoisted closure.
    const { atom, map } = require('nanostores') as typeof import('nanostores');

    return {
      actionsStore: map<Record<string, Record<string, unknown>>>({}),
      artifactsStore: map<Record<string, Record<string, unknown>>>({}),
      currentViewStore: atom('code'),
      showWorkbenchStore: atom(false),
      startPreviewServerMock: vi.fn(async () => undefined),
    };
  },
);

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
    setSelectedFile: vi.fn(),
    showWorkbench: showWorkbenchStore,
    startPreviewServer: (...args: unknown[]) => startPreviewServerMock(...(args as [])),
  },
}));

import { Artifact } from './Artifact';
import { createI18nInstance } from '~/lib/i18n/runtime';

function rendre(langue: 'en' | 'fr' = 'fr') {
  return render(
    <I18nextProvider i18n={createI18nInstance(langue)}>
      <Artifact artifactId="artefact-demarrage" messageId="assistant-message" />
    </I18nextProvider>,
  );
}

describe('« Démarrer l’application » lance vraiment le serveur', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
    currentViewStore.set('code');
    showWorkbenchStore.set(false);
    startPreviewServerMock.mockClear();
    actionsStore.set({
      demarrage: { type: 'start', content: 'npm run dev', status: 'complete' },
    });
    artifactsStore.set({
      'artefact-demarrage': {
        id: 'artefact-demarrage',
        title: 'Boutique',
        closed: false,
        runner: { actions: actionsStore },
      },
    });
  });

  afterEach(cleanup);

  /*
   * LE DÉFAUT QUE CE TEST ÉPINGLE.
   *
   * Le bouton ne faisait que `currentView.set('preview')`. Il basculait la vue
   * et ne lançait RIEN : l'utilisateur cliquait « Démarrer l'application » et
   * arrivait sur un aperçu vide. Le libellé promettait ce que le geste ne
   * faisait pas. Aucun test du dépôt ne contenait « Start application » —
   * mesuré le 2026-09-08 sur `app/` et `tests/`.
   */
  it('appelle startPreviewServer au clic', async () => {
    rendre();

    const bouton = await screen.findByRole('button', { name: 'Démarrer l’application' });
    bouton.click();

    expect(startPreviewServerMock).toHaveBeenCalledTimes(1);
  });

  it('bascule aussi la vue sur l’aperçu, pour qu’on voie le démarrage', async () => {
    rendre();

    const bouton = await screen.findByRole('button', { name: 'Démarrer l’application' });
    bouton.click();

    expect(currentViewStore.get()).toBe('preview');
  });

  /*
   * LA MOITIÉ INVERSE (règle 6) : une action qui n'est PAS un démarrage ne doit
   * rien lancer. Sans cette assertion, câbler `startPreviewServer` sur toutes
   * les actions passerait les deux tests ci-dessus au vert — et relancerait le
   * serveur à chaque clic sur un fichier.
   */
  it('ne lance rien pour une action qui n’est pas un démarrage', async () => {
    actionsStore.set({
      fichier: { type: 'file', filePath: 'src/App.tsx', content: 'export const a = 1;', status: 'complete' },
    });

    rendre();

    await screen.findByText('src/App.tsx');
    expect(startPreviewServerMock).not.toHaveBeenCalled();
  });
});
