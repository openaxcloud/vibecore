import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiServiceClass } from './githubApiService';

const baseURL = 'https://api.github.com';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GitHubApiServiceClass.getAllUserRepositories', () => {
  it('caps pagination at 50 pages even when every page is full (no runaway loop)', async () => {
    let callCount = 0;

    // Always return a full page of 100 repos so hasMore never flips false.
    const fetchMock = vi.fn(async (url: string) => {
      expect(url.startsWith(`${baseURL}/user/repos`)).toBe(true);
      callCount++;

      const repos = Array.from({ length: 100 }, (_, i) => ({ id: callCount * 1000 + i }));

      return Response.json(repos);
    });

    vi.stubGlobal('fetch', fetchMock);

    const service = new GitHubApiServiceClass();
    service.configure({ token: 'ghp_test', tokenType: 'classic' });

    const repos = await service.getAllUserRepositories();

    // Exactly 50 requests (the hard cap), not unbounded.
    expect(callCount).toBe(50);
    expect(repos).toHaveLength(50 * 100);
  });

  it('stops early when a page is not full', async () => {
    let callCount = 0;

    const fetchMock = vi.fn(async () => {
      callCount++;

      // First page full, second page partial -> stop.
      const repos =
        callCount === 1
          ? Array.from({ length: 100 }, (_, i) => ({ id: i }))
          : Array.from({ length: 7 }, (_, i) => ({ id: 1000 + i }));

      return Response.json(repos);
    });

    vi.stubGlobal('fetch', fetchMock);

    const service = new GitHubApiServiceClass();
    service.configure({ token: 'ghp_test', tokenType: 'classic' });

    const repos = await service.getAllUserRepositories();

    expect(callCount).toBe(2);
    expect(repos).toHaveLength(107);
  });
});

describe('GitHubApiServiceClass issues count excludes pull requests', () => {
  it('uses the search API with is:issue and returns total_count (not inflated by PRs)', async () => {
    const requestedUrls: string[] = [];

    const fetchMock = vi.fn(async (url: string) => {
      requestedUrls.push(url);

      if (url.startsWith(`${baseURL}/repos/octocat/hello-world/branches`)) {
        return Response.json([]);
      }

      if (url.startsWith(`${baseURL}/repos/octocat/hello-world/contributors`)) {
        return Response.json([{ id: 1 }]);
      }

      if (url.startsWith(`${baseURL}/repos/octocat/hello-world/pulls`)) {
        // 12 PRs reported via the Link-header last-page trick.
        return new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            Link: `<${baseURL}/repos/octocat/hello-world/pulls?per_page=1&page=12>; rel="last"`,
          },
        });
      }

      if (url.startsWith(`${baseURL}/search/issues`)) {
        // Exactly 3 real issues (PRs excluded by is:issue).
        return Response.json({ total_count: 3, items: [] });
      }

      if (url.startsWith(`${baseURL}/repos/octocat/hello-world`)) {
        return Response.json({ id: 99, full_name: 'octocat/hello-world' });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const service = new GitHubApiServiceClass();
    service.configure({ token: 'ghp_test', tokenType: 'classic' });

    const info = await service.getDetailedRepositoryInfo('octocat', 'hello-world');

    // Issues count comes from the PR-excluding search endpoint.
    expect(info.issues_count).toBe(3);
    expect(info.pull_requests_count).toBe(12);

    const searchUrl = requestedUrls.find((u) => u.startsWith(`${baseURL}/search/issues`));
    expect(searchUrl).toBeDefined();
    expect(searchUrl).toContain('is%3Aissue');
    expect(searchUrl).toContain('repo%3Aoctocat%2Fhello-world');
  });
});
