import { applyThemeToDocument, setThemePreference, themeStore, type Theme, type ThemePreference } from './stores/theme';

export type ProjectThemePreference = ThemePreference;

export function isProjectThemePreference(preference: unknown): preference is ProjectThemePreference {
  return preference === 'dark' || preference === 'light' || preference === 'system';
}

/**
 * `system` is the per-project inheritance value: it keeps the resolved global
 * preference (including an explicit light toggle or the user's OS choice).
 */
export function resolveProjectThemePreference(preference: unknown, inheritedTheme: Theme): Theme {
  return preference === 'dark' || preference === 'light' ? preference : inheritedTheme;
}

export function applyProjectThemePreference(preference: unknown): Theme {
  if (preference === 'dark' || preference === 'light') {
    setThemePreference(preference);

    return preference;
  }

  const inheritedTheme = themeStore.get();

  /*
   * Applying an inherited project preference must never turn a persisted
   * light/dark/system choice into a new resolved preference.
   */
  applyThemeToDocument(inheritedTheme);

  return inheritedTheme;
}
