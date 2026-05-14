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

export const ThemeSwitch = memo(
  forwardRef<HTMLButtonElement, ThemeSwitchProps>(
    ({ className, iconClassName, size = 'xl', title = 'Toggle Theme' }, ref) => {
      const theme = useStore(themeStore);
      const [domLoaded, setDomLoaded] = useState(false);

      useEffect(() => {
        setDomLoaded(true);
      }, []);

      return (
        domLoaded && (
          <IconButton
            ref={ref}
            className={className}
            icon={theme === 'dark' ? 'i-ph-sun-dim-duotone' : 'i-ph-moon-stars-duotone'}
            iconClassName={iconClassName}
            size={size}
            title={title}
            onClick={toggleTheme}
          />
        )
      );
    },
  ),
);

ThemeSwitch.displayName = 'ThemeSwitch';
