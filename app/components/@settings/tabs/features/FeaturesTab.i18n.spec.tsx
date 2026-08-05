/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const settingsMocks = vi.hoisted(() => ({
  enableLatestBranch: vi.fn(),
  enableContextOptimization: vi.fn(),
  setAutoSelectTemplate: vi.fn(),
  setEventLogs: vi.fn(),
  setPromptId: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({ success: vi.fn() }));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; layout?: unknown }) => {
      const {
        layout: _layout,
        layoutId: _layoutId,
        initial: _initial,
        animate: _animate,
        transition: _transition,
        ...dom
      } = props as HTMLAttributes<HTMLDivElement> & Record<string, unknown>;

      return <div {...dom}>{children}</div>;
    },
  },
}));
vi.mock('~/components/ui/Switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    'aria-label'?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));
vi.mock('~/lib/hooks/useSettings', () => ({
  useSettings: () => ({
    autoSelectTemplate: true,
    isLatestBranch: false,
    contextOptimizationEnabled: true,
    eventLogs: true,
    promptId: 'default',
    ...settingsMocks,
  }),
}));
vi.mock('~/lib/common/prompt-library', () => ({
  PromptLibrary: {
    getList: () => [{ id: 'default' }, { id: 'original' }, { id: 'optimized' }],
  },
}));
vi.mock('react-toastify', () => ({ toast: toastMocks }));

import FeaturesTab from './FeaturesTab';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderFeatures(language: 'en' | 'fr') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <FeaturesTab />
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
  toastMocks.success.mockReset();

  for (const mock of Object.values(settingsMocks)) {
    mock.mockReset();
  }
});

describe('FeaturesTab i18n', () => {
  it('renders the complete feature settings surface in French', () => {
    renderFeatures('fr');

    expect(screen.getByRole('heading', { name: 'Fonctionnalités principales' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mises à jour de la branche principale' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sélection automatique du modèle' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Optimisation du contexte' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Journalisation des événements' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bibliothèque de prompts' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Activer ou désactiver Optimisation du contexte' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Bibliothèque de prompts' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Prompt par défaut' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Prompt d’origine' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Prompt optimisé (expérimental)' })).toBeTruthy();
    expect(screen.queryByText('Core features')).toBeNull();
    expect(screen.queryByText('Prompt library')).toBeNull();
  });

  it('localizes toggle and prompt-selection feedback', () => {
    renderFeatures('fr');

    fireEvent.click(
      screen.getByRole('switch', { name: 'Activer ou désactiver Mises à jour de la branche principale' }),
    );
    expect(settingsMocks.enableLatestBranch).toHaveBeenCalledWith(true);
    expect(toastMocks.success).toHaveBeenCalledWith('Mises à jour de la branche principale : activé');

    fireEvent.change(screen.getByRole('combobox', { name: 'Bibliothèque de prompts' }), {
      target: { value: 'optimized' },
    });
    expect(settingsMocks.setPromptId).toHaveBeenCalledWith('optimized');
    expect(toastMocks.success).toHaveBeenCalledWith('Modèle de prompt mis à jour');
  });

  it('keeps the English catalog available', () => {
    renderFeatures('en');

    expect(screen.getByRole('heading', { name: 'Core features' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Prompt library' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Optimized prompt (experimental)' })).toBeTruthy();
  });
});
