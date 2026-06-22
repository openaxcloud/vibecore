import { describe, expect, it } from 'vitest';
import { getExistingAccountConnections, getRequestedScopes } from './ConnectionRequestCard';
import type {
  ConnectionRequestMessage,
  ConnectionRequestScopeDescription,
  ExistingAccountConnection,
} from '~/lib/chat/connector-messages';

const scope: ConnectionRequestScopeDescription = {
  scope: 'repo',
  label: 'Repositories',
  description: 'Read and write access',
};

const existing: ExistingAccountConnection = {
  userConnectionId: 'uc_1',
  accountLabel: 'octocat',
  scopes: ['repo'],
  scopesMatch: true,
};

describe('getRequestedScopes', () => {
  it('returns the scopes array when present', () => {
    expect(getRequestedScopes({ scopes: [scope] })).toEqual([scope]);
  });

  it('returns an empty array when scopes is undefined (persisted/imported part)', () => {
    // A connection_request that survived persistence/import may lack `scopes`.
    const payload = {} as Pick<ConnectionRequestMessage, 'scopes'>;
    expect(getRequestedScopes(payload)).toEqual([]);

    // The guarded `.length` read must not throw.
    expect(getRequestedScopes(payload).length).toBe(0);
  });

  it('returns an empty array when scopes is not an array', () => {
    const payload = { scopes: 'oops' as unknown as ConnectionRequestScopeDescription[] };
    expect(getRequestedScopes(payload)).toEqual([]);
  });
});

describe('getExistingAccountConnections', () => {
  it('returns the connections array when present', () => {
    expect(getExistingAccountConnections({ existingAccountConnections: [existing] })).toEqual([existing]);
  });

  it('returns an empty array when existingAccountConnections is undefined', () => {
    expect(getExistingAccountConnections({})).toEqual([]);
  });

  it('returns an empty array when existingAccountConnections is not an array', () => {
    const payload = {
      existingAccountConnections: 5 as unknown as ExistingAccountConnection[],
    };
    expect(getExistingAccountConnections(payload)).toEqual([]);
  });
});
