import { describe, expect, it } from 'vitest';

import { getEnterpriseApiErrorCopy } from './enterprise-api-errors';

describe('enterprise API error copy', () => {
  it('resolves French and falls back to English', () => {
    expect(getEnterpriseApiErrorCopy('fr-FR').requestFailed).toContain('requête');
    expect(getEnterpriseApiErrorCopy('de-DE').requestFailed).toContain('request');
  });
});
