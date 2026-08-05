import type { Theme } from '~/lib/stores/theme';

export type ThemeSwitcherIcon = 'sun' | 'moon';

export interface ThemeSwitcherPresentation {
  icon: ThemeSwitcherIcon;
  label: string;
}

/**
 * Maps the active theme to the marketing theme-toggle's icon + label.
 *
 * The store only ever holds `'light' | 'dark'` (see app/lib/stores/theme.ts) and
 * `toggleTheme()` flips strictly between those two values — there is no `'system'`
 * theme. The control therefore must reflect the real active theme: Sun/Light for
 * light, Moon/Dark for dark.
 */
export function getThemeSwitcherPresentation(
  theme: Theme,
  labels: Readonly<{ light: string; dark: string }>,
): ThemeSwitcherPresentation {
  if (theme === 'dark') {
    return { icon: 'moon', label: labels.dark };
  }

  return { icon: 'sun', label: labels.light };
}
