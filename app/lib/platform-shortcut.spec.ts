import { describe, expect, it } from 'vitest';
import { detectApplePlatform, isApplePlatform, submitShortcutLabel } from './platform-shortcut';

describe('isApplePlatform', () => {
  it('returns true for macOS and iOS platform strings', () => {
    expect(isApplePlatform('MacIntel')).toBe(true);
    expect(isApplePlatform('iPhone')).toBe(true);
    expect(isApplePlatform('iPad')).toBe(true);
  });

  it('returns false for non-Apple platforms', () => {
    expect(isApplePlatform('Win32')).toBe(false);
    expect(isApplePlatform('Linux x86_64')).toBe(false);
  });

  it('returns false for empty / missing platform values', () => {
    expect(isApplePlatform('')).toBe(false);
    expect(isApplePlatform(undefined)).toBe(false);
    expect(isApplePlatform(null)).toBe(false);
  });
});

describe('submitShortcutLabel', () => {
  it('uses the Ctrl label when not an Apple host (the SSR / first-render default)', () => {
    /*
     * Server has no `navigator`, so the first render must use this branch to
     * match `isAppleHost === false` and avoid a hydration mismatch.
     */
    expect(submitShortcutLabel(false)).toBe('Ctrl+↵');
  });

  it('uses the ⌘ label on Apple hosts', () => {
    expect(submitShortcutLabel(true)).toBe('⌘↵');
  });
});

describe('detectApplePlatform', () => {
  it('returns false when navigator is unavailable (SSR)', () => {
    const original = (globalThis as { navigator?: unknown }).navigator;

    // Simulate the server environment.
    delete (globalThis as { navigator?: unknown }).navigator;

    try {
      expect(detectApplePlatform()).toBe(false);
    } finally {
      if (original === undefined) {
        delete (globalThis as { navigator?: unknown }).navigator;
      } else {
        (globalThis as { navigator?: unknown }).navigator = original;
      }
    }
  });

  it('reads navigator.platform when available', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: { platform: 'MacIntel' },
      configurable: true,
      writable: true,
    });

    try {
      expect(detectApplePlatform()).toBe(true);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'navigator', original);
      } else {
        delete (globalThis as { navigator?: unknown }).navigator;
      }
    }
  });
});
