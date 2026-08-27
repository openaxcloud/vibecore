/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/stores/settings', () => ({ LOCAL_PROVIDERS: [] }));

import { localizeDynamicModelLabel, ModelSelector } from './ModelSelector';
import { createI18nInstance } from '~/lib/i18n/runtime';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

const providers: ProviderInfo[] = [
  {
    name: 'OpenAI',
    staticModels: [],
  },
  {
    name: 'Anthropic',
    staticModels: [],
  },
];

const models: ModelInfo[] = [
  {
    label: 'GPT 4.1',
    maxTokenAllowed: 128_000,
    name: 'gpt-4.1',
    provider: 'OpenAI',
  },
  {
    label: 'Claude Sonnet',
    maxTokenAllowed: 200_000,
    name: 'claude-sonnet',
    provider: 'Anthropic',
  },
];

function renderWithLocale(language: 'en' | 'fr', node: ReactNode) {
  return render(<I18nextProvider i18n={createI18nInstance(language)}>{node}</I18nextProvider>);
}

afterEach(() => {
  cleanup();
});

describe('localizeDynamicModelLabel', () => {
  it('translates provider chrome while preserving model names, prices, and context sizes', () => {
    expect(localizeDynamicModelLabel('Claude Opus 4.8 (200k context)', 'fr')).toBe('Claude Opus 4.8 (contexte 200k)');
    expect(localizeDynamicModelLabel('GLM-4.6 - context 200k', 'fr')).toBe('GLM-4.6 — contexte 200k');
    expect(localizeDynamicModelLabel('Model X - in:$0.12 out:$0.34 - context 128k', 'fr')).toBe(
      'Model X — entrée : $0.12 · sortie : $0.34 — contexte 128k',
    );
    expect(localizeDynamicModelLabel('provider/model-id (Dynamic)', 'fr')).toBe('provider/model-id (dynamique)');
    expect(localizeDynamicModelLabel('provider/model-id - context 64k [ by provider-owner]', 'fr')).toBe(
      'provider/model-id — contexte 64k [par provider-owner]',
    );
    expect(localizeDynamicModelLabel('provider/model-id - context N/A', 'fr')).toBe('provider/model-id — contexte N/D');
    expect(localizeDynamicModelLabel('Claude Opus 4.8 (200k context)', 'en')).toBe('Claude Opus 4.8 (200k context)');
    expect(localizeDynamicModelLabel('provider-owned label', 'fr')).toBe('provider-owned label');
  });
});

describe('<ModelSelector />', () => {
  it('renders dynamic provider chrome in French while preserving provider identifiers', async () => {
    const dynamicModel: ModelInfo = {
      label: 'provider/model-id - context 64k [ by provider-owner]',
      maxTokenAllowed: 64_000,
      name: 'provider/model-id',
      provider: 'OpenAI',
    };

    renderWithLocale(
      'fr',
      <ModelSelector
        apiKeys={{}}
        model={dynamicModel.name}
        modelList={[dynamicModel]}
        provider={providers[0]}
        providerList={providers}
        setModel={vi.fn()}
        setProvider={vi.fn()}
      />,
    );

    expect(screen.getByTestId('agent-model-combobox').textContent).toContain(
      'provider/model-id — contexte 64k [par provider-owner]',
    );
    expect(screen.queryByText(/context 64k \[ by/u)).toBeNull();
  });

  it('keeps the provider dropdown open for the native keyboard activation sequence', async () => {
    renderWithLocale(
      'en',
      <ModelSelector
        apiKeys={{}}
        model="gpt-4.1"
        modelList={models}
        provider={providers[0]}
        providerList={providers}
        setModel={vi.fn()}
        setProvider={vi.fn()}
      />,
    );

    const trigger = screen.getByTestId('agent-provider-combobox');

    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(trigger);

    expect(await screen.findByTestId('agent-provider-listbox')).toBeTruthy();
  });

  it('keeps the model dropdown open for the native keyboard activation sequence', async () => {
    renderWithLocale(
      'en',
      <ModelSelector
        apiKeys={{}}
        model="gpt-4.1"
        modelList={models}
        provider={providers[0]}
        providerList={providers}
        setModel={vi.fn()}
        setProvider={vi.fn()}
      />,
    );

    const trigger = screen.getByTestId('agent-model-combobox');

    fireEvent.keyDown(trigger, { key: ' ' });
    fireEvent.click(trigger);

    expect(await screen.findByTestId('agent-model-listbox')).toBeTruthy();
  });

  it('surfaces "Auto" as a recommended, selectable option at the top of the model list', async () => {
    const setModel = vi.fn();
    const setProvider = vi.fn();

    renderWithLocale(
      'en',
      <ModelSelector
        apiKeys={{}}
        model="gpt-4.1"
        modelList={models}
        provider={providers[0]}
        providerList={providers}
        setModel={setModel}
        setProvider={setProvider}
      />,
    );

    fireEvent.click(screen.getByTestId('agent-model-combobox'));

    const options = await screen.findAllByTestId('agent-model-option');

    // Auto is pinned to the very top, labeled as recommended.
    expect(options[0].textContent?.toLowerCase()).toContain('recommended');
    expect(options[0].getAttribute('aria-label')?.toLowerCase()).toContain('auto');

    // Selecting Auto sets the 'auto' sentinel and pins the default provider.
    fireEvent.click(options[0]);
    expect(setModel).toHaveBeenCalledWith('auto');
    expect(setProvider).toHaveBeenCalled();
  });

  it('does NOT select Auto by default (opt-in)', () => {
    renderWithLocale(
      'en',
      <ModelSelector
        apiKeys={{}}
        model="gpt-4.1"
        modelList={models}
        provider={providers[0]}
        providerList={providers}
        setModel={vi.fn()}
        setProvider={vi.fn()}
      />,
    );

    // The trigger reflects the concrete selected model, not Auto.
    const trigger = screen.getByTestId('agent-model-combobox');
    expect(trigger.textContent).toContain('GPT 4.1');
    expect(trigger.textContent?.toLowerCase()).not.toContain('recommended');
  });
});
