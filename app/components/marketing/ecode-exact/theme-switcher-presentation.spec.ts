import { describe, expect, it } from 'vitest';
import { getThemeSwitcherPresentation } from './theme-switcher-presentation';

describe('getThemeSwitcherPresentation', () => {
  const english = { light: 'Light', dark: 'Dark' };

  it('shows Sun + "Light" for the light theme (never "System")', () => {
    const presentation = getThemeSwitcherPresentation('light', english);
    expect(presentation).toEqual({ icon: 'sun', label: 'Light' });
    expect(presentation.label).not.toBe('System');
  });

  it('shows Moon + "Dark" for the dark theme', () => {
    expect(getThemeSwitcherPresentation('dark', english)).toEqual({ icon: 'moon', label: 'Dark' });
  });

  it('uses the active locale labels without changing the theme icon', () => {
    const french = { light: 'Clair', dark: 'Sombre' };

    expect(getThemeSwitcherPresentation('light', french)).toEqual({ icon: 'sun', label: 'Clair' });
    expect(getThemeSwitcherPresentation('dark', french)).toEqual({ icon: 'moon', label: 'Sombre' });
  });

  it('never reports the monitor/system icon for any real theme value', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(['sun', 'moon']).toContain(getThemeSwitcherPresentation(theme, english).icon);
    }
  });
});
