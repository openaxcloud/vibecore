import { describe, expect, it } from 'vitest';
import { resolveInitialTheme } from './theme';

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
    expect(resolveInitialTheme({ cookie: 'system', stored: 'light', prefersDark: true })).toBe('light');
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
