import { describe, expect, it } from 'vitest';
import { modelListFromResponse, normalizeModelList } from './modelList';

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
