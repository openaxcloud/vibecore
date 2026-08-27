/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectEditorToolbar } from './ProjectEditorToolbar';
import { projectIdeEn, projectIdeFr } from '~/lib/i18n/catalogs/project-ide';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

const handlers = () => ({
  onToggleMinimap: vi.fn(),
  onFormat: vi.fn(),
  onGoToDefinition: vi.fn(),
  onFindReferences: vi.fn(),
  onRenameSymbol: vi.fn(),
  onRefactor: vi.fn(),
  onSave: vi.fn(),
});

describe('ProjectEditorToolbar i18n', () => {
  it('keeps exact EN/FR catalog parity', () => {
    expect(Object.keys(projectIdeFr).sort()).toEqual(Object.keys(projectIdeEn).sort());
  });

  it('renders all editor actions and accessible groups in French', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <ProjectEditorToolbar fileLabel="/src/App.tsx" hasDocument minimapEnabled={false} {...handlers()} />
      </I18nextProvider>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Actions de l’éditeur' });
    expect(within(toolbar).getByRole('group', { name: 'Affichage' })).toBeTruthy();
    expect(within(toolbar).getByRole('group', { name: 'Navigation' })).toBeTruthy();
    expect(within(toolbar).getByRole('group', { name: 'Édition' })).toBeTruthy();
    expect(within(toolbar).getByRole('group', { name: 'Enregistrement' })).toBeTruthy();

    for (const label of [
      'Minicarte',
      'Définition',
      'Références',
      'Formater',
      'Renommer',
      'Refactoriser',
      'Enregistrer',
    ]) {
      expect(within(toolbar).getByRole('button', { name: label })).toBeTruthy();
    }

    expect(screen.getByText('/src/App.tsx')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b(?:Definition|References|Format|Rename|Refactor|Save)\b/);
  });

  it('localizes Monaco-only tooltips without enabling unsupported actions', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <ProjectEditorToolbar
          fileLabel="/src/App.tsx"
          hasDocument
          minimapEnabled
          monacoActive={false}
          {...handlers()}
        />
      </I18nextProvider>,
    );

    for (const label of ['Définition', 'Références', 'Renommer', 'Refactoriser']) {
      const button = screen.getByRole('button', { name: label });
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.getAttribute('title')).toBe('Disponible avec l’éditeur Monaco');
    }

    expect(screen.getByRole('button', { name: 'Formater' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Enregistrer' }).hasAttribute('disabled')).toBe(false);
  });
});
