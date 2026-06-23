import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREFERRED_AI_MODEL_STORAGE_KEY,
  readPersistedModelId,
  resolvePreferredModelId,
} from './resolve-preferred-model';

describe('resolvePreferredModelId', () => {
  const available = ['gpt-5', 'gemini-2.5-pro', 'claude-sonnet-4'];

  it('restores a persisted preference that is present in the available list', () => {
    expect(resolvePreferredModelId('claude-sonnet-4', available)).toBe('claude-sonnet-4');
  });

  it('falls back to the default when the persisted id is no longer offered', () => {
    expect(resolvePreferredModelId('retired-model', available, 'gpt-5')).toBe('gpt-5');
  });

  it('falls back to the default when there is no persisted preference', () => {
    expect(resolvePreferredModelId('', available, 'gpt-5')).toBe('gpt-5');
  });

  it('returns an empty default (placeholder) when no fallback is supplied', () => {
    expect(resolvePreferredModelId('retired-model', available)).toBe('');
    expect(resolvePreferredModelId('', available)).toBe('');
  });

  it('does not restore a persisted id against an empty catalog', () => {
    expect(resolvePreferredModelId('gpt-5', [])).toBe('');
  });
});

describe('readPersistedModelId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the saved id from localStorage', () => {
    const store: Record<string, string> = { [PREFERRED_AI_MODEL_STORAGE_KEY]: 'gemini-2.5-pro' };
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
      },
    });

    expect(readPersistedModelId()).toBe('gemini-2.5-pro');
  });

  it('returns an empty string when nothing was saved', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
      },
    });

    expect(readPersistedModelId()).toBe('');
  });

  it('returns an empty string when localStorage throws (private mode)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
      },
    });

    expect(readPersistedModelId()).toBe('');
  });
});
