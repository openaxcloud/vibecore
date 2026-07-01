// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Runtime behaviour for the tri-state (light/dark/system) preference and the
 * live OS-colour-scheme sync.
 */
type MediaListener = () => void;

function mockMatchMedia(initialDark: boolean) {
  let matches = initialDark;

  const listeners = new Set<MediaListener>();

  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: MediaListener) => listeners.add(cb),
    removeEventListener: (_: string, cb: MediaListener) => listeners.delete(cb),
    addListener: (cb: MediaListener) => listeners.add(cb),
    removeListener: (cb: MediaListener) => listeners.delete(cb),
    dispatchEvent: () => true,
    onchange: null,
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );

  return {
    setOs(dark: boolean) {
      matches = dark;
      listeners.forEach((cb) => cb());
    },
  };
}

describe('theme preference (light/dark/system)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    localStorage.clear();
    document.cookie = 'ecode_theme=; Max-Age=0; Path=/';
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('applies + persists an explicit preference', async () => {
    mockMatchMedia(false);

    const { setThemePreference, themeStore, themePreferenceStore, kTheme } = await import('./theme');

    setThemePreference('dark');

    expect(themePreferenceStore.get()).toBe('dark');
    expect(themeStore.get()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(kTheme)).toBe('dark');
  });

  it('resolves `system` from the OS at selection time', async () => {
    mockMatchMedia(true); // OS is dark

    const { setThemePreference, themeStore, themePreferenceStore, kTheme } = await import('./theme');

    setThemePreference('system');

    expect(themePreferenceStore.get()).toBe('system'); // preference persisted as system
    expect(themeStore.get()).toBe('dark'); // applied resolves via OS
    expect(localStorage.getItem(kTheme)).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('tracks live OS changes while preference is `system`, and stops after opting out', async () => {
    const os = mockMatchMedia(false); // OS starts light

    const { setThemePreference, initSystemThemeSync, themeStore } = await import('./theme');

    setThemePreference('system');
    expect(themeStore.get()).toBe('light');

    const cleanup = initSystemThemeSync();

    os.setOs(true); // OS flips to dark
    expect(themeStore.get()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Opt into an explicit theme → OS changes must no longer move it.
    setThemePreference('light');
    os.setOs(false);
    os.setOs(true);
    expect(themeStore.get()).toBe('light');

    cleanup();
  });
});
