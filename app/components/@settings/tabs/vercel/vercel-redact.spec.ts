import { describe, expect, it } from 'vitest';
import { redactVercelConnection } from './vercel-redact';
import type { VercelConnection } from '~/types/vercel';

describe('redactVercelConnection', () => {
  it('never exposes the raw token and reports it as a boolean flag', () => {
    const connection: VercelConnection = {
      user: { id: 'u1', username: 'alice', email: 'alice@example.com', name: 'Alice' },
      token: 'vercel_super_secret_high_privilege_token',
      stats: { projects: [], totalProjects: 3 },
    };

    const redacted = redactVercelConnection(connection);

    expect(redacted).toEqual({
      user: connection.user,
      hasToken: true,
      totalProjects: 3,
    });

    // The serialized redacted form must not contain the secret anywhere.
    expect(JSON.stringify(redacted)).not.toContain(connection.token);
    expect(Object.values(redacted)).not.toContain(connection.token);
  });

  it('reports hasToken=false for an empty token', () => {
    const connection: VercelConnection = { user: null, token: '' };

    expect(redactVercelConnection(connection)).toEqual({
      user: null,
      hasToken: false,
      totalProjects: 0,
    });
  });
});
