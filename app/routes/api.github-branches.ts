import { getApiKeysFromCookie } from '~/lib/api/cookies';
import { webApiErrorResponse, webApiLocaleHeaders } from '~/lib/i18n/catalogs/web-api-routes';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
  isDefault: boolean;
}

async function githubBranchesLoader({ request }: { request: Request; context?: any }) {
  try {
    let owner: string;
    let repo: string;
    let githubToken: string;

    if (request.method === 'POST') {
      // Handle POST request with token in body (from BranchSelector)
      const body = (await request.json().catch(() => undefined)) as
        | { owner?: string; repo?: string; token?: string }
        | undefined;
      owner = body?.owner ?? '';
      repo = body?.repo ?? '';
      githubToken = body?.token ?? '';

      if (!owner || !repo) {
        return webApiErrorResponse(request, 'OWNER_REPOSITORY_REQUIRED', 400);
      }

      if (!githubToken) {
        return webApiErrorResponse(request, 'GITHUB_TOKEN_REQUIRED', 400);
      }
    } else {
      // Handle GET request with params and cookie token (backwards compatibility)
      const url = new URL(request.url);
      owner = url.searchParams.get('owner') || '';
      repo = url.searchParams.get('repo') || '';

      if (!owner || !repo) {
        return webApiErrorResponse(request, 'OWNER_REPOSITORY_REQUIRED', 400);
      }

      // Get API keys from cookies (server-side only)
      const cookieHeader = request.headers.get('Cookie');
      const apiKeys = getApiKeysFromCookie(cookieHeader);

      /*
       * Only the caller's OWN token (from their cookie) — never the server's
       * GITHUB_TOKEN. Falling back to the server token on this unauthenticated GET
       * turned it into a repo-existence oracle (and rate-limit/abuse vector) using
       * the platform's credential.
       */
      githubToken = apiKeys.GITHUB_API_KEY || apiKeys.VITE_GITHUB_ACCESS_TOKEN || '';
    }

    if (!githubToken) {
      return webApiErrorResponse(request, 'GITHUB_TOKEN_MISSING', 401);
    }

    // First, get repository info to know the default branch
    const repoResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
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

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return webApiErrorResponse(request, 'GITHUB_REPOSITORY_NOT_FOUND', 404);
      }

      if (repoResponse.status === 401) {
        return webApiErrorResponse(request, 'GITHUB_TOKEN_INVALID', 401);
      }

      console.error('GitHub repository request failed:', { status: repoResponse.status });
      throw new Error();
    }

    const repoInfo: any = await repoResponse.json();
    const defaultBranch = repoInfo.default_branch;

    // Fetch branches
    const branchesResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
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

    if (!branchesResponse.ok) {
      console.error('GitHub branches request failed:', { status: branchesResponse.status });
      throw new Error();
    }

    const branches: GitHubBranch[] = await branchesResponse.json();

    // Transform to our format
    const transformedBranches: BranchInfo[] = branches.map((branch) => ({
      name: branch.name,
      sha: branch.commit.sha,
      protected: branch.protected,
      isDefault: branch.name === defaultBranch,
    }));

    // Sort branches with default branch first, then alphabetically
    transformedBranches.sort((a, b) => {
      if (a.isDefault) {
        return -1;
      }

      if (b.isDefault) {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });

    return json(
      {
        branches: transformedBranches,
        defaultBranch,
        total: transformedBranches.length,
      },
      { headers: webApiLocaleHeaders(request) },
    );
  } catch (error) {
    console.error('Failed to fetch GitHub branches:', error);

    const upstreamUnavailable =
      error instanceof TypeError ||
      (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'));

    return webApiErrorResponse(request, upstreamUnavailable ? 'GITHUB_UNAVAILABLE' : 'GITHUB_BRANCHES_FAILED', 503);
  }
}

export const loader = withSecurity(githubBranchesLoader);
export const action = withSecurity(githubBranchesLoader);
