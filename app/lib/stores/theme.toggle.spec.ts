// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the toggleTheme persistence bug:
 * an unguarded localStorage.setItem that throws (Safari Private Browsing /
 * QuotaExceededError) used to abort before applyThemeToDocument ran, leaving
 * the store reporting the new theme while the DOM stayed on the old one.
 */
describe('toggleTheme persistence resilience', () => {
  beforeEach(() => {
    // jsdom provides document + localStorage; ensure a clean DOM/state per test.
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    localStorage.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('still updates the DOM when localStorage.setItem throws', async () => {
    const { toggleTheme, themeStore } = await import('./theme');

    // Force the store to a known starting point.
    themeStore.set('light');

    // Simulate a locked-down localStorage that rejects writes.
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => toggleTheme()).not.toThrow();

    // Store flipped...
    expect(themeStore.get()).toBe('dark');

    // ...AND the DOM actually reflects the new theme despite the failed write.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');

    setItemSpy.mockRestore();
  });

  it('persists and updates the DOM on the happy path', async () => {
    const { toggleTheme, themeStore, kTheme } = await import('./theme');

    themeStore.set('light');
    toggleTheme();

    expect(themeStore.get()).toBe('dark');
    expect(localStorage.getItem(kTheme)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persistTheme reports failure but does not throw when storage is blocked', async () => {
    const { persistTheme } = await import('./theme');

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(persistTheme('dark')).toBe(false);
  });
});
