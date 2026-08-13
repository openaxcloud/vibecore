/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/stores/settings', () => ({ LOCAL_PROVIDERS: [] }));

import { ModelSelector } from './ModelSelector';
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

afterEach(() => {
  cleanup();
});

describe('<ModelSelector />', () => {
  it('keeps the provider dropdown open for the native keyboard activation sequence', async () => {
    render(
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
    render(
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

    render(
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
    render(
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
