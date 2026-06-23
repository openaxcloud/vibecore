/**
 * Pure helpers for restoring a returning visitor's saved AI-model preference on
 * the e-code landing page. Extracted from EcodeExactLandingControls so the
 * preference-resolution logic can be unit-tested without rendering React.
 */

export const PREFERRED_AI_MODEL_STORAGE_KEY = 'ecode-preferred-ai-model';

/**
 * Read the persisted preferred model id from localStorage. Returns an empty
 * string when running on the server or when nothing was saved.
 */
export function readPersistedModelId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(PREFERRED_AI_MODEL_STORAGE_KEY) || '';
  } catch {
    /* Private-mode / disabled storage: behave as if nothing was saved. */
    return '';
  }
}

/**
 * Resolve which model id should be selected, given the persisted preference and
 * the list of currently-available models.
 *
 * - If the persisted id is present in the available list, restore it.
 * - Otherwise fall back to the supplied default (typically the first option),
 *   so the selector never sticks on the disabled placeholder for a returning
 *   user whose saved model is still offered by the catalog.
 */
export function resolvePreferredModelId(persistedId: string, availableIds: readonly string[], fallbackId = ''): string {
  if (persistedId && availableIds.includes(persistedId)) {
    return persistedId;
  }

  return fallbackId;
}
