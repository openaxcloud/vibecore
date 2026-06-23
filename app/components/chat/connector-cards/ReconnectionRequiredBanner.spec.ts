import { describe, expect, it } from 'vitest';
import { reasonLabel } from './ReconnectionRequiredBanner';

describe('reasonLabel', () => {
  it('maps known reconnection reasons to human-readable labels', () => {
    expect(reasonLabel('token_expired')).toBe('The access token expired.');
    expect(reasonLabel('token_revoked')).toBe('The token was revoked at the provider.');
    expect(reasonLabel('scope_insufficient')).toBe('The current scopes no longer cover the agent request.');
  });

  it('falls back to a generic label for unknown reasons', () => {
    expect(reasonLabel('mystery_reason')).toBe('Reconnection is required to continue.');
    expect(reasonLabel('')).toBe('Reconnection is required to continue.');
  });

  it('falls back to a generic label when the reason is missing', () => {
    expect(reasonLabel(undefined)).toBe('Reconnection is required to continue.');
  });
});
