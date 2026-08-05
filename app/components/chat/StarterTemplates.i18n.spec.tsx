/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    cancelLabel,
  }: {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <p>{description}</p>
        <button type="button">{confirmLabel}</button>
        <button type="button">{cancelLabel}</button>
      </div>
    ) : null,
}));

import StarterTemplates from './StarterTemplates';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { getStarterTemplates } from '~/utils/constants';

function withLocale(language: 'en' | 'fr', node: ReactNode) {
  return <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>;
}

afterEach(cleanup);

describe('starter templates i18n', () => {
  it('localizes labels and descriptions without changing technical identifiers', () => {
    const english = getStarterTemplates('en');
    const french = getStarterTemplates('fr-FR');

    expect(french).toHaveLength(english.length);
    expect(french[0]).toMatchObject({
      name: english[0].name,
      githubRepo: english[0].githubRepo,
      tags: english[0].tags,
      label: 'Application Expo',
      description: 'Modèle de démarrage Expo pour créer des applications mobiles multiplateformes',
    });
    expect(getStarterTemplates('de-DE')[0].label).toBe('Expo App');
  });

  it('renders the French introduction, accessible links, and discard dialog', () => {
    render(withLocale('fr', <StarterTemplates hasUnsentDraft />));

    expect(screen.getByText('ou démarrez une application vierge avec votre stack préférée')).toBeTruthy();

    const expoLink = screen.getByRole('link', {
      name: 'Démarrer une application Application Expo',
    });
    expect(expoLink.getAttribute('href')).toContain('xKevIsDev/bolt-expo-template.git');

    fireEvent.click(expoLink);

    const dialog = screen.getByRole('dialog', { name: 'Abandonner votre prompt ?' });
    expect(dialog.textContent).toContain('Un prompt non envoyé est présent dans l’éditeur.');
    expect(screen.getByRole('button', { name: 'Abandonner et continuer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuer la modification' })).toBeTruthy();
  });
});
