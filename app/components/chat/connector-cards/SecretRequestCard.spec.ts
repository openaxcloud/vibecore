import { describe, expect, it } from 'vitest';
import { buildSecretValue, getSecretFields } from './SecretRequestCard';
import type { SecretRequestField, SecretRequestMessage } from '~/lib/chat/connector-messages';

const apiKeyField: SecretRequestField = {
  name: 'OPENAI_API_KEY',
  label: 'OpenAI API Key',
  type: 'password',
  required: true,
};

const orgField: SecretRequestField = {
  name: 'OPENAI_ORG_ID',
  label: 'OpenAI Org ID',
  type: 'text',
  required: false,
};

describe('getSecretFields', () => {
  it('returns the fields array when present', () => {
    expect(getSecretFields({ fields: [apiKeyField] })).toEqual([apiKeyField]);
  });

  it('returns an empty array when fields is undefined (persisted/imported part)', () => {
    // A secret_request that survived persistence/import may lack `fields`.
    const payload = {} as Pick<SecretRequestMessage, 'fields'>;
    expect(getSecretFields(payload)).toEqual([]);

    // The guarded `.map` read must not throw.
    expect(() => getSecretFields(payload).map((field) => field.name)).not.toThrow();
  });

  it('returns an empty array when fields is not an array', () => {
    const payload = { fields: 'oops' as unknown as SecretRequestField[] };
    expect(getSecretFields(payload)).toEqual([]);
  });
});

describe('buildSecretValue', () => {
  it('stores the raw scalar value for a single field (no JSON double-encoding)', () => {
    const value = buildSecretValue([apiKeyField], { OPENAI_API_KEY: 'sk-abc123' });

    // Must be the raw key the runtime injects verbatim, not `{"OPENAI_API_KEY":"sk-abc123"}`.
    expect(value).toBe('sk-abc123');
    expect(() => JSON.parse(value)).toThrow();
  });

  it('returns an empty string when the single field has no value', () => {
    expect(buildSecretValue([apiKeyField], {})).toBe('');
  });

  it('JSON-packs the value map when more than one field is collected', () => {
    const values = { OPENAI_API_KEY: 'sk-abc123', OPENAI_ORG_ID: 'org-42' };
    const value = buildSecretValue([apiKeyField, orgField], values);

    // Multi-field secrets are intentionally JSON-encoded; consumers JSON.parse.
    expect(JSON.parse(value)).toEqual(values);
  });

  it('returns an empty JSON object string when no fields are present', () => {
    expect(buildSecretValue([], {})).toBe('{}');
  });
});
