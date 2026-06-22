import { describe, expect, it } from 'vitest';
import { deriveWorkspaceSecret, signAgentToken, verifyAgentToken } from './index.js';

describe('workspace agent tokens', () => {
  it('signs and verifies short-lived workspace tokens', () => {
    const token = signAgentToken({ workspaceId: 'workspace_1', expiresAt: Date.now() + 60_000, secret: 'secret' });

    expect(verifyAgentToken(token, 'secret', 'workspace_1')).toBe(true);
    expect(verifyAgentToken(token, 'secret', 'workspace_2')).toBe(false);
    expect(verifyAgentToken(token, 'wrong', 'workspace_1')).toBe(false);
  });
});

describe('deriveWorkspaceSecret', () => {
  const root = 'platform-root-secret';

  it('is deterministic for the same root + workspaceId', () => {
    expect(deriveWorkspaceSecret(root, 'ws_1')).toBe(deriveWorkspaceSecret(root, 'ws_1'));
  });

  it('produces a different key per workspace', () => {
    expect(deriveWorkspaceSecret(root, 'ws_1')).not.toBe(deriveWorkspaceSecret(root, 'ws_2'));
  });

  it('produces a different key per root secret', () => {
    expect(deriveWorkspaceSecret('root-a', 'ws_1')).not.toBe(deriveWorkspaceSecret('root-b', 'ws_1'));
  });

  it('never returns the root secret itself (one-way derivation)', () => {
    const derived = deriveWorkspaceSecret(root, 'ws_1');
    expect(derived).not.toBe(root);
    expect(derived).not.toContain(root);
  });

  it('binds a token to exactly one workspace key — no cross-workspace reuse', () => {
    const token = signAgentToken({
      workspaceId: 'ws_1',
      expiresAt: Date.now() + 60_000,
      secret: deriveWorkspaceSecret(root, 'ws_1'),
    });

    expect(verifyAgentToken(token, deriveWorkspaceSecret(root, 'ws_1'), 'ws_1')).toBe(true);
    // A pod holding ws_2's derived key (the only secret it ever sees) rejects it.
    expect(verifyAgentToken(token, deriveWorkspaceSecret(root, 'ws_2'), 'ws_2')).toBe(false);
    // The raw root no longer validates tenant tokens, so a root leak isn't required to be a token oracle.
    expect(verifyAgentToken(token, root, 'ws_1')).toBe(false);
  });
});
