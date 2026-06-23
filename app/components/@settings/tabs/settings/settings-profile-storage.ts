/*
 * Pure helpers for reading/merging the `bolt_user_profile` localStorage blob.
 *
 * The raw value can be corrupt — another tab, the theme store, or a browser
 * extension may have written a partial/invalid value, or a stale literal like
 * the string 'undefined'. Every read must therefore tolerate a parse failure
 * rather than throwing inside a React event handler (which would leave UI
 * controls in an inconsistent state).
 */

/**
 * Parse a stored `bolt_user_profile` value, defaulting to an empty object on
 * any failure (missing value, invalid JSON, or a non-object JSON value such as
 * a bare number/string/array/null).
 */
export function parseStoredProfile(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return {};
  } catch {
    return {};
  }
}

/**
 * Merge a new `notifications` value into the existing stored profile, tolerating
 * a corrupt stored value. Returns the updated profile object to persist.
 */
export function mergeNotificationIntoProfile(
  raw: string | null | undefined,
  checked: boolean,
): Record<string, unknown> {
  return {
    ...parseStoredProfile(raw),
    notifications: checked,
  };
}
