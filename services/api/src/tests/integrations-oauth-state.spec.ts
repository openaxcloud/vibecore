import { describe, expect, it } from 'vitest';
import {
  signIntegrationOauthState,
  verifyIntegrationOauthState,
  resolveIntegrationOauthStateSecret,
  type IntegrationOAuthStateContext,
} from '../integrations/oauth-state.js';

const secret = 'integration-state-secret-do-not-ship';

const baseContext: IntegrationOAuthStateContext = {
  provider: 'github',
  projectId: 'proj_iso_1',
  userId: 'user_iso_1',
  organizationId: 'org_iso_1',
};

describe('signIntegrationOauthState / verifyIntegrationOauthState', () => {
  it('round-trips a full context payload', () => {
    const state = signIntegrationOauthState({ context: baseContext, secret });
    const result = verifyIntegrationOauthState({ state, expectedProvider: 'github', secret });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context).toEqual(baseContext);
    }
  });

  it('rejects when the dot separator is missing', () => {
    const result = verifyIntegrationOauthState({ state: 'no-separator-here', expectedProvider: 'github', secret });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformed');
    }
  });

  it('rejects when the signature is forged with another secret', () => {
    const state = signIntegrationOauthState({ context: baseContext, secret: 'a-totally-different-secret-value' });
    const result = verifyIntegrationOauthState({ state, expectedProvider: 'github', secret });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid_signature');
    }
  });

  it('rejects an expired state', () => {
    const state = signIntegrationOauthState({
      context: baseContext,
      secret,
      now: 0,
      ttlSeconds: 60,
    });

    const result = verifyIntegrationOauthState({
      state,
      expectedProvider: 'github',
      secret,
      now: 200_000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('expired');
    }
  });

  it('rejects when the expected provider does not match the encoded one', () => {
    const state = signIntegrationOauthState({ context: baseContext, secret });
    const result = verifyIntegrationOauthState({ state, expectedProvider: 'slack', secret });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('provider_mismatch');
    }
  });

  it('rejects when the payload base64 decodes but is not the expected shape', () => {
    const encoded = Buffer.from(JSON.stringify({ provider: 'github' }), 'utf8').toString('base64url');
    const wrongSig = Buffer.from('not-the-real-signature', 'utf8').toString('base64url');
    const result = verifyIntegrationOauthState({ state: `${encoded}.${wrongSig}`, expectedProvider: 'github', secret });

    expect(result.ok).toBe(false);
  });

  it('two consecutive signings produce different state strings (nonce randomized)', () => {
    const a = signIntegrationOauthState({ context: baseContext, secret });
    const b = signIntegrationOauthState({ context: baseContext, secret });

    expect(a).not.toBe(b);
  });

  it('resolveIntegrationOauthStateSecret prefers OAUTH_STATE_SECRET, then JWT_SECRET, then a default', () => {
    expect(resolveIntegrationOauthStateSecret({ OAUTH_STATE_SECRET: 'a', JWT_SECRET: 'b' })).toBe('a');
    expect(resolveIntegrationOauthStateSecret({ JWT_SECRET: 'b' })).toBe('b');
    expect(resolveIntegrationOauthStateSecret({})).toBe('dev-jwt-secret-change-me');
  });
});
