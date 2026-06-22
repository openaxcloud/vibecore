export type ChatDescriptionValidation = 'unchanged' | 'invalid-length' | 'invalid-characters' | 'valid';

/**
 * Pure validation for a chat description edit.
 *
 * @param desc The candidate description (raw, untrimmed input).
 * @param baseline The last-saved description to compare against for change detection.
 *   This must be the most recently persisted value, NOT a stale initial prop, so that
 *   consecutive edits are diffed correctly.
 * @returns A discriminant describing the validation outcome.
 */
export function validateChatDescription(desc: string, baseline: string): ChatDescriptionValidation {
  const trimmedDesc = desc.trim();

  if (trimmedDesc === baseline.trim()) {
    return 'unchanged';
  }

  const lengthValid = trimmedDesc.length > 0 && trimmedDesc.length <= 100;

  if (!lengthValid) {
    return 'invalid-length';
  }

  // Allow letters, numbers, spaces, and common punctuation but exclude characters that could cause issues
  const characterValid = /^[a-zA-Z0-9\s\-_.,!?()[\]{}'"]+$/.test(trimmedDesc);

  if (!characterValid) {
    return 'invalid-characters';
  }

  return 'valid';
}
