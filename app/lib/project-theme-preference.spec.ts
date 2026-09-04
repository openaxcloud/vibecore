// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyProjectThemePreference,
  isProjectThemePreference,
  resolveProjectThemePreference,
} from './project-theme-preference';
import { kTheme, themePreferenceStore, themeStore } from './stores/theme';

describe('project theme inheritance', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    themePreferenceStore.set('dark');
    themeStore.set('dark');
    vi.restoreAllMocks();
  });

  it('recognizes the open tri-state preference contract', () => {
    expect(isProjectThemePreference('dark')).toBe(true);
    expect(isProjectThemePreference('light')).toBe(true);
    expect(isProjectThemePreference('system')).toBe(true);
    expect(isProjectThemePreference('inherit')).toBe(false);
  });

  it('keeps the resolved global theme for a system project', () => {
    expect(resolveProjectThemePreference('system', 'light')).toBe('light');
    expect(resolveProjectThemePreference(undefined, 'dark')).toBe('dark');
  });

  it('does not overwrite an explicit global light choice while opening a system project', () => {
    localStorage.setItem(kTheme, 'light');
    themePreferenceStore.set('light');
    themeStore.set('light');

    expect(applyProjectThemePreference('system')).toBe('light');
    expect(themeStore.get()).toBe('light');
    expect(themePreferenceStore.get()).toBe('light');
    expect(localStorage.getItem(kTheme)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies and persists an explicit per-project choice through the central theme contract', () => {
    expect(applyProjectThemePreference('light')).toBe('light');
    expect(themeStore.get()).toBe('light');
    expect(themePreferenceStore.get()).toBe('light');
    expect(localStorage.getItem(kTheme)).toBe('light');
  });
});
