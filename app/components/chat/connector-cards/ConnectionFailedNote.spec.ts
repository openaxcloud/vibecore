import { describe, expect, it } from 'vitest';
import { reasonLabel } from './ConnectionFailedNote';

describe('reasonLabel', () => {
  it('maps each known failure reason to its specific label', () => {
    expect(reasonLabel('user_denied')).toBe('The connection was denied.');
    expect(reasonLabel('invalid_state')).toBe('The OAuth state could not be verified.');
    expect(reasonLabel('provider_error')).toBe('The provider returned an error.');
    expect(reasonLabel('scope_mismatch')).toBe('The granted scopes do not cover what the agent needs.');
    expect(reasonLabel('timeout')).toBe('The provider did not respond in time.');
  });

  it('falls back to a generic label for an unknown reason (out-of-union code)', () => {
    /*
     * The upstream filter does not validate `reason`, so a proxy/agent could
     * emit a code outside ConnectionFailureReason. Must not render blank.
     */
    expect(reasonLabel('access_revoked_upstream')).toBe('The connection could not be completed.');
    expect(reasonLabel('')).toBe('The connection could not be completed.');
  });

  it('falls back to a generic label for undefined', () => {
    expect(reasonLabel(undefined)).toBe('The connection could not be completed.');
  });
});
