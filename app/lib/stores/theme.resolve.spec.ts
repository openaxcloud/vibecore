import { describe, expect, it } from 'vitest';
import { resolveAppliedTheme, resolveInitialTheme, resolveThemePreference } from './theme';

describe('resolveInitialTheme (shared source of truth)', () => {
  it('prefers the cross-domain cookie above everything else', () => {
    expect(resolveInitialTheme({ cookie: 'dark', stored: 'light', attribute: 'light', prefersDark: false })).toBe(
      'dark',
    );
    expect(resolveInitialTheme({ cookie: 'light', stored: 'dark', attribute: 'dark', prefersDark: true })).toBe(
      'light',
    );
  });

  it('falls back to per-origin localStorage when no cookie', () => {
    expect(resolveInitialTheme({ cookie: null, stored: 'dark', prefersDark: false })).toBe('dark');
  });

  it('treats a `system` preference as a real choice that follows the OS (beats the attribute)', () => {
    // `system` cookie wins over stored light/dark and the seeded attribute.
    expect(resolveInitialTheme({ cookie: 'system', stored: 'light', attribute: 'light', prefersDark: true })).toBe(
      'dark',
    );
    expect(resolveInitialTheme({ cookie: 'system', stored: 'dark', attribute: 'dark', prefersDark: false })).toBe(
      'light',
    );
  });

  it('falls back to the server-seeded data-theme attribute', () => {
    expect(resolveInitialTheme({ cookie: null, stored: null, attribute: 'dark' })).toBe('dark');
  });

  it('honors prefers-color-scheme only when no explicit choice exists', () => {
    expect(resolveInitialTheme({ cookie: null, stored: null, attribute: null, prefersDark: true })).toBe('dark');
    expect(resolveInitialTheme({ cookie: null, stored: null, attribute: null, prefersDark: false })).toBe('light');
  });

  it('defaults to light when nothing is available', () => {
    expect(resolveInitialTheme({})).toBe('light');
    expect(resolveInitialTheme({ cookie: '', stored: 'bogus', attribute: 'nope', prefersDark: false })).toBe('light');
  });
});

describe('resolveThemePreference', () => {
  it('reads an explicit preference from cookie then localStorage', () => {
    expect(resolveThemePreference({ cookie: 'dark', stored: 'light' })).toBe('dark');
    expect(resolveThemePreference({ cookie: 'system', stored: 'light' })).toBe('system');
    expect(resolveThemePreference({ cookie: null, stored: 'light' })).toBe('light');
    expect(resolveThemePreference({ cookie: 'bogus', stored: 'system' })).toBe('system');
  });

  it('defaults to `system` when nothing valid is stored', () => {
    expect(resolveThemePreference({})).toBe('system');
    expect(resolveThemePreference({ cookie: 'nope', stored: '' })).toBe('system');
  });
});

describe('resolveAppliedTheme', () => {
  it('passes explicit choices through and resolves `system` via the OS', () => {
    expect(resolveAppliedTheme('light', true)).toBe('light');
    expect(resolveAppliedTheme('dark', false)).toBe('dark');
    expect(resolveAppliedTheme('system', true)).toBe('dark');
    expect(resolveAppliedTheme('system', false)).toBe('light');
  });
});
