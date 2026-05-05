import { describe, expect, it } from 'vitest';
import { signAgentToken, verifyAgentToken } from './index.js';

describe('workspace agent tokens', () => {
  it('signs and verifies short-lived workspace tokens', () => {
    const token = signAgentToken({ workspaceId: 'workspace_1', expiresAt: Date.now() + 60_000, secret: 'secret' });

    expect(verifyAgentToken(token, 'secret', 'workspace_1')).toBe(true);
    expect(verifyAgentToken(token, 'secret', 'workspace_2')).toBe(false);
    expect(verifyAgentToken(token, 'wrong', 'workspace_1')).toBe(false);
  });
});
