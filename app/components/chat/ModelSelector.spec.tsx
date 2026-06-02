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
});
