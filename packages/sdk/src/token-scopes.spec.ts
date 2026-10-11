import { describe, expect, it } from 'vitest';

import {
  LEGACY_OBJECT_STORAGE_SCOPES,
  objectStorageTokenScopes,
  signObjectStorageAccessToken,
  verifyObjectStorageAccessToken,
} from './token.js';

const SECRET = 'sdk-scope-secret';

/*
 * AUDX-022 — the token primitive itself. The route-level guard lives in
 * services/api; this pins the claim and the verification so a caller cannot get
 * a scope decision wrong by reading the payload directly.
 */
describe('AUDX-022 object-storage token scopes', () => {
  it('round-trips the scopes claim', () => {
    const token = signObjectStorageAccessToken({
      payload: { projectId: 'p1', expiresAt: Date.now() + 60_000, scopes: ['read'] },
      secret: SECRET,
    });

    const result = verifyObjectStorageAccessToken({ token, secret: SECRET });

    expect(result.ok).toBe(true);
    expect(result.payload?.scopes).toEqual(['read']);
  });

  it('rejects a token that lacks the required scope, naming the reason', () => {
    const token = signObjectStorageAccessToken({
      payload: { projectId: 'p1', expiresAt: Date.now() + 60_000, scopes: ['read'] },
      secret: SECRET,
    });

    const result = verifyObjectStorageAccessToken({ token, secret: SECRET, requiredScope: 'delete' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_scope');
  });

  it('treats a token minted before scopes existed as read+write only', () => {
    const legacy = signObjectStorageAccessToken({
      payload: { projectId: 'p1', expiresAt: Date.now() + 60_000 },
      secret: SECRET,
    });

    expect(verifyObjectStorageAccessToken({ token: legacy, secret: SECRET, requiredScope: 'read' }).ok).toBe(true);
    expect(verifyObjectStorageAccessToken({ token: legacy, secret: SECRET, requiredScope: 'write' }).ok).toBe(true);

    // The destructive verbs are withdrawn even from a token already in the wild.
    expect(verifyObjectStorageAccessToken({ token: legacy, secret: SECRET, requiredScope: 'delete' }).ok).toBe(false);
    expect(verifyObjectStorageAccessToken({ token: legacy, secret: SECRET, requiredScope: 'admin' }).ok).toBe(false);
  });

  it('treats an EMPTY scopes array as legacy rather than as "no permissions"', () => {
    /*
     * An empty array would otherwise mean a token that can do nothing at all,
     * which turns a malformed mint into a silent outage. Falling back to the
     * legacy set keeps the failure mode "too few verbs", never "none".
     */
    expect(objectStorageTokenScopes({ scopes: [] })).toEqual(LEGACY_OBJECT_STORAGE_SCOPES);
    expect(objectStorageTokenScopes({})).toEqual(LEGACY_OBJECT_STORAGE_SCOPES);
  });

  it('still enforces signature, expiry and project before any scope check', () => {
    const token = signObjectStorageAccessToken({
      payload: { projectId: 'p1', expiresAt: Date.now() - 1, scopes: ['read'] },
      secret: SECRET,
    });

    // Expiry must win over scope so an expired read token is not reported as a
    // mere scope problem.
    expect(verifyObjectStorageAccessToken({ token, secret: SECRET, requiredScope: 'delete' }).reason).toBe('expired');
  });
});
