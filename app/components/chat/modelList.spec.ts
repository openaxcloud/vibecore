import { describe, expect, it } from 'vitest';
import { AUTO_MODEL_OPTION, isAutoModel, modelListFromResponse, normalizeModelList } from './modelList';
import { AUTO_MODEL, DEFAULT_MODEL } from '~/utils/constants';

const validModel = {
  name: 'gpt-4o',
  label: 'GPT-4o',
  provider: 'OpenAI',
  maxTokenAllowed: 128_000,
};

describe('model list normalization', () => {
  it('returns an empty list for missing or malformed values', () => {
    expect(normalizeModelList(undefined)).toEqual([]);
    expect(normalizeModelList(null)).toEqual([]);
    expect(normalizeModelList({ length: 1 })).toEqual([]);
    expect(modelListFromResponse({ error: 'provider unavailable' })).toEqual([]);
  });

  it('keeps only complete model records', () => {
    expect(
      normalizeModelList([
        validModel,
        { name: 'missing-provider', label: 'Missing provider', maxTokenAllowed: 1_024 },
        { name: 'bad-token-window', label: 'Bad token window', provider: 'OpenAI', maxTokenAllowed: 'large' },
      ]),
    ).toEqual([validModel]);
  });

  it('extracts modelList arrays from API responses', () => {
    expect(modelListFromResponse({ modelList: [validModel] })).toEqual([validModel]);
  });
});

describe('Auto model option (opt-in complexity routing)', () => {
  it('exposes a valid, recommended, provider-agnostic Auto entry', () => {
    expect(AUTO_MODEL_OPTION.name).toBe(AUTO_MODEL);
    expect(AUTO_MODEL_OPTION.name).toBe('auto');
    expect(AUTO_MODEL_OPTION.label.toLowerCase()).toContain('recommended');
  });

  it('is OPT-IN: it is NOT the default model', () => {
    // A fresh user still defaults to the concrete frontier model, never 'auto'.
    expect(AUTO_MODEL).not.toBe(DEFAULT_MODEL);
    expect(isAutoModel(DEFAULT_MODEL)).toBe(false);
  });

  it('isAutoModel recognises the sentinel only', () => {
    expect(isAutoModel('auto')).toBe(true);
    expect(isAutoModel('gpt-4o')).toBe(false);
    expect(isAutoModel(undefined)).toBe(false);
    expect(isAutoModel(null)).toBe(false);
  });
});
