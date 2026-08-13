import { describe, expect, it } from 'vitest';
import { getThemeSwitcherPresentation } from './theme-switcher-presentation';

describe('getThemeSwitcherPresentation', () => {
  it('shows Sun + "Light" for the light theme (never "System")', () => {
    const presentation = getThemeSwitcherPresentation('light');
    expect(presentation).toEqual({ icon: 'sun', label: 'Light' });
    expect(presentation.label).not.toBe('System');
  });

  it('shows Moon + "Dark" for the dark theme', () => {
    expect(getThemeSwitcherPresentation('dark')).toEqual({ icon: 'moon', label: 'Dark' });
  });

  it('never reports the monitor/system icon for any real theme value', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(['sun', 'moon']).toContain(getThemeSwitcherPresentation(theme).icon);
    }
  });
});
