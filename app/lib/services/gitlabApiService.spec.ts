import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitLabApiService } from './gitlabApiService';

describe('GitLabApiService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('localizes authentication failures and masks the upstream payload', async () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'invalid token secret=raw' }, { status: 401 })),
    );

    const service = new GitLabApiService('glpat-test', 'https://gitlab.example.com');

    await expect(service.getUser()).rejects.toMatchObject({
      message:
        'Échec de l’authentification GitLab (HTTP 401). Vérifiez que votre jeton d’accès est valide et comprend les portées api et read_repository.',
      status: 401,
    });

    await service.getUser().catch((error: Error) => {
      expect(error.message).not.toContain('invalid token');
      expect(error.message).not.toContain('secret=raw');
    });
  });

  it('does not log GitLab access token material while making requests', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: 1,
        username: 'ada',
        name: 'Ada Lovelace',
        avatar_url: 'https://gitlab.example.com/avatar.png',
        web_url: 'https://gitlab.example.com/ada',
        created_at: '2026-05-03T00:00:00.000Z',
        bio: '',
        public_repos: 0,
        followers: 0,
        following: 0,
      }),
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    const token = 'glpat-super-secret-token';
    const service = new GitLabApiService(token, 'https://gitlab.example.com');
    await service.getUser();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gitlab.example.com/api/v4/user',
      expect.objectContaining({
        headers: expect.objectContaining({
          'PRIVATE-TOKEN': token,
        }),
      }),
    );
    expect(logSpy).not.toHaveBeenCalled();
  });
});
