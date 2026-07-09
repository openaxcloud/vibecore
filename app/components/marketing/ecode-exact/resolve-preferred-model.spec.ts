import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREFERRED_AI_MODEL_PROVIDER_STORAGE_KEY,
  PREFERRED_AI_MODEL_STORAGE_KEY,
  persistPreferredModel,
  readPersistedModelId,
  readPersistedProvider,
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

describe('persistPreferredModel / readPersistedProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubLocalStorage(initial: Record<string, string> = {}) {
    const store: Record<string, string> = { ...initial };

    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
      },
    });

    return store;
  }

  it('persists the model id and provider together', () => {
    const store = stubLocalStorage();

    persistPreferredModel('gpt-5', 'OpenAI');

    expect(store[PREFERRED_AI_MODEL_STORAGE_KEY]).toBe('gpt-5');
    expect(store[PREFERRED_AI_MODEL_PROVIDER_STORAGE_KEY]).toBe('OpenAI');
    expect(readPersistedProvider()).toBe('OpenAI');
  });

  it('drops a stale provider when none is supplied', () => {
    const store = stubLocalStorage({ [PREFERRED_AI_MODEL_PROVIDER_STORAGE_KEY]: 'stale' });

    persistPreferredModel('gpt-5');

    expect(store[PREFERRED_AI_MODEL_STORAGE_KEY]).toBe('gpt-5');
    expect(PREFERRED_AI_MODEL_PROVIDER_STORAGE_KEY in store).toBe(false);
    expect(readPersistedProvider()).toBe('');
  });

  it('reads an empty provider on the server / when nothing saved', () => {
    expect(readPersistedProvider()).toBe('');
  });
});
