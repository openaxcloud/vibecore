import type { ModelInfo } from '~/lib/modules/llm/types';

function isModelInfo(value: unknown): value is ModelInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<ModelInfo>;

  return (
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.label === 'string' &&
    typeof candidate.provider === 'string' &&
    candidate.provider.length > 0 &&
    typeof candidate.maxTokenAllowed === 'number' &&
    Number.isFinite(candidate.maxTokenAllowed)
  );
}

export function normalizeModelList(value: unknown): ModelInfo[] {
  return Array.isArray(value) ? value.filter(isModelInfo) : [];
}

export function modelListFromResponse(value: unknown): ModelInfo[] {
  if (typeof value !== 'object' || value === null || !('modelList' in value)) {
    return [];
  }

  return normalizeModelList((value as { modelList?: unknown }).modelList);
}
