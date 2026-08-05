/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/stores/settings', () => ({ LOCAL_PROVIDERS: ['Ollama'] }));

import { AgentPowerControls, type AgentPowerControlsValue } from './AgentPowerControls';
import { ModelSelector } from './ModelSelector';
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
  it('renders the provider empty state in French', () => {
    render(
      withLocale(
        'fr',
        <ModelSelector apiKeys={{}} modelList={[]} providerList={[]} setModel={vi.fn()} setProvider={vi.fn()} />,
      ),
    );

    expect(screen.getByText(/Aucun fournisseur n’est activé/u)).toBeTruthy();
    expect(screen.queryByText(/No providers are enabled/u)).toBeNull();
  });

  it('localizes model search, plurals, Auto, and masks a raw loading error', async () => {
    const provider: ProviderInfo = { name: 'OpenRouter', staticModels: [] };

    const models: ModelInfo[] = [
      {
        label: 'Customer Model',
        maxTokenAllowed: 128_000,
        name: 'customer-model',
        provider: 'OpenRouter',
      },
    ];

    render(
      withLocale(
        'fr',
        <ModelSelector
          apiKeys={{}}
          model="customer-model"
          modelError="Raw upstream English model failure"
          modelList={models}
          provider={provider}
          providerList={[provider]}
          setModel={vi.fn()}
          setProvider={vi.fn()}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('agent-model-combobox'));
    expect(screen.getByRole('button', { name: 'Modèles gratuits uniquement' })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Rechercher des modèles' })).toBeTruthy();
    expect(screen.getByText('Auto (recommandé)')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher des modèles' }), {
      target: { value: 'aucun-resultat-possible' },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Impossible de charger les modèles');
    });
    expect(screen.getByRole('alert').textContent).not.toContain('Raw upstream English model failure');
  });

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
