import type { IChatMetadata } from '~/lib/persistence/db';
import type { ProviderInfo } from '~/types/model';
import { AUTO_MODEL, DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';

export type ProjectModelSelection = {
  model: string;
  provider: ProviderInfo;
};

export function providerByName(providerName?: string | null) {
  if (!providerName) {
    return undefined;
  }

  return PROVIDER_LIST.find((provider) => provider.name.toLowerCase() === providerName.toLowerCase());
}

export function providerForModel(model: string) {
  const exactProvider = PROVIDER_LIST.find((provider) =>
    provider.staticModels?.some((staticModel) => staticModel.name === model),
  );

  if (exactProvider) {
    return exactProvider;
  }

  if (model.startsWith('claude-')) {
    return providerByName('Anthropic');
  }

  if (model.startsWith('gemini-')) {
    return providerByName('Google');
  }

  if (model.startsWith('openai/')) {
    return providerByName('Github');
  }

  if (model.startsWith('gpt-') || model.startsWith('o1')) {
    return providerByName('OpenAI');
  }

  return undefined;
}

export function fallbackProjectModelSelection(): ProjectModelSelection {
  const provider = providerForModel(DEFAULT_MODEL) ?? DEFAULT_PROVIDER;

  return {
    model: DEFAULT_MODEL,
    provider: provider as ProviderInfo,
  };
}

export function projectModelSelectionFromValues(
  requestedModelValue?: string | null,
  requestedProviderValue?: string | null,
): ProjectModelSelection | null {
  const requestedModel = requestedModelValue?.trim();

  if (!requestedModel) {
    return null;
  }

  /*
   * "Auto" (opt-in complexity routing) is provider-agnostic and always resolves
   * against the DEFAULT_PROVIDER — the server's router maps the AUTO_MODEL
   * sentinel to that provider's frontier/small pair. Handle it before the normal
   * provider lookup (no provider lists 'auto' in staticModels).
   */
  if (requestedModel === AUTO_MODEL) {
    return { model: AUTO_MODEL, provider: DEFAULT_PROVIDER as ProviderInfo };
  }

  const requestedProvider = providerByName(requestedProviderValue?.trim()) ?? providerForModel(requestedModel);

  // When we cannot resolve any provider for the requested model, fall back to the default selection.
  if (!requestedProvider) {
    return fallbackProjectModelSelection();
  }

  /*
   * A provider was resolved. The requested model may be a runtime-fetched dynamic model that is not
   * listed in `staticModels` (e.g. Ollama, OpenRouter, Together, LMStudio, openai-like all expose no
   * or partial static catalogs and fetch their models at runtime). Keep the persisted selection as-is
   * rather than discarding it back to DEFAULT_MODEL on every project reload.
   */
  return {
    model: requestedModel,
    provider: requestedProvider as ProviderInfo,
  };
}

export function projectModelSelectionFromParams(searchParams: URLSearchParams): ProjectModelSelection | null {
  return projectModelSelectionFromValues(searchParams.get('model'), searchParams.get('provider'));
}

export function projectModelSelectionFromMetadata(metadata?: IChatMetadata): ProjectModelSelection | null {
  return projectModelSelectionFromValues(metadata?.selectedModel, metadata?.selectedProvider);
}
