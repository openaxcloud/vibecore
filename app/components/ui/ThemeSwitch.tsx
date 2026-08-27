import { useStore } from '@nanostores/react';
import { forwardRef, memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton';
import { getClientAstResidualCopy } from '~/lib/i18n/catalogs/client-ast-residual';
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
  forwardRef<HTMLButtonElement, ThemeSwitchProps>(({ className, iconClassName, size = 'xl', title }, ref) => {
    const { i18n } = useTranslation();
    const copy = getClientAstResidualCopy(i18n.resolvedLanguage ?? i18n.language);
    const theme = useStore(themeStore);
    const [domLoaded, setDomLoaded] = useState(false);
    const resolvedTitle = title || copy['clientAst.ui.theme.toggle'];

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
        title={resolvedTitle}
        aria-label={resolvedTitle}
        aria-hidden={domLoaded ? undefined : true}
        onClick={toggleTheme}
      />
    );
  }),
);

ThemeSwitch.displayName = 'ThemeSwitch';
