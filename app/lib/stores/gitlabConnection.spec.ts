import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for the GitLab PAT leak in autoConnect()'s failure path.
 *
 * Previously the catch block did:
 *   console.error('GitLab auto-connect error details:', {
 *     token: envToken.substring(0, 10) + '...', error });
 * GitLab PATs have known fixed-length prefixes, so even 10 chars written to the
 * browser console materially reduces the token's secrecy. The fix removes all
 * token material from the console payload.
 */
describe('gitlabConnectionStore.autoConnect token leak', () => {
  const TOKEN = 'glpat-SuperSecretTokenValue1234567890';

  beforeEach(() => {
    // Provide an env token so autoConnect proceeds past the empty-token guard.
    vi.stubEnv('VITE_GITLAB_ACCESS_TOKEN', TOKEN);

    // Minimal browser globals the module touches on load / during connect.
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('window', {} as unknown as Window);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not write token material to the console when auto-connect fails', async () => {
    // Force getUser() to fail so the catch block runs.
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Import after stubbing env so module-load reads our token.
    vi.resetModules();

    const { gitlabConnectionStore } = await import('./gitlabConnection');

    const result = await gitlabConnectionStore.autoConnect();

    expect(result.success).toBe(false);

    // No console.error call (any argument, at any depth) may contain token material.
    const serialized = errorSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');

    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(TOKEN.substring(0, 10));
    expect(serialized).not.toContain('glpat-Supe'); // first 10 chars, explicitly
  });
});
