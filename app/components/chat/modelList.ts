import type { ModelInfo } from '~/lib/modules/llm/types';
import { AUTO_MODEL } from '~/utils/constants';

/**
 * The provider-agnostic "Auto" entry (OPT-IN). Selecting it sets the model to the
 * {@link AUTO_MODEL} sentinel; the server then routes simple turns to a small,
 * economical model and keeps the frontier model for builds/scaffolds/multi-file
 * edits. It is NOT the default — a fresh user still defaults to the concrete
 * `DEFAULT_MODEL`; Auto only ever applies when explicitly picked. Rendered at the
 * TOP of the model list, independent of the selected provider.
 */
export const AUTO_MODEL_OPTION: ModelInfo = {
  name: AUTO_MODEL,
  label: 'Auto — economical (recommended)',
  provider: 'Auto',
  maxTokenAllowed: 200_000,
};

/** True when `name` is the Auto routing sentinel. */
export function isAutoModel(name?: string | null): boolean {
  return name === AUTO_MODEL;
}

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
