import { describe, expect, it } from 'vitest';
import {
  projectModelSelectionFromMetadata,
  projectModelSelectionFromParams,
  projectModelSelectionFromValues,
  providerForModel,
} from './projectModelSelection';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';

describe('project model selection', () => {
  it('restores a valid persisted project provider/model pair', () => {
    const selection = projectModelSelectionFromMetadata({
      selectedModel: 'gpt-4o',
      selectedProvider: 'OpenAI',
    });

    expect(selection?.model).toBe('gpt-4o');
    expect(selection?.provider.name).toBe('OpenAI');
  });

  it('prefers the model owner when the provider is omitted', () => {
    const selection = projectModelSelectionFromValues(DEFAULT_MODEL);

    expect(selection?.model).toBe(DEFAULT_MODEL);
    expect(selection?.provider.name).toBe(providerForModel(DEFAULT_MODEL)?.name);
  });

  it('falls back safely when persisted metadata names an unknown model', () => {
    const selection = projectModelSelectionFromMetadata({
      selectedModel: 'not-a-real-model',
      selectedProvider: 'OpenAI',
    });

    expect(selection?.model).toBe(DEFAULT_MODEL);
    expect(selection?.provider.name).toBe(DEFAULT_PROVIDER.name);
  });

  it('reads model selection from URL params', () => {
    const params = new URLSearchParams({ model: 'gpt-4o', provider: 'OpenAI' });
    const selection = projectModelSelectionFromParams(params);

    expect(selection?.model).toBe('gpt-4o');
    expect(selection?.provider.name).toBe('OpenAI');
  });

  it('maps known model prefixes to providers', () => {
    expect(providerForModel('gemini-unlisted-model')?.name).toBe('Google');
    expect(providerForModel('openai/unlisted-model')?.name).toBe('Github');
    expect(providerForModel('gpt-unlisted-model')?.name).toBe('OpenAI');
  });
});
