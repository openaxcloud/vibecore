import { describe, expect, it } from 'vitest';
import { publicChromeUserChoseDark, resolvePublicChromeTheme } from './ecode-public-theme';

describe('resolvePublicChromeTheme', () => {
  it('keeps a visitor persisted dark choice', () => {
    expect(resolvePublicChromeTheme('dark')).toBe('dark');
  });

  it('defaults to light when light is persisted', () => {
    expect(resolvePublicChromeTheme('light')).toBe('light');
  });

  it('defaults to light when nothing is persisted', () => {
    expect(resolvePublicChromeTheme(null)).toBe('light');
    expect(resolvePublicChromeTheme(undefined)).toBe('light');
  });

  it('defaults to light for unrecognized values', () => {
    expect(resolvePublicChromeTheme('system')).toBe('light');
    expect(resolvePublicChromeTheme('')).toBe('light');
  });
});

describe('publicChromeUserChoseDark', () => {
  it('is true only when dark is persisted', () => {
    expect(publicChromeUserChoseDark('dark')).toBe(true);
  });

  it('is false for light / missing / unknown', () => {
    expect(publicChromeUserChoseDark('light')).toBe(false);
    expect(publicChromeUserChoseDark(null)).toBe(false);
    expect(publicChromeUserChoseDark(undefined)).toBe(false);
    expect(publicChromeUserChoseDark('system')).toBe(false);
  });

  it('models the navigation regression fix: a persisted dark choice survives a remount', () => {
    // Simulate the module-level flag the shell uses.
    let publicThemeWasManuallyChanged = false;

    /*
     * Visitor toggles to dark on a marketing page -> ThemeSwitcher sets the flag
     * and toggleTheme() persists 'dark'.
     */
    publicThemeWasManuallyChanged = true;

    const persisted = 'dark';

    // SPA navigation remounts the shell. The mount must NOT clobber the choice.
    if (publicChromeUserChoseDark(persisted)) {
      publicThemeWasManuallyChanged = true;
    }

    expect(publicThemeWasManuallyChanged).toBe(true);
    expect(resolvePublicChromeTheme(persisted)).toBe('dark');
  });
});
