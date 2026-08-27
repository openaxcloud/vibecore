import { webApiErrorResponse, webApiLocaleHeaders } from '~/lib/i18n/catalogs/web-api-routes';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';
import type { GitLabProjectInfo } from '~/types/GitLab';
import { isSafeGitForgeUrl, safeGitForgeFetch } from '~/utils/url';

/*
 * SSRF guard: gitlabUrl is attacker-controlled and the user's GitLab token is
 * attached to the outbound request, so an attacker could point it at an internal
 * address (cloud metadata, in-cluster services) to reach internal hosts AND
 * exfiltrate the bearer token. isSafeGitForgeUrl is IPv6-aware (blocks bracketed
 * IPv6 / IPv4-mapped-IPv6 / ULA / link-local that the old string-prefix check
 * missed) and shared with api.gitlab-branches.ts.
 */
const isSafeGitLabUrl = isSafeGitForgeUrl;

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string;
  web_url: string;
  http_url_to_repo: string;
  star_count: number;
  forks_count: number;
  updated_at: string;
  default_branch: string;
  visibility: string;
}

async function gitlabProjectsLoader({ request }: { request: Request }) {
  try {
    const body: any = await request.json();
    const { token, gitlabUrl = 'https://gitlab.com' } = body;

    if (!token) {
      return webApiErrorResponse(request, 'GITLAB_TOKEN_REQUIRED', 400);
    }

    if (!isSafeGitLabUrl(gitlabUrl)) {
      return webApiErrorResponse(request, 'GITLAB_URL_INVALID', 400);
    }

    // Fetch user's projects from GitLab API
    const url = `${gitlabUrl}/api/v4/projects?membership=true&per_page=100&order_by=updated_at&sort=desc`;

    const response = await safeGitForgeFetch(url, {
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
        return webApiErrorResponse(request, 'GITLAB_TOKEN_INVALID', 401);
      }

      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('GitLab API error:', response.status, errorText);

      return webApiErrorResponse(request, 'GITLAB_PROJECTS_FAILED', response.status);
    }

    const projects: GitLabProject[] = await response.json();

    // Transform to our GitLabProjectInfo format
    const transformedProjects: GitLabProjectInfo[] = projects.map((project) => ({
      id: project.id,
      name: project.name,
      path_with_namespace: project.path_with_namespace,
      description: project.description || '',
      http_url_to_repo: project.http_url_to_repo,
      star_count: project.star_count,
      forks_count: project.forks_count,
      updated_at: project.updated_at,
      default_branch: project.default_branch,
      visibility: project.visibility,
    }));

    return json(
      {
        projects: transformedProjects,
        total: transformedProjects.length,
      },
      { headers: webApiLocaleHeaders(request) },
    );
  } catch (error) {
    console.error('Failed to fetch GitLab projects:', error);

    const unavailable =
      error instanceof TypeError ||
      (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'));

    return webApiErrorResponse(request, unavailable ? 'GITLAB_UNAVAILABLE' : 'GITLAB_PROJECTS_FAILED', 503);
  }
}

export const action = withSecurity(gitlabProjectsLoader);
