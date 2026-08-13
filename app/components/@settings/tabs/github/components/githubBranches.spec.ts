import { describe, it, expect, vi } from 'vitest';
import { isOAuthConnection, normaliseProxyBranches, resolveCloneBranches } from './githubBranches';
import type { GitHubConnection } from '~/types/GitHub';

const oauthConnection = {
  user: { login: 'octocat' } as any,
  token: '',
  tokenType: 'classic',
} as unknown as GitHubConnection;

const tokenConnection = {
  user: { login: 'octocat' } as any,
  token: 'ghp_abc123',
  tokenType: 'classic',
} as unknown as GitHubConnection;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('isOAuthConnection', () => {
  it('is true when a user is present but no client token (OAuth/server-side)', () => {
    expect(isOAuthConnection(oauthConnection)).toBe(true);
  });

  it('is false when a client token is present (legacy flow)', () => {
    expect(isOAuthConnection(tokenConnection)).toBe(false);
  });

  it('is false for null / disconnected', () => {
    expect(isOAuthConnection(null)).toBe(false);
  });
});

describe('normaliseProxyBranches', () => {
  it('normalises raw GitHub branches, flags the default, and sorts it first', () => {
    const raw = [
      { name: 'feature', commit: { sha: 'aaaa' }, protected: false },
      { name: 'main', commit: { sha: 'bbbb' }, protected: true },
    ];

    const result = normaliseProxyBranches(raw, 'main');

    expect(result.defaultBranch).toBe('main');
    expect(result.branches.map((b) => b.name)).toEqual(['main', 'feature']);
    expect(result.branches[0]).toMatchObject({ name: 'main', sha: 'bbbb', protected: true, isDefault: true });
  });

  it('tolerates malformed entries', () => {
    const result = normaliseProxyBranches([{ name: 'main' }, null, { commit: { sha: 'x' } }], 'main');
    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]).toMatchObject({ name: 'main', sha: '', isDefault: true });
  });
});

describe('resolveCloneBranches', () => {
  it('routes OAuth connections through /api/github-user proxy (no token required) — the bug fix', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ branches: [{ name: 'main', commit: { sha: 'deadbeef' }, protected: false }] }));

    const result = await resolveCloneBranches(oauthConnection, 'octocat/hello', 'main', fetchImpl as any);

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/github-user');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ action: 'get_branches', repo: 'octocat/hello' });

    // Crucially: no empty token is sent and the legacy route is NOT hit.
    expect(body.token).toBeUndefined();

    expect(result.branches.map((b) => b.name)).toEqual(['main']);
    expect(result.branches[0].isDefault).toBe(true);
  });

  it('routes legacy token connections through /api/github-branches with the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        branches: [{ name: 'main', sha: 'abc', protected: false, isDefault: true }],
        defaultBranch: 'main',
      }),
    );

    await resolveCloneBranches(tokenConnection, 'octocat/hello', 'main', fetchImpl as any);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/github-branches');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ owner: 'octocat', repo: 'hello', token: 'ghp_abc123' });
  });

  it('surfaces the server error message when the proxy fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'CONNECTOR_NOT_LINKED' }, false, 401));

    await expect(resolveCloneBranches(oauthConnection, 'octocat/hello', 'main', fetchImpl as any)).rejects.toThrow(
      'CONNECTOR_NOT_LINKED',
    );
  });

  it('rejects an invalid repository name', async () => {
    const fetchImpl = vi.fn();
    await expect(resolveCloneBranches(oauthConnection, 'not-a-repo', 'main', fetchImpl as any)).rejects.toThrow(
      'Invalid repository name',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
