/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('defaults to off (auto-apply) and turns review on when toggled', () => {
    renderWorkspace();

    const toggle = screen.getByLabelText('Require review of AI changes') as HTMLInputElement;

    // Default: off → auto-apply.
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    expect(window.localStorage.getItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY)).toBe('true');
    expect((screen.getByLabelText('Require review of AI changes') as HTMLInputElement).checked).toBe(true);
  });

  it('gives the page a level-1 heading, and only one', () => {
    renderWorkspace();

    const level1 = screen.getAllByRole('heading', { level: 1 });

    expect(level1).toHaveLength(1);
    expect(level1[0].textContent).toBe('Workspace settings');

    // Section titles stay below it rather than competing with it.
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(0);
  });

  it('reflects a persisted "on" value on load', () => {
    window.localStorage.setItem(REQUIRE_AI_CHANGE_REVIEW_STORAGE_KEY, 'true');

    renderWorkspace();

    expect((screen.getByLabelText('Require review of AI changes') as HTMLInputElement).checked).toBe(true);
  });

  it('renders all workspace and theme controls in professional French', () => {
    renderWorkspace('fr');

    expect(screen.getByRole('heading', { name: 'Paramètres de l’espace de travail', level: 1 })).toBeTruthy();
    expect(screen.getByText('Retour automatique à la ligne')).toBeTruthy();
    expect(screen.getByText('Formater lors de l’enregistrement')).toBeTruthy();
    expect(screen.getByLabelText('Exiger la validation des modifications de l’IA')).toBeTruthy();
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
