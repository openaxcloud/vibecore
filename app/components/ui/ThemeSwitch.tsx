import { useStore } from '@nanostores/react';
import { forwardRef, memo, useEffect, useState } from 'react';
import { IconButton } from './IconButton';
import { themeStore, toggleTheme } from '~/lib/stores/theme';

interface ThemeSwitchProps {
  className?: string;
  iconClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  title?: string;
}

/*
 * Phase 0 #6 — Always render an IconButton so the forwarded `ref` is stable
 * across the SSR → hydration boundary. Radix primitives (Tooltip.Trigger
 * asChild, Popover.Trigger asChild) require a single, ref-able element as
 * their direct child; returning `false` from the previous gated
 * `domLoaded && (…)` pattern broke that contract and silently dropped
 * tooltips wrapping the switch. Until the theme store hydrates we render a
 * neutral moon icon; the useEffect flip happens on mount, after which the
 * icon tracks the active theme.
 */
export const ThemeSwitch = memo(
  forwardRef<HTMLButtonElement, ThemeSwitchProps>(
    ({ className, iconClassName, size = 'xl', title = 'Toggle Theme' }, ref) => {
      const theme = useStore(themeStore);
      const [domLoaded, setDomLoaded] = useState(false);

      useEffect(() => {
        setDomLoaded(true);
      }, []);

      const icon = domLoaded
        ? theme === 'dark'
          ? 'i-ph-sun-dim-duotone'
          : 'i-ph-moon-stars-duotone'
        : 'i-ph-moon-stars-duotone';

      return (
        <IconButton
          ref={ref}
          className={className}
          icon={icon}
          iconClassName={iconClassName}
          size={size}
          title={title}
          aria-label={title || 'Toggle theme'}
          aria-hidden={domLoaded ? undefined : true}
          onClick={toggleTheme}
        />
      );
    },
  ),
);

ThemeSwitch.displayName = 'ThemeSwitch';
