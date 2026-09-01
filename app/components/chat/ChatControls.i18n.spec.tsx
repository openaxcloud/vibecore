/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/stores/settings', () => ({ LOCAL_PROVIDERS: ['Ollama'] }));

import { AgentPowerControls, type AgentPowerControlsValue } from './AgentPowerControls';
import { createI18nInstance } from '~/lib/i18n/runtime';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

const powerValue: AgentPowerControlsValue = {
  highEffort: false,
  highPowerModel: false,
  extendedThinking: false,
  turboMode: false,
  buildTier: 'economy',
};

function withLocale(language: 'en' | 'fr', node: React.ReactNode) {
  return <I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>;
}

afterEach(cleanup);

describe('chat controls i18n', () => {

  it('renders agent power controls, long hints, and costs in French', () => {
    render(withLocale('fr', <AgentPowerControls value={powerValue} onChange={vi.fn()} estimatedCents={125} />));

    expect(screen.getByRole('radiogroup', { name: 'Mode de l’agent (Commande-Maj-I pour changer)' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Léger' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Économique' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Puissance' })).toBeTruthy();
    expect(screen.getByText(/1,25/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Avancé' }));
    expect(screen.getByRole('dialog', { name: 'Paramètres avancés de l’agent' })).toBeTruthy();
    expect(screen.getByText('Effort élevé')).toBeTruthy();
    expect(screen.getByText(/Réserve les modèles plus puissants/u)).toBeTruthy();
    expect(screen.queryByText('Advanced settings')).toBeNull();
  });

  it('keeps the English catalog available', () => {
    render(withLocale('en', <AgentPowerControls value={powerValue} onChange={vi.fn()} estimatedCents={25} />));

    expect(screen.getByRole('radio', { name: 'Economy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Advanced' })).toBeTruthy();
  });
});
