// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AGENT-MOBILE-04/09, point 1 — la liste d'actions d'un artefact, telle qu'elle
 * est RENDUE : ce spec lit le DOM, pas le source.
 *
 * Le pendant stylistique (`app/styles/agent-action-list-density.spec.ts`) fige
 * les règles ; celui-ci garantit que les éléments rendus portent bien les
 * classes que ces règles ciblent — sinon une règle juste ne s'applique à rien.
 */

const { actionsStore, artifactsStore, currentViewStore, showWorkbenchStore } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Vitest mock state must be created in the hoisted closure.
  const { atom, map } = require('nanostores') as typeof import('nanostores');

  return {
    actionsStore: map<Record<string, Record<string, unknown>>>({}),
    artifactsStore: map<Record<string, Record<string, unknown>>>({}),
    currentViewStore: atom<'code' | 'diff' | 'preview'>('code'),
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
    showWorkbench: showWorkbenchStore,
    setSelectedFile: vi.fn(),
  },
}));

import { Artifact } from './Artifact';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderNovaMarket() {
  actionsStore.set({
    'package.json': { type: 'file', filePath: 'package.json', content: '{}', status: 'complete' },
    'src/types.ts': { type: 'file', filePath: 'src/types.ts', content: '', status: 'complete' },
    'src/data/catalog.ts': { type: 'file', filePath: 'src/data/catalog.ts', content: '', status: 'running' },
  });
  artifactsStore.set({
    'nova-market': {
      id: 'nova-market',
      title: 'Nova Market',
      type: 'regular',
      closed: false,
      runner: { actions: actionsStore },
    },
  });

  return render(
    <I18nextProvider i18n={createI18nInstance('fr')}>
      <Artifact artifactId="nova-market" messageId="assistant-message" />
    </I18nextProvider>,
  );
}

describe('<Artifact /> — densité de la liste d’actions', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
    actionsStore.set({});
    artifactsStore.set({});
    currentViewStore.set('code');
    showWorkbenchStore.set(false);
  });

  afterEach(cleanup);

  it('rend chaque ligne dans une liste espacée en pixels, sans plancher rem de 44px dans le flux', () => {
    const { container } = renderNovaMarket();
    const liste = container.querySelector('ul.bolt-action-list');

    expect(liste, 'la liste ne porte pas bolt-action-list').not.toBeNull();
    expect(liste!.className).not.toMatch(/space-y-/);

    const lignes = container.querySelectorAll('.bolt-action-row');
    expect(lignes).toHaveLength(3);

    for (const ligne of lignes) {
      // Le repli <details> d'une commande shell est hors sujet : ici, que des fichiers.
      expect(ligne.querySelector('[class*="min-h-11"]')).toBeNull();
    }
  });

  it('garde une cible tactile sur chaque fichier et peint le chemin sur le `code`', () => {
    const { container } = renderNovaMarket();

    const bouton = container.querySelector<HTMLButtonElement>('.bolt-action-row button.bolt-action-target');
    expect(bouton, 'le bouton du fichier ne porte pas bolt-action-target').not.toBeNull();
    expect(bouton!.getAttribute('aria-label')).toContain('package.json');
    expect(bouton!.className).not.toContain('bg-bolt-elements-artifacts-inlineCode-background');

    const code = bouton!.querySelector('code');
    expect(code?.className).toContain('bolt-action-file-path');
    expect(code?.className).toContain('bg-bolt-elements-artifacts-inlineCode-background');
    expect(code?.textContent).toBe('package.json');
  });

  it('met la pastille de statut sur la classe que la feuille ramène au jeton du code', () => {
    const { container } = renderNovaMarket();

    const pastilles = [...container.querySelectorAll('.bolt-action-row .bolt-action-status')];
    const textes = pastilles.map((p) => p.textContent);

    expect(textes).toEqual(['Terminé', 'Terminé', 'En cours']);
  });
});
