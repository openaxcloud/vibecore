import { describe, expect, it } from 'vitest';
import {
  projectModelSelectionFromMetadata,
  projectModelSelectionFromParams,
  projectModelSelectionFromValues,
  providerByName,
  providerForModel,
} from './projectModelSelection';
import { AUTO_MODEL, DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';

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

  it('keeps a persisted dynamic model when its provider resolves but it is not in staticModels', () => {
    /*
     * A runtime-fetched (dynamic) model that no provider lists in `staticModels`. As long as the
     * persisted provider resolves, the selection must be preserved across reloads instead of being
     * silently reset to DEFAULT_MODEL.
     */
    const selection = projectModelSelectionFromMetadata({
      selectedModel: 'some-runtime-fetched-model:latest',
      selectedProvider: 'OpenAI',
    });

    expect(selection?.model).toBe('some-runtime-fetched-model:latest');
    expect(selection?.provider.name).toBe('OpenAI');
  });

  it('preserves persisted selection for providers that expose no static models', () => {
    const dynamicOnlyProvider = PROVIDER_LIST.find((provider) => (provider.staticModels?.length ?? 0) === 0);

    // Skip if the current build registers no dynamic-only provider (e.g. Ollama, LMStudio).
    if (!dynamicOnlyProvider) {
      return;
    }

    const selection = projectModelSelectionFromMetadata({
      selectedModel: 'llama-something-pulled-at-runtime',
      selectedProvider: dynamicOnlyProvider.name,
    });

    expect(selection?.model).toBe('llama-something-pulled-at-runtime');
    expect(selection?.provider.name).toBe(dynamicOnlyProvider.name);
  });

  it('falls back safely when no provider can be resolved for the persisted model', () => {
    // Unknown model name with no resolvable provider hint -> safe DEFAULT fallback.
    const selection = projectModelSelectionFromMetadata({
      selectedModel: 'not-a-real-model',
      selectedProvider: 'NotARealProvider',
    });

    expect(providerByName('NotARealProvider')).toBeUndefined();
    expect(selection?.model).toBe(DEFAULT_MODEL);
    expect(selection?.provider.name).toBe(DEFAULT_PROVIDER.name);
  });

  it('reads model selection from URL params', () => {
    const params = new URLSearchParams({ model: 'gpt-4o', provider: 'OpenAI' });
    const selection = projectModelSelectionFromParams(params);

    expect(selection?.model).toBe('gpt-4o');
    expect(selection?.provider.name).toBe('OpenAI');
  });

  it('accepts "auto" as a valid selection mapped to the default provider (opt-in)', () => {
    const selection = projectModelSelectionFromValues(AUTO_MODEL);

    expect(selection?.model).toBe(AUTO_MODEL);
    expect(selection?.model).toBe('auto');
    expect(selection?.provider.name).toBe(DEFAULT_PROVIDER.name);

    // Opt-in: Auto is NOT the default model — a blank selection never yields 'auto'.
    expect(AUTO_MODEL).not.toBe(DEFAULT_MODEL);
    expect(projectModelSelectionFromValues(undefined)).toBeNull();
    expect(projectModelSelectionFromValues('')).toBeNull();
  });

  it('restores "auto" from persisted project metadata', () => {
    const selection = projectModelSelectionFromMetadata({ selectedModel: 'auto', selectedProvider: 'OpenAI' });

    // Even if a stale provider was persisted, Auto always resolves to the default provider.
    expect(selection?.model).toBe('auto');
    expect(selection?.provider.name).toBe(DEFAULT_PROVIDER.name);
  });

  it('maps known model prefixes to providers', () => {
    expect(providerForModel('gemini-unlisted-model')?.name).toBe('Google');
    expect(providerForModel('openai/unlisted-model')?.name).toBe('Github');
    expect(providerForModel('gpt-unlisted-model')?.name).toBe('OpenAI');
  });
});
