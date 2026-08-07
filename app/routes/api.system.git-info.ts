import { data as json, type LoaderFunction, type LoaderFunctionArgs } from 'react-router';
import { webApiErrorResponse } from '~/lib/i18n/catalogs/web-api-routes';

interface GitInfo {
  local: {
    commitHash: string;
    branch: string;
    commitTime: string;
    author: string;
    email: string;
    remoteUrl: string;
    repoName: string;
  };
  github?: {
    currentRepo?: {
      fullName: string;
      defaultBranch: string;
      stars: number;
      forks: number;
      openIssues?: number;
    };
  };
  isForked?: boolean;
  timestamp?: string;
}

// Define context type
interface AppContext {
  env?: {
    GITHUB_ACCESS_TOKEN?: string;
  };
}

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  languages_url: string;
}

interface GitHubGist {
  id: string;
  html_url: string;
  description: string;
}

// These values will be replaced at build time
declare const __COMMIT_HASH: string;
declare const __GIT_BRANCH: string;
declare const __GIT_COMMIT_TIME: string;
declare const __GIT_AUTHOR: string;
declare const __GIT_EMAIL: string;
declare const __GIT_REMOTE_URL: string;
declare const __GIT_REPO_NAME: string;

/*
 * Remove unused variable to fix linter error
 * declare const __GIT_REPO_URL: string;
 */

export const loader: LoaderFunction = async ({ request }: LoaderFunctionArgs & { context: AppContext }) => {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'getUser' || action === 'getRepos' || action === 'getOrgs' || action === 'getActivity') {
    const cookieToken = request.headers
      .get('Cookie')
      ?.split(';')
      .find((cookie) => cookie.trim().startsWith('githubToken='))
      ?.split('=')[1];

    // Also check for token in Authorization header
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    /*
     * Use ONLY the caller's token. This loader is unauthenticated, so preferring
     * the server token (process.env.GITHUB_ACCESS_TOKEN) let any anonymous caller
     * run /user, /user/repos, /user/orgs against the PLATFORM's GitHub account —
     * leaking its private repos/profile/orgs (worsened by the wildcard CORS
     * below). The sibling routes (api.github-stats / api.github-user /
     * api.github-branches) all deliberately refuse the server credential here;
     * match them.
     */
    const token = headerToken || cookieToken;

    if (!token) {
      console.error('No GitHub token available');
      return webApiErrorResponse(request, 'GITHUB_TOKEN_MISSING', 401, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
      });
    }

    try {
      if (action === 'getUser') {
        const response = await fetch('https://api.github.com/user', {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          console.error('GitHub user API error:', response.status);
          throw new Error();
        }

        const userData = await response.json();

        return json(
          { user: userData },
          {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
          },
        );
      }

      if (action === 'getRepos') {
        const reposResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(30000),
        });

        if (!reposResponse.ok) {
          console.error('GitHub repos API error:', reposResponse.status);
          throw new Error();
        }

        const repos = (await reposResponse.json()) as GitHubRepo[];

        // Get user's gists
        const gistsResponse = await fetch('https://api.github.com/gists', {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(30000),
        });

        const gists = gistsResponse.ok ? ((await gistsResponse.json()) as GitHubGist[]) : [];

        // Calculate language statistics
        const languageStats: Record<string, number> = {};

        let totalStars = 0;
        let totalForks = 0;

        for (const repo of repos) {
          totalStars += repo.stargazers_count || 0;
          totalForks += repo.forks_count || 0;

          if (repo.language && repo.language !== 'null') {
            languageStats[repo.language] = (languageStats[repo.language] || 0) + 1;
          }

          /*
           * Optionally fetch languages for each repo for more accurate stats
           * This is commented out to avoid rate limiting
           *
           * if (repo.languages_url) {
           *   try {
           *     const langResponse = await fetch(repo.languages_url, {
           *       headers: {
           *         Accept: 'application/vnd.github.v3+json',
           *         Authorization: `Bearer ${token}`,
           *       },
           *     });
           *
           *     if (langResponse.ok) {
           *       const languages = await langResponse.json();
           *       Object.keys(languages).forEach(lang => {
           *         languageStats[lang] = (languageStats[lang] || 0) + languages[lang];
           *       });
           *     }
           *   } catch (error) {
           *     console.error(`Error fetching languages for ${repo.name}:`, error);
           *   }
           * }
           */
        }

        return json(
          {
            repos,
            stats: {
              totalStars,
              totalForks,
              languages: languageStats,
              totalGists: gists.length,
            },
          },
          {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
          },
        );
      }

      if (action === 'getOrgs') {
        const response = await fetch('https://api.github.com/user/orgs', {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          console.error('GitHub orgs API error:', response.status);
          throw new Error();
        }

        const orgs = await response.json();

        return json(
          { organizations: orgs },
          {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
          },
        );
      }

      if (action === 'getActivity') {
        const username = request.headers
          .get('Cookie')
          ?.split(';')
          .find((cookie) => cookie.trim().startsWith('githubUsername='))
          ?.split('=')[1];

        if (!username) {
          console.error('GitHub username not found in cookies');
          return webApiErrorResponse(request, 'GITHUB_USERNAME_MISSING', 400, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
          });
        }

        if (!/^[A-Za-z0-9-]{1,39}$/.test(username)) {
          return webApiErrorResponse(request, 'GITHUB_USERNAME_INVALID', 400, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
          });
        }

        const response = await fetch(
          `https://api.github.com/users/${encodeURIComponent(username)}/events?per_page=30`,
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(30000),
          },
        );

        if (!response.ok) {
          console.error('GitHub activity API error:', response.status);
          throw new Error();
        }

        const events = await response.json();

        return json(
          { recentActivity: events },
          {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
          },
        );
      }
    } catch (error) {
      console.error('GitHub API error:', error);
      return webApiErrorResponse(request, 'GITHUB_REQUEST_FAILED', 503, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
      });
    }
  }

  const gitInfo: GitInfo = {
    local: {
      commitHash:
        process.env.VIBECORE_EXPOSE_PLATFORM_GIT_INFO === 'true' && typeof __COMMIT_HASH !== 'undefined'
          ? __COMMIT_HASH
          : 'hidden',
      branch:
        process.env.VIBECORE_EXPOSE_PLATFORM_GIT_INFO === 'true' && typeof __GIT_BRANCH !== 'undefined'
          ? __GIT_BRANCH
          : 'workspace',
      commitTime:
        process.env.VIBECORE_EXPOSE_PLATFORM_GIT_INFO === 'true' && typeof __GIT_COMMIT_TIME !== 'undefined'
          ? __GIT_COMMIT_TIME
          : new Date().toISOString(),
      author:
        process.env.VIBECORE_EXPOSE_PLATFORM_GIT_INFO === 'true' && typeof __GIT_AUTHOR !== 'undefined'
          ? __GIT_AUTHOR
          : 'E-Code',
      email:
        process.env.VIBECORE_EXPOSE_PLATFORM_GIT_INFO === 'true' && typeof __GIT_EMAIL !== 'undefined'
          ? __GIT_EMAIL
          : 'hidden',
      remoteUrl:
        process.env.VIBECORE_EXPOSE_PLATFORM_GIT_INFO === 'true' && typeof __GIT_REMOTE_URL !== 'undefined'
          ? __GIT_REMOTE_URL
          : 'hidden',
      repoName:
        process.env.VIBECORE_EXPOSE_PLATFORM_GIT_INFO === 'true' && typeof __GIT_REPO_NAME !== 'undefined'
          ? __GIT_REPO_NAME
          : 'workspace',
    },
    timestamp: new Date().toISOString(),
  };

  return json(gitInfo, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
};
