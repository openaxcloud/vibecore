import { describe, expect, it } from 'vitest';
import { redactRecord } from './redact';

describe('redactRecord', () => {
  it('redacts top-level secret-named keys', () => {
    expect(redactRecord({ id: '1', token: 'abc', keyHash: 'h', password: 'p', secretValue: 's' })).toEqual({
      id: '1',
      token: '[redacted]',
      keyHash: '[redacted]',
      password: '[redacted]',
      secretValue: '[redacted]',
    });
  });

  it('redacts secrets nested inside benign-named object columns', () => {
    expect(
      redactRecord({
        id: '1',
        metadata: { region: 'eu', token: 'leak-me' },
        config: { provider: { apiPassword: 'hunter2', host: 'db' } },
      }),
    ).toEqual({
      id: '1',
      metadata: { region: 'eu', token: '[redacted]' },
      config: { provider: { apiPassword: '[redacted]', host: 'db' } },
    });
  });

  it('redacts secrets inside arrays of objects', () => {
    expect(
      redactRecord({
        providers: [
          { name: 'github', accessToken: 't1' },
          { name: 'gitlab', accessToken: 't2' },
        ],
      }),
    ).toEqual({
      providers: [
        { name: 'github', accessToken: '[redacted]' },
        { name: 'gitlab', accessToken: '[redacted]' },
      ],
    });
  });

  it('preserves non-secret values verbatim', () => {
    expect(redactRecord({ id: '1', count: 3, active: true, tags: ['a', 'b'], nested: { ok: 1 } })).toEqual({
      id: '1',
      count: 3,
      active: true,
      tags: ['a', 'b'],
      nested: { ok: 1 },
    });
  });

  it('does not redact null/undefined under secret keys (no crash)', () => {
    expect(redactRecord({ token: null, password: undefined })).toEqual({
      token: '[redacted]',
      password: '[redacted]',
    });
  });
});
