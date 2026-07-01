import { useStore } from '@nanostores/react';
import { memo } from 'react';
import { setThemePreference, THEME_PREFERENCES, themePreferenceStore } from '~/lib/stores/theme';
import type { ThemePreference } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'i-ph-sun-dim-duotone' },
  { value: 'dark', label: 'Dark', icon: 'i-ph-moon-stars-duotone' },
  { value: 'system', label: 'System', icon: 'i-ph-desktop-duotone' },
];

interface ThemePreferenceControlProps {
  className?: string;

  /** Show the text label next to each icon (default true). */
  showLabels?: boolean;
}

/**
 * Replit-parity Appearance control: a segmented Light / Dark / System selector.
 * `System` follows the OS colour-scheme live (see initSystemThemeSync). Binds to
 * the shared preference store so the choice persists across every E-Code surface
 * (marketing, app, IDE) via the cross-domain cookie.
 */
export const ThemePreferenceControl = memo(({ className, showLabels = true }: ThemePreferenceControlProps) => {
  const preference = useStore(themePreferenceStore);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={classNames(
        'inline-flex items-center gap-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = preference === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => setThemePreference(option.value)}
            className={classNames(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors',
              active
                ? 'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm'
                : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            )}
          >
            <span className={classNames(option.icon, 'text-base')} aria-hidden="true" />
            {showLabels && <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
});

ThemePreferenceControl.displayName = 'ThemePreferenceControl';

export { THEME_PREFERENCES };
