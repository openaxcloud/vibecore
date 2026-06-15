import type { IChatMetadata } from '~/lib/persistence/db';
import type { ProviderInfo } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';

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

  const requestedProvider = providerByName(requestedProviderValue?.trim()) ?? providerForModel(requestedModel);
  const fallbackSelection = fallbackProjectModelSelection();
  const provider = (requestedProvider ?? fallbackSelection.provider) as ProviderInfo;
  const modelKnownForProvider = provider.staticModels?.some((model) => model.name === requestedModel) ?? false;

  return {
    model: modelKnownForProvider ? requestedModel : fallbackSelection.model,
    provider: modelKnownForProvider ? provider : fallbackSelection.provider,
  };
}

export function projectModelSelectionFromParams(searchParams: URLSearchParams): ProjectModelSelection | null {
  return projectModelSelectionFromValues(searchParams.get('model'), searchParams.get('provider'));
}

export function projectModelSelectionFromMetadata(metadata?: IChatMetadata): ProjectModelSelection | null {
  return projectModelSelectionFromValues(metadata?.selectedModel, metadata?.selectedProvider);
}
