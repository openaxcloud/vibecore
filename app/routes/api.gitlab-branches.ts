import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';
import { isSafeGitForgeUrl, safeGitForgeFetch } from '~/utils/url';

interface GitLabBranch {
  name: string;
  commit: {
    id: string;
    short_id: string;
  };
  protected: boolean;
  default: boolean;
  can_push: boolean;
}

interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
  isDefault: boolean;
  canPush: boolean;
}

/*
 * SSRF guard for the user-supplied gitlabUrl (the user's bearer token is attached
 * to the outbound request). isSafeGitForgeUrl is IPv6-aware — blocks bracketed
 * IPv6 / IPv4-mapped-IPv6 / ULA / link-local that the old string-prefix check let
 * through — and shared with api.gitlab-projects.ts.
 */
const isSafeGitLabUrl = isSafeGitForgeUrl;

async function gitlabBranchesLoader({ request }: { request: Request }) {
  try {
    const body: any = await request.json();
    const { token, gitlabUrl = 'https://gitlab.com', projectId } = body;

    if (!token) {
      return json({ error: 'GitLab token is required' }, { status: 400 });
    }

    if (!projectId) {
      return json({ error: 'Project ID is required' }, { status: 400 });
    }

    /*
     * projectId is either a numeric id or a "namespace/project" path. Reject
     * anything outside valid path chars and URL-encode it before interpolation
     * so a value like "1/repository/branches?private_token=..." or a traversal
     * can't redirect the authenticated call to a different GitLab API path.
     */
    if (!/^[\w./-]+$/.test(projectId)) {
      return json({ error: 'Invalid project ID' }, { status: 400 });
    }

    if (!isSafeGitLabUrl(gitlabUrl)) {
      return json({ error: 'Invalid GitLab URL' }, { status: 400 });
    }

    // Fetch branches from GitLab API
    const branchesUrl = `${gitlabUrl}/api/v4/projects/${encodeURIComponent(projectId)}/repository/branches?per_page=100`;

    const response = await safeGitForgeFetch(branchesUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'e-code-app',
      },

      // Bound the upstream call so a hung/blackhole GitLab host can't pin the handler.
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return json({ error: 'Invalid GitLab token' }, { status: 401 });
      }

      if (response.status === 404) {
        return json({ error: 'Project not found or no access' }, { status: 404 });
      }

      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('GitLab API error:', response.status, errorText);

      return json(
        {
          error: `GitLab API error: ${response.status}`,
        },
        { status: response.status },
      );
    }

    const branches: GitLabBranch[] = await response.json();

    /*
     * Also fetch project info to get default branch name (projectId already
     * validated above; encode it here too for the same path-injection guard).
     */
    const projectUrl = `${gitlabUrl}/api/v4/projects/${encodeURIComponent(projectId)}`;

    const projectResponse = await safeGitForgeFetch(projectUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'e-code-app',
      },

      // Bound the upstream call so a hung/blackhole GitLab host can't pin the handler.
      signal: AbortSignal.timeout(15000),
    });

    let defaultBranchName = 'main'; // fallback

    if (projectResponse.ok) {
      const projectInfo: any = await projectResponse.json();
      defaultBranchName = projectInfo.default_branch || 'main';
    }

    // Transform to our format
    const transformedBranches: BranchInfo[] = branches.map((branch) => ({
      name: branch.name,
      sha: branch.commit.id,
      protected: branch.protected,
      isDefault: branch.name === defaultBranchName,
      canPush: branch.can_push,
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

    return json({
      branches: transformedBranches,
      defaultBranch: defaultBranchName,
      total: transformedBranches.length,
    });
  } catch (error) {
    console.error('Failed to fetch GitLab branches:', error);

    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return json(
          {
            error: 'Failed to connect to GitLab. Please check your network connection.',
          },
          { status: 503 },
        );
      }

      return json(
        {
          error: `Failed to fetch branches: ${error.message}`,
        },
        { status: 500 },
      );
    }

    return json(
      {
        error: 'An unexpected error occurred while fetching branches',
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(gitlabBranchesLoader);
