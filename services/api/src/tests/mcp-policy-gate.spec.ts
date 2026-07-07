import { describe, expect, it } from 'vitest';

import { evaluatePolicyGate, McpMarketplaceError, type McpOrgPolicyMode } from '../mcp-marketplace.js';

/*
 * Pure unit tests for the shared install gate (no DB). The same function backs
 * both the org policy and the new platform-wide (global) policy — install()
 * runs it for the global rows first, then the org rows.
 */
function rows(...pairs: Array<[string, McpOrgPolicyMode]>) {
  return pairs.map(([slug, mode]) => ({ slug, mode }));
}

describe('evaluatePolicyGate', () => {
  it('is default-open when there are no rows', () => {
    expect(() => evaluatePolicyGate([], 'anything', 'organization')).not.toThrow();
    expect(() => evaluatePolicyGate([], 'anything', 'platform')).not.toThrow();
  });

  it('blocks a slug that is explicitly blocked', () => {
    expect(() => evaluatePolicyGate(rows(['a', 'blocked']), 'a', 'organization')).toThrowError(McpMarketplaceError);

    try {
      evaluatePolicyGate(rows(['a', 'blocked']), 'a', 'organization');
    } catch (error) {
      expect((error as McpMarketplaceError).code).toBe('MCP_ORG_POLICY_BLOCKED');
      expect((error as McpMarketplaceError).statusCode).toBe(403);
    }
  });

  it('does not block a different slug', () => {
    expect(() => evaluatePolicyGate(rows(['a', 'blocked']), 'b', 'organization')).not.toThrow();
  });

  it('restricts to the allow-list once any allowed/forced row exists', () => {
    // 'a' is allowed → allow-list is in force; 'b' is not on it → denied.
    expect(() => evaluatePolicyGate(rows(['a', 'allowed']), 'a', 'organization')).not.toThrow();
    expect(() => evaluatePolicyGate(rows(['a', 'allowed']), 'b', 'organization')).toThrowError(McpMarketplaceError);

    try {
      evaluatePolicyGate(rows(['a', 'allowed']), 'b', 'organization');
    } catch (error) {
      expect((error as McpMarketplaceError).code).toBe('MCP_ORG_POLICY_NOT_ALLOWED');
    }
  });

  it('treats forced as part of the allow-list', () => {
    expect(() => evaluatePolicyGate(rows(['a', 'forced']), 'a', 'organization')).not.toThrow();
    expect(() => evaluatePolicyGate(rows(['a', 'forced']), 'b', 'organization')).toThrowError(McpMarketplaceError);
  });

  it('uses platform-scoped error codes for the global tier', () => {
    try {
      evaluatePolicyGate(rows(['a', 'blocked']), 'a', 'platform');
    } catch (error) {
      expect((error as McpMarketplaceError).code).toBe('MCP_GLOBAL_POLICY_BLOCKED');
    }

    try {
      evaluatePolicyGate(rows(['a', 'allowed']), 'b', 'platform');
    } catch (error) {
      expect((error as McpMarketplaceError).code).toBe('MCP_GLOBAL_POLICY_NOT_ALLOWED');
    }
  });

  it('a block wins even when the slug is also allow-listed elsewhere', () => {
    // Same slug can only carry one mode in practice, but the gate is defensive:
    // an explicit block on the slug denies regardless of other allowed rows.
    expect(() => evaluatePolicyGate(rows(['a', 'allowed'], ['b', 'blocked']), 'b', 'platform')).toThrowError(
      McpMarketplaceError,
    );
  });
});
