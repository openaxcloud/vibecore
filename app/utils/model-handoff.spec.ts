import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_MODEL_ID_STORAGE_KEY,
  PENDING_MODEL_PROVIDER_STORAGE_KEY,
  clearModelHandoff,
  readModelHandoff,
  resolveHandoffModelSelection,
  stashModelHandoff,
  type ResolvableModel,
} from './model-handoff';

/* Minimal in-memory sessionStorage stub good enough for the hand-off helpers. */
function stubSessionStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };

  vi.stubGlobal('window', {
    sessionStorage: {
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

/*
 * A representative catalog: Anthropic is the platform default provider, and the
 * visitor's landing choice is an OpenAI GPT model. `gpt-oss` intentionally
 * exists under two providers to exercise the provider-hint disambiguation.
 */
const catalog: ResolvableModel[] = [
  { name: 'claude-sonnet-4-5', provider: 'Anthropic' },
  { name: 'gpt-5', provider: 'OpenAI' },
  { name: 'gpt-oss', provider: 'OpenAI' },
  { name: 'gpt-oss', provider: 'OpenRouter' },
];

describe('stash / read / clear model hand-off', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a stashed model id and provider through sessionStorage', () => {
    const store = stubSessionStorage();

    stashModelHandoff('gpt-5', 'OpenAI');

    expect(store[PENDING_MODEL_ID_STORAGE_KEY]).toBe('gpt-5');
    expect(store[PENDING_MODEL_PROVIDER_STORAGE_KEY]).toBe('OpenAI');
    expect(readModelHandoff()).toEqual({ modelId: 'gpt-5', provider: 'OpenAI' });
  });

  it('clears any previously stashed provider when none is supplied', () => {
    const store = stubSessionStorage({ [PENDING_MODEL_PROVIDER_STORAGE_KEY]: 'stale' });

    stashModelHandoff('gpt-5');

    expect(store[PENDING_MODEL_ID_STORAGE_KEY]).toBe('gpt-5');
    expect(PENDING_MODEL_PROVIDER_STORAGE_KEY in store).toBe(false);
    expect(readModelHandoff()).toEqual({ modelId: 'gpt-5', provider: '' });
  });

  it('never stashes an empty selection (placeholder)', () => {
    const store = stubSessionStorage();

    stashModelHandoff('', 'OpenAI');
    stashModelHandoff('   ', 'OpenAI');

    expect(PENDING_MODEL_ID_STORAGE_KEY in store).toBe(false);
    expect(readModelHandoff()).toEqual({ modelId: '', provider: '' });
  });

  it('clears both keys', () => {
    const store = stubSessionStorage({
      [PENDING_MODEL_ID_STORAGE_KEY]: 'gpt-5',
      [PENDING_MODEL_PROVIDER_STORAGE_KEY]: 'OpenAI',
    });

    clearModelHandoff();

    expect(PENDING_MODEL_ID_STORAGE_KEY in store).toBe(false);
    expect(PENDING_MODEL_PROVIDER_STORAGE_KEY in store).toBe(false);
  });

  it('reads empty strings on the server (no window)', () => {
    // no window stub
    expect(readModelHandoff()).toEqual({ modelId: '', provider: '' });
  });
});

describe('resolveHandoffModelSelection', () => {
  it('resolves a chosen OpenAI GPT model to its concrete provider/model (not the default)', () => {
    const resolved = resolveHandoffModelSelection({ modelId: 'gpt-5', provider: 'OpenAI' }, catalog);

    expect(resolved).toEqual({ provider: 'OpenAI', model: 'gpt-5' });

    // Explicitly NOT the platform default.
    expect(resolved?.model).not.toBe('claude-sonnet-4-5');
  });

  it('uses the provider hint to disambiguate a model offered by two providers', () => {
    expect(resolveHandoffModelSelection({ modelId: 'gpt-oss', provider: 'OpenRouter' }, catalog)).toEqual({
      provider: 'OpenRouter',
      model: 'gpt-oss',
    });
  });

  it('resolves by name alone when no provider hint is given', () => {
    // First occurrence wins.
    expect(resolveHandoffModelSelection({ modelId: 'gpt-oss' }, catalog)).toEqual({
      provider: 'OpenAI',
      model: 'gpt-oss',
    });
  });

  it('falls back to name match when the provider hint is stale but the name exists', () => {
    expect(resolveHandoffModelSelection({ modelId: 'gpt-5', provider: 'RetiredProvider' }, catalog)).toEqual({
      provider: 'OpenAI',
      model: 'gpt-5',
    });
  });

  it('returns null for a model id the catalog does not offer (graceful fallback)', () => {
    expect(resolveHandoffModelSelection({ modelId: 'some-retired-model', provider: 'OpenAI' }, catalog)).toBeNull();
  });

  it('returns null for an empty candidate', () => {
    expect(resolveHandoffModelSelection({ modelId: '' }, catalog)).toBeNull();
    expect(resolveHandoffModelSelection({ modelId: '   ' }, catalog)).toBeNull();
  });
});

/*
 * Mirrors the submit-body construction inside projects.new's auto-submit effect:
 * the resolved model becomes the posted `model`/`provider`, proving the visitor's
 * landing choice reaches the create action instead of the DEFAULT_MODEL fallback.
 */
describe('auto-submit body carries the chosen model', () => {
  function buildSubmitBody(candidateModelId: string, providerHint: string, prompt: string) {
    const resolved = candidateModelId
      ? resolveHandoffModelSelection({ modelId: candidateModelId, provider: providerHint }, catalog)
      : null;

    const body: Record<string, string> = { prompt };

    if (resolved) {
      body.model = resolved.model;
      body.provider = resolved.provider;
    }

    return body;
  }

  it('submits the chosen model + provider when the hand-off resolves', () => {
    expect(buildSubmitBody('gpt-5', 'OpenAI', 'Build a CRM')).toEqual({
      prompt: 'Build a CRM',
      model: 'gpt-5',
      provider: 'OpenAI',
    });
  });

  it('omits model/provider (defaults preserved) when there is no hand-off', () => {
    expect(buildSubmitBody('', '', 'Build a CRM')).toEqual({ prompt: 'Build a CRM' });
  });

  it('omits model/provider when the stashed id is no longer offered', () => {
    expect(buildSubmitBody('retired-model', 'OpenAI', 'Build a CRM')).toEqual({ prompt: 'Build a CRM' });
  });
});
