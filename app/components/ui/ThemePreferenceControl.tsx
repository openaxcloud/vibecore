import { useStore } from '@nanostores/react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getThemePreferenceCopy,
  resolveApiKeysWorkspaceSettingsLanguage,
} from '~/lib/i18n/catalogs/api-keys-workspace-settings';
import { setThemePreference, THEME_PREFERENCES, themePreferenceStore } from '~/lib/stores/theme';
import type { ThemePreference } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';

const OPTIONS: { value: ThemePreference; icon: string }[] = [
  { value: 'light', icon: 'i-ph-sun-dim-duotone' },
  { value: 'dark', icon: 'i-ph-moon-stars-duotone' },
  { value: 'system', icon: 'i-ph-desktop-duotone' },
];

interface ThemePreferenceControlProps {
  className?: string;

  /** Explicit SSR-safe language. Falls back to the active i18next language. */
  language?: string;

  /** Show the text label next to each icon (default true). */
  showLabels?: boolean;
}

/**
 * Replit-parity Appearance control: a segmented Light / Dark / System selector.
 * `System` follows the OS colour-scheme live (see initSystemThemeSync). Binds to
 * the shared preference store so the choice persists across every E-Code surface
 * (marketing, app, IDE) via the cross-domain cookie.
 */
export const ThemePreferenceControl = memo(
  ({ className, language, showLabels = true }: ThemePreferenceControlProps) => {
    const preference = useStore(themePreferenceStore);
    const { i18n } = useTranslation();

    const resolvedLanguage = resolveApiKeysWorkspaceSettingsLanguage(
      language ?? i18n.resolvedLanguage ?? i18n.language,
    );

    const copy = getThemePreferenceCopy(resolvedLanguage);

    return (
      <div
        role="radiogroup"
        aria-label={copy.ariaLabel}
        className={classNames(
          'inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1',
          className,
        )}
      >
        {OPTIONS.map((option) => {
          const active = preference === option.value;
          const label = copy[option.value];

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={label}
              onClick={() => setThemePreference(option.value)}
              className={classNames(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )}
            >
              <span className={classNames(option.icon, 'text-base')} aria-hidden="true" />
              {showLabels && <span>{label}</span>}
            </button>
          );
        })}
      </div>
    );
  },
);

ThemePreferenceControl.displayName = 'ThemePreferenceControl';

export { THEME_PREFERENCES };
