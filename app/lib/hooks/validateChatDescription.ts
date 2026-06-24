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

  /*
   * Allow any Unicode text (accented Latin, Cyrillic, CJK, Arabic, emoji, …) so that
   * non-ASCII titles like 'Mon café', 'проект' or '日本語' are accepted. Only reject the
   * genuinely dangerous characters: angle brackets that could open markup, plus ASCII and
   * Unicode C1 control characters / line breaks (titles are single-line).
   */
  const characterValid = !/[<>\u0000-\u001f\u007f-\u009f]/u.test(trimmedDesc);

  if (!characterValid) {
    return 'invalid-characters';
  }

  return 'valid';
}
