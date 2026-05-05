import { useStore } from '@nanostores/react';
import { memo, useEffect, useState } from 'react';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { IconButton } from './IconButton';

interface ThemeSwitchProps {
  className?: string;
  iconClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  title?: string;
}

export const ThemeSwitch = memo(
  ({ className, iconClassName, size = 'xl', title = 'Toggle Theme' }: ThemeSwitchProps) => {
    const theme = useStore(themeStore);
    const [domLoaded, setDomLoaded] = useState(false);

    useEffect(() => {
      setDomLoaded(true);
    }, []);

    return (
      domLoaded && (
        <IconButton
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
);
