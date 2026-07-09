/**
 * Pure helpers for carrying the visitor's chosen AI model from the marketing
 * landing page into the authenticated project-creation flow.
 *
 * The landing "Build Now" journey hands the prompt off through sessionStorage
 * (`pendingAppDescription`) so it survives the /projects/new -> /login?returnTo
 * -> /projects/new round-trip without ever landing in the URL. The chosen model
 * was NOT part of that hand-off, so generation always fell back to the platform
 * DEFAULT_MODEL regardless of what the visitor picked. These helpers add the
 * model to the same channel (`pendingModelId` + `pendingProvider`) and resolve
 * the landing model id back to a concrete provider/model pair against whatever
 * catalog /projects/new actually loaded.
 *
 * The landing model `id` equals the internal model `name` and the landing
 * `provider` equals the internal provider `name` (see api.models.ts
 * `toPublicModelSummaries`, which maps `id: model.name` / `provider:
 * model.provider`), so a live-catalog selection resolves by an exact
 * name/provider match. A stale id (e.g. a static fallback picked while the
 * catalog was offline) simply won't match and the caller keeps its defaults.
 */

/** sessionStorage keys, mirroring `pendingAppDescription`. */
export const PENDING_MODEL_ID_STORAGE_KEY = 'pendingModelId';
export const PENDING_MODEL_PROVIDER_STORAGE_KEY = 'pendingProvider';

export interface ModelHandoff {
  modelId: string;
  provider: string;
}

/**
 * Stash the chosen model id (and its provider hint) for /projects/new to pick
 * up. No-op on the server or when no model id is supplied — we only ever stash
 * an explicit selection, never a placeholder. Provider is optional; when absent
 * the consumer resolves it from the loaded catalog.
 */
export function stashModelHandoff(modelId: string, provider?: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const trimmedId = modelId?.trim();

  if (!trimmedId) {
    return;
  }

  try {
    window.sessionStorage.setItem(PENDING_MODEL_ID_STORAGE_KEY, trimmedId);

    const trimmedProvider = provider?.trim();

    if (trimmedProvider) {
      window.sessionStorage.setItem(PENDING_MODEL_PROVIDER_STORAGE_KEY, trimmedProvider);
    } else {
      window.sessionStorage.removeItem(PENDING_MODEL_PROVIDER_STORAGE_KEY);
    }
  } catch {
    /* Private mode / disabled storage: the visitor just keeps the default model. */
  }
}

/**
 * Read the pending model hand-off. Returns empty strings on the server or when
 * nothing was stashed (or storage is unavailable).
 */
export function readModelHandoff(): ModelHandoff {
  if (typeof window === 'undefined') {
    return { modelId: '', provider: '' };
  }

  try {
    return {
      modelId: window.sessionStorage.getItem(PENDING_MODEL_ID_STORAGE_KEY) || '',
      provider: window.sessionStorage.getItem(PENDING_MODEL_PROVIDER_STORAGE_KEY) || '',
    };
  } catch {
    return { modelId: '', provider: '' };
  }
}

/** Clear the pending model hand-off after it has been consumed. */
export function clearModelHandoff(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(PENDING_MODEL_ID_STORAGE_KEY);
    window.sessionStorage.removeItem(PENDING_MODEL_PROVIDER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface ResolvableModel {
  name: string;
  provider: string;
}

export interface ResolvedModelSelection {
  provider: string;
  model: string;
}

/**
 * Resolve a landing model id (+ optional provider hint) to a concrete
 * provider/model pair that actually exists in the supplied catalog.
 *
 * - When a provider hint is given, an exact name+provider match wins (so the
 *   same model name offered by two providers lands on the intended one).
 * - Otherwise the first model whose name matches is used.
 * - Returns `null` when the id isn't offered by the catalog, so the caller can
 *   fall back to its own default without crashing.
 */
export function resolveHandoffModelSelection(
  candidate: { modelId: string; provider?: string },
  models: readonly ResolvableModel[],
): ResolvedModelSelection | null {
  const modelId = candidate.modelId?.trim();

  if (!modelId) {
    return null;
  }

  const providerHint = candidate.provider?.trim();

  if (providerHint) {
    const exact = models.find((model) => model.name === modelId && model.provider === providerHint);

    if (exact) {
      return { provider: exact.provider, model: exact.name };
    }
  }

  const byName = models.find((model) => model.name === modelId);

  if (byName) {
    return { provider: byName.provider, model: byName.name };
  }

  return null;
}
