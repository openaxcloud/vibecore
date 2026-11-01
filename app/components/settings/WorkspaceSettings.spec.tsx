/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceSettings } from './WorkspaceSettings';
import { REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY } from '~/lib/hooks/useAutoApplyEnabled';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderWorkspace(language: 'en' | 'fr' = 'en') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <WorkspaceSettings language={language} />
    </I18nextProvider>,
  );
}

describe('WorkspaceSettings — Require review of AI changes toggle', () => {
  beforeEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
  });

  afterEach(() => {
    window.localStorage.removeItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY);
    cleanup();
  });

  it.each([null, 'true', 'false'])(
    'shows the automatic policy without a review toggle for stored value %s',
    (value) => {
      if (value !== null) {
        window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, value);
      }

      renderWorkspace();
      expect(screen.queryByLabelText('Require review of AI changes')).toBeNull();
      expect(window.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY)).toBe(value);
    },
  );

  it('renders all workspace and theme controls in professional French', () => {
    renderWorkspace('fr');

    expect(screen.getByRole('heading', { name: 'Paramètres de l’espace de travail' })).toBeTruthy();
    expect(screen.getByText('Retour automatique à la ligne')).toBeTruthy();
    expect(screen.getByText('Formater lors de l’enregistrement')).toBeTruthy();
    expect(screen.queryByLabelText('Exiger la validation des modifications de l’IA')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Thème' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Clair' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Sombre' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Système' })).toBeTruthy();
    expect(screen.getByText('.replit')).toBeTruthy();
    expect(screen.queryByText('Workspace Settings')).toBeNull();

    const themeControl = screen.getByRole('radiogroup', { name: 'Thème' });

    expect(themeControl.className).toContain('flex-wrap');
  });
});
