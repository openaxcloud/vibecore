import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { apiRequest } from '~/lib/enterprise-api.server';
import {
  MAX_METRIC_REPOS,
  METRICS_CONCURRENCY,
  mapRecentActivity,
  mapWithConcurrency,
} from '~/lib/github-stats-metrics';
import { webApiErrorResponse, webApiLocaleHeaders } from '~/lib/i18n/catalogs/web-api-routes';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';
import type { GitHubUserResponse, GitHubStats } from '~/types/GitHub';

const githubHeaders = (token: string) => ({
  Accept: 'application/vnd.github.v3+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'e-code-app',
});

async function githubJson<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    console.error('GitHub request failed:', { path, status: response.status });
    throw new Error();
  }

  return response.json() as Promise<T>;
}

async function githubPaginated<T>(token: string, path: string): Promise<T[]> {
  const items: T[] = [];

  /*
   * Bound the sequential blocking fan-out: an account/org with thousands of
   * repos/gists could otherwise pin the request through dozens of serial GitHub
   * fetches (and blow the rate budget). 20 pages × 100 = 2000 items is plenty
   * for a stats summary.
   */
  const MAX_PAGES = 20;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const pageItems = await githubJson<T[]>(token, `${path}${separator}per_page=100&page=${page}`);
    items.push(...pageItems);

    if (pageItems.length < 100) {
      break;
    }
  }

  return items;
}

async function githubCount(token: string, path: string): Promise<number> {
  const separator = path.includes('?') ? '&' : '?';

  const response = await fetch(`https://api.github.com${path}${separator}per_page=1`, {
    headers: githubHeaders(token),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    return 0;
  }

  const linkHeader = response.headers.get('Link');
  const lastPage = linkHeader?.match(/page=(\d+)>; rel="last"/)?.[1];

  if (lastPage) {
    return parseInt(lastPage, 10);
  }

  const data = await response.json();

  return Array.isArray(data) ? data.length : 0;
}

async function githubStatsLoader({ request }: { request: Request; context?: unknown }) {
  try {
    /*
     * First try the UserConnection-backed flow: the API service decrypts
     * the token from packages/database UserConnection.accessTokenEncrypted
     * and aggregates basic stats on the builder's behalf.
     */
    try {
      const upstream = await apiRequest<GitHubStats>(request, '/api/github-stats');

      return json(upstream, { headers: webApiLocaleHeaders(request) });
    } catch (error) {
      if (!(error instanceof Response) || error.status !== 401) {
        throw error;
      }
    }

    /*
     * Legacy fallback: pull a GitHub PAT from the CALLER's cookies only so
     * existing builders keep seeing their stats until they reconnect through
     * OAuth. The server credential (context env / process.env GITHUB_TOKEN) must
     * NOT be used here: this loader is unauthenticated (withSecurity, no auth),
     * so falling back to the platform token would let any anonymous caller read
     * the platform account's repos/orgs/profile through this endpoint.
     */
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    const githubToken = apiKeys.GITHUB_API_KEY || apiKeys.VITE_GITHUB_ACCESS_TOKEN;

    if (!githubToken) {
      return webApiErrorResponse(request, 'GITHUB_TOKEN_MISSING', 401);
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: githubHeaders(githubToken),
      signal: AbortSignal.timeout(15000),
    });

    if (!userResponse.ok) {
      if (userResponse.status === 401) {
        return webApiErrorResponse(request, 'GITHUB_TOKEN_INVALID', 401);
      }

      console.error('GitHub user request failed:', { status: userResponse.status });
      throw new Error();
    }

    const user = (await userResponse.json()) as GitHubUserResponse;

    const allRepos = await githubPaginated<any>(
      githubToken,
      '/user/repos?sort=updated&affiliation=owner,organization_member',
    );

    const [organizationsResult, recentActivityResult, gistsResult] = await Promise.allSettled([
      githubPaginated<any>(githubToken, '/user/orgs'),
      githubJson<any[]>(githubToken, `/users/${encodeURIComponent(user.login)}/events?per_page=10`),
      githubPaginated<any>(githubToken, '/gists'),
    ]);

    const repoMetrics = await mapWithConcurrency(
      allRepos.slice(0, MAX_METRIC_REPOS),
      METRICS_CONCURRENCY,
      async (repo) => ({
        fullName: repo.full_name,
        branches: await githubCount(githubToken, `/repos/${repo.full_name}/branches`),
        contributors: await githubCount(githubToken, `/repos/${repo.full_name}/contributors`),
        issues: await githubCount(githubToken, `/repos/${repo.full_name}/issues?state=all`),
        pullRequests: await githubCount(githubToken, `/repos/${repo.full_name}/pulls?state=all`),
      }),
    );

    const metricsByRepo = new Map(
      repoMetrics
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map((result) => [result.value.fullName, result.value]),
    );

    // Calculate comprehensive stats
    const now = new Date();
    const publicRepos = allRepos.filter((repo) => !repo.private).length;
    const privateRepos = allRepos.filter((repo) => repo.private).length;

    // Language statistics
    const languageStats = new Map<string, number>();
    const languageBytes = new Map<string, number>();
    allRepos.forEach((repo) => {
      if (repo.language) {
        languageStats.set(repo.language, (languageStats.get(repo.language) || 0) + 1);
        languageBytes.set(repo.language, (languageBytes.get(repo.language) || 0) + (repo.size || 0));
      }
    });

    // Activity stats
    const totalStars = allRepos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
    const totalForks = allRepos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);

    const gists = gistsResult.status === 'fulfilled' ? gistsResult.value : [];
    const totalBranches = allRepos.reduce((sum, repo) => sum + (metricsByRepo.get(repo.full_name)?.branches ?? 0), 0);

    const totalContributors = allRepos.reduce(
      (sum, repo) => sum + (metricsByRepo.get(repo.full_name)?.contributors ?? 0),
      0,
    );

    const totalIssues = allRepos.reduce((sum, repo) => sum + (metricsByRepo.get(repo.full_name)?.issues ?? 0), 0);

    const totalPullRequests = allRepos.reduce(
      (sum, repo) => sum + (metricsByRepo.get(repo.full_name)?.pullRequests ?? 0),
      0,
    );

    const stats: GitHubStats = {
      repos: allRepos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        clone_url: repo.clone_url || '',
        description: repo.description,
        private: repo.private,
        language: repo.language,
        updated_at: repo.updated_at,
        stargazers_count: repo.stargazers_count || 0,
        forks_count: repo.forks_count || 0,
        watchers_count: repo.watchers_count || 0,
        topics: repo.topics || [],
        fork: repo.fork || false,
        archived: repo.archived || false,
        size: repo.size || 0,
        default_branch: repo.default_branch || 'main',
        languages_url: repo.languages_url || '',
      })),
      organizations: organizationsResult.status === 'fulfilled' ? organizationsResult.value : [],
      recentActivity: recentActivityResult.status === 'fulfilled' ? mapRecentActivity(recentActivityResult.value) : [],
      languages: Object.fromEntries(languageStats.entries()),
      totalGists: gists.length || user.public_gists || 0,
      publicRepos,
      privateRepos,
      stars: totalStars,
      forks: totalForks,
      totalStars,
      totalForks,
      followers: user.followers || 0,
      publicGists: user.public_gists || 0,
      privateGists: Math.max(0, gists.filter((gist) => gist.public === false).length),
      lastUpdated: now.toISOString(),
      totalBranches,
      totalContributors,
      totalIssues,
      totalPullRequests,
      mostUsedLanguages: [...languageBytes.entries()]
        .map(([language, bytes]) => ({
          language,
          bytes,
          repos: languageStats.get(language) ?? 0,
        }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 20),
    };

    return json(stats, { headers: webApiLocaleHeaders(request) });
  } catch (error) {
    console.error('Error fetching GitHub stats:', error);
    return webApiErrorResponse(request, 'GITHUB_STATS_FAILED', 503);
  }
}

export const loader = withSecurity(githubStatsLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});
