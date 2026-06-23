import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { apiRequest } from '~/lib/enterprise-api.server';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

async function githubUserLoader({ request }: { request: Request; context?: unknown }) {
  try {
    /*
     * First try the UserConnection-backed flow: the API service decrypts
     * the token from packages/database UserConnection.accessTokenEncrypted
     * and calls api.github.com on the builder's behalf. This is the Phase
     * 1 path that replaces the legacy localStorage / cookie token.
     */
    try {
      const upstream = await apiRequest<{
        login: string;
        avatar_url: string;
        html_url: string;
        name: string;
      }>(request, '/api/github-user');

      return json(upstream);
    } catch (error) {
      /*
       * The API service returns 401 CONNECTOR_NOT_LINKED when the current
       * user has no active GitHub UserConnection. In that case we fall
       * back to the legacy cookie / env GitHub PAT so existing users who
       * pasted a token before the OAuth flow shipped keep working until
       * they reconnect.
       */
      if (!(error instanceof Response) || error.status !== 401) {
        throw error;
      }
    }

    /*
     * Legacy fallback: pull a GitHub PAT from cookies / env until the
     * builder reconnects through the new OAuth flow.
     */
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    /*
     * Only the CALLER's cookie token — NOT the server credential. This loader is
     * unauthenticated (withSecurity, no auth), so falling back to the platform
     * GITHUB_TOKEN (context env / process.env) let any anonymous caller read the
     * platform account's data through this route. Same fix as api.github-stats.
     */
    const githubToken = apiKeys.GITHUB_API_KEY || apiKeys.VITE_GITHUB_ACCESS_TOKEN;

    if (!githubToken) {
      return json({ error: 'GitHub token not found' }, { status: 401 });
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'e-code-app',
      },

      // Bound the upstream call so a hung GitHub endpoint can't pin the handler.
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return json({ error: 'Invalid GitHub token' }, { status: 401 });
      }

      throw new Error(`GitHub API error: ${response.status}`);
    }

    const userData = (await response.json()) as {
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
      type: string;
    };

    return json({
      login: userData.login,
      name: userData.name,
      avatar_url: userData.avatar_url,
      html_url: userData.html_url,
      type: userData.type,
    });
  } catch (error) {
    console.error('Error fetching GitHub user:', error);

    return json(
      {
        error: 'Failed to fetch GitHub user information',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const loader = withSecurity(githubUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

/*
 * Helper used by the action handler below: forwards to the API service's
 * UserConnection-backed /api/github-proxy route. Returns the parsed
 * payload on 2xx, returns null when the API answers 401
 * CONNECTOR_NOT_LINKED so the caller can fall back to the legacy
 * cookie/env token path. Any other failure bubbles up as a thrown
 * Response so the Remix action layer can serialise it.
 */
async function githubProxyOrNull(
  request: Request,
  payload: { method: 'GET' | 'POST'; path: string; query?: Record<string, string>; body?: unknown },
): Promise<unknown | null> {
  try {
    return await apiRequest(request, '/api/github-proxy', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      const parsed = await error
        .clone()
        .json()
        .catch(() => ({}) as { code?: string });

      if ((parsed as { code?: string }).code === 'CONNECTOR_NOT_LINKED') {
        return null;
      }
    }

    throw error;
  }
}

async function githubUserAction({ request }: { request: Request; context?: unknown }) {
  try {
    let action: string | null = null;
    let repoFullName: string | null = null;
    let searchQuery: string | null = null;
    let perPage: number = 30;

    // Handle both JSON and form data
    const contentType = request.headers.get('Content-Type') || '';

    if (contentType.includes('application/json')) {
      const jsonData = (await request.json()) as any;
      action = jsonData.action;
      repoFullName = jsonData.repo;
      searchQuery = jsonData.query;
      perPage = jsonData.per_page || 30;
    } else {
      const formData = await request.formData();
      action = formData.get('action') as string;
      repoFullName = formData.get('repo') as string;
      searchQuery = formData.get('query') as string;
      perPage = parseInt(formData.get('per_page') as string) || 30;
    }

    /*
     * GitHub caps per_page at 100; clamp to a valid range so a malformed or
     * out-of-range value can't produce a 422 from the upstream API.
     */
    if (!Number.isFinite(perPage) || perPage < 1) {
      perPage = 30;
    } else if (perPage > 100) {
      perPage = 100;
    }

    /*
     * repoFullName ("owner/repo") is interpolated verbatim into GitHub API
     * paths (`/repos/${repoFullName}/branches`) on both the proxy and the legacy
     * PAT path, with the server-side decrypted OAuth token attached. Reject
     * anything that isn't a strict owner/repo so a crafted value (path
     * traversal, extra segments, query injection) can't reach arbitrary GitHub
     * endpoints with that token.
     */
    if (repoFullName && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repoFullName)) {
      return json({ error: 'Invalid repository name' }, { status: 400 });
    }

    /*
     * Phase 1 migration: try the UserConnection-backed proxy first so the
     * decrypted token never reaches the browser, then fall back to the
     * legacy cookie/env PAT for existing builders who have not yet
     * reconnected through OAuth.
     */
    if (action === 'get_repos' || action === 'get_branches' || action === 'search_repos' || action === 'get_token') {
      let proxyPayload: { method: 'GET' | 'POST'; path: string; query?: Record<string, string> } | null = null;

      if (action === 'get_repos') {
        proxyPayload = { method: 'GET', path: '/user/repos', query: { sort: 'updated', per_page: '100' } };
      } else if (action === 'get_branches' && repoFullName) {
        proxyPayload = { method: 'GET', path: `/repos/${repoFullName}/branches` };
      } else if (action === 'search_repos' && searchQuery) {
        proxyPayload = {
          method: 'GET',
          path: '/search/repositories',
          query: { q: searchQuery, per_page: String(perPage), sort: 'updated' },
        };
      } else if (action === 'get_token') {
        proxyPayload = { method: 'GET', path: '/__token__' };
      }

      if (proxyPayload) {
        try {
          const proxied = await githubProxyOrNull(request, proxyPayload);

          if (proxied !== null) {
            if (action === 'get_repos') {
              return json({ repos: proxied });
            }

            if (action === 'get_branches') {
              return json({ branches: proxied });
            }

            if (action === 'search_repos') {
              const search = proxied as {
                total_count: number;
                incomplete_results: boolean;
                items: unknown[];
              };

              return json({
                repos: search.items,
                total_count: search.total_count,
                incomplete_results: search.incomplete_results,
              });
            }

            return json(proxied);
          }
        } catch (error) {
          if (error instanceof Response) {
            const parsed = await error
              .clone()
              .json()
              .catch(() => ({}));

            return json(parsed, { status: error.status });
          }

          throw error;
        }
      }
    }

    // Get API keys from cookies (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const apiKeys = getApiKeysFromCookie(cookieHeader);

    // Try to get GitHub token from various sources
    /*
     * Only the CALLER's cookie token — NOT the server credential. This loader is
     * unauthenticated (withSecurity, no auth), so falling back to the platform
     * GITHUB_TOKEN (context env / process.env) let any anonymous caller read the
     * platform account's data through this route. Same fix as api.github-stats.
     */
    const githubToken = apiKeys.GITHUB_API_KEY || apiKeys.VITE_GITHUB_ACCESS_TOKEN;

    if (!githubToken) {
      return json({ error: 'GitHub token not found' }, { status: 401 });
    }

    if (action === 'get_repos') {
      // Fetch user repositories
      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubToken}`,
          'User-Agent': 'e-code-app',
        },

        // Bound the upstream call so a hung GitHub endpoint can't pin the handler.
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const repos = (await response.json()) as Array<{
        id: number;
        name: string;
        full_name: string;
        html_url: string;
        description: string | null;
        private: boolean;
        language: string | null;
        updated_at: string;
        stargazers_count: number;
        forks_count: number;
        topics: string[];
      }>;

      return json({
        repos: repos.map((repo) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          html_url: repo.html_url,
          description: repo.description,
          private: repo.private,
          language: repo.language,
          updated_at: repo.updated_at,
          stargazers_count: repo.stargazers_count || 0,
          forks_count: repo.forks_count || 0,
          topics: repo.topics || [],
        })),
      });
    }

    if (action === 'get_branches') {
      if (!repoFullName) {
        return json({ error: 'Repository name is required' }, { status: 400 });
      }

      // Fetch repository branches
      const response = await fetch(`https://api.github.com/repos/${repoFullName}/branches`, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubToken}`,
          'User-Agent': 'e-code-app',
        },

        // Bound the upstream call so a hung GitHub endpoint can't pin the handler.
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const branches = (await response.json()) as Array<{
        name: string;
        commit: {
          sha: string;
          url: string;
        };
        protected: boolean;
      }>;

      return json({
        branches: branches.map((branch) => ({
          name: branch.name,
          commit: {
            sha: branch.commit.sha,
            url: branch.commit.url,
          },
          protected: branch.protected,
        })),
      });
    }

    if (action === 'get_token') {
      // Return the GitHub token for git authentication
      return json({
        token: githubToken,
      });
    }

    if (action === 'search_repos') {
      if (!searchQuery) {
        return json({ error: 'Search query is required' }, { status: 400 });
      }

      // Search repositories using GitHub API
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&per_page=${perPage}&sort=updated`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${githubToken}`,
            'User-Agent': 'e-code-app',
          },

          // Bound the upstream call so a hung GitHub endpoint can't pin the handler.
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const searchData = (await response.json()) as {
        total_count: number;
        incomplete_results: boolean;
        items: Array<{
          id: number;
          name: string;
          full_name: string;
          html_url: string;
          description: string | null;
          private: boolean;
          language: string | null;
          updated_at: string;
          stargazers_count: number;
          forks_count: number;
          topics: string[];
          owner: {
            login: string;
            avatar_url: string;
          };
        }>;
      };

      return json({
        repos: searchData.items.map((repo) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          html_url: repo.html_url,
          description: repo.description,
          private: repo.private,
          language: repo.language,
          updated_at: repo.updated_at,
          stargazers_count: repo.stargazers_count || 0,
          forks_count: repo.forks_count || 0,
          topics: repo.topics || [],
          owner: {
            login: repo.owner.login,
            avatar_url: repo.owner.avatar_url,
          },
        })),
        total_count: searchData.total_count,
        incomplete_results: searchData.incomplete_results,
      });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in GitHub user action:', error);
    return json(
      {
        error: 'Failed to process GitHub request',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(githubUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
