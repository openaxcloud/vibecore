import { gitlabProjectDescription, gitlabInitialCommitMessage, gitlabUpdateCommitMessage } from './gitlabBrand';
import { clientStoresServicesText, type ClientStoresServicesKey } from '~/lib/i18n/catalogs/client-stores-services';
import type {
  GitLabUserResponse,
  GitLabProjectInfo,
  GitLabEvent,
  GitLabGroupInfo,
  GitLabProjectResponse,
  GitLabCommitRequest,
} from '~/types/GitLab';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class GitLabApiRequestError extends Error {
  readonly status: number;
  readonly upstreamMessage?: string;

  constructor(message: string, status: number, upstreamMessage?: string) {
    super(message);
    this.name = 'GitLabApiRequestError';
    this.status = status;
    this.upstreamMessage = upstreamMessage;
  }
}

function gitLabRequestError(
  key: ClientStoresServicesKey,
  response: Response,
  upstreamMessage?: string,
): GitLabApiRequestError {
  return new GitLabApiRequestError(
    clientStoresServicesText(key, { status: response.status }),
    response.status,
    upstreamMessage,
  );
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class GitLabCache {
  private _cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, duration = CACHE_DURATION): void {
    const timestamp = Date.now();
    this._cache.set(key, {
      data,
      timestamp,
      expiresAt: timestamp + duration,
    });
  }

  get<T>(key: string): T | null {
    const entry = this._cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this._cache.clear();
  }

  isExpired(key: string): boolean {
    const entry = this._cache.get(key);
    return !entry || Date.now() > entry.expiresAt;
  }
}

const gitlabCache = new GitLabCache();

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }

      // Retry on server errors (5xx) and rate limits
      if (response.status >= 500 || response.status === 429) {
        if (attempt === maxRetries) {
          return response;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export class GitLabApiService {
  private _baseUrl: string;
  private _token: string;

  constructor(token: string, baseUrl = 'https://gitlab.com') {
    this._token = token;
    this._baseUrl = baseUrl;
  }

  private get _headers() {
    return {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': this._token,
    };
  }

  private async _request(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this._baseUrl}/api/v4${endpoint}`;
    return fetchWithRetry(url, {
      ...options,
      headers: {
        ...this._headers,
        ...options.headers,
      },
    });
  }

  async getUser(): Promise<GitLabUserResponse> {
    const response = await this._request('/user');

    if (!response.ok) {
      const key: ClientStoresServicesKey =
        response.status === 401
          ? 'clientServices.gitlab.unauthorized'
          : response.status === 403
            ? 'clientServices.gitlab.forbidden'
            : response.status === 404
              ? 'clientServices.gitlab.endpointNotFound'
              : response.status === 429
                ? 'clientServices.gitlab.rateLimited'
                : 'clientServices.gitlab.userRequestFailed';

      throw gitLabRequestError(key, response);
    }

    const user: GitLabUserResponse = await response.json();

    // Get rate limit information from headers if available
    const rateLimit = {
      limit: parseInt(response.headers.get('ratelimit-limit') || '0', 10),
      remaining: parseInt(response.headers.get('ratelimit-remaining') || '0', 10),
      reset: parseInt(response.headers.get('ratelimit-reset') || '0', 10),
    };

    // Handle different avatar URL fields that GitLab might return
    const processedUser = {
      ...user,
      avatar_url: user.avatar_url || (user as any).avatarUrl || (user as any).profile_image_url || null,
    };

    return { ...processedUser, rateLimit } as GitLabUserResponse & { rateLimit: typeof rateLimit };
  }

  async getProjects(membership = true, minAccessLevel = 20, perPage = 50): Promise<GitLabProjectInfo[]> {
    const cacheKey = `projects_${this._token}_${membership}_${minAccessLevel}`;
    const cached = gitlabCache.get<GitLabProjectInfo[]>(cacheKey);

    if (cached) {
      return cached;
    }

    let allProjects: any[] = [];
    let page = 1;

    const maxPages = 10; // Limit to prevent excessive API calls

    while (page <= maxPages) {
      const response = await this._request(
        `/projects?membership=${membership}&min_access_level=${minAccessLevel}&per_page=${perPage}&page=${page}&order_by=updated_at&sort=desc`,
      );

      if (!response.ok) {
        throw gitLabRequestError('clientServices.gitlab.projectsRequestFailed', response);
      }

      const projects: any[] = await response.json();

      if (projects.length === 0) {
        break;
      }

      allProjects = [...allProjects, ...projects];

      // Break if we have enough projects for initial load
      if (allProjects.length >= 100) {
        break;
      }

      page++;
    }

    // Transform to our interface
    const transformedProjects: GitLabProjectInfo[] = allProjects.map((project: any) => ({
      id: project.id,
      name: project.name,
      path_with_namespace: project.path_with_namespace,
      description: project.description,
      http_url_to_repo: project.http_url_to_repo,
      star_count: project.star_count,
      forks_count: project.forks_count,
      default_branch: project.default_branch,
      updated_at: project.updated_at,
      visibility: project.visibility,
    }));

    gitlabCache.set(cacheKey, transformedProjects);

    return transformedProjects;
  }

  async getEvents(perPage = 10): Promise<GitLabEvent[]> {
    const response = await this._request(`/events?per_page=${perPage}`);

    if (!response.ok) {
      throw gitLabRequestError('clientServices.gitlab.eventsRequestFailed', response);
    }

    const events: any[] = await response.json();

    return events.slice(0, 5).map((event: any) => ({
      id: event.id,
      action_name: event.action_name,
      project_id: event.project_id,
      project: event.project,
      created_at: event.created_at,
    }));
  }

  async getGroups(minAccessLevel = 10): Promise<GitLabGroupInfo[]> {
    const response = await this._request(`/groups?min_access_level=${minAccessLevel}`);

    if (response.ok) {
      return await response.json();
    }

    return [];
  }

  async getSnippets(): Promise<any[]> {
    const response = await this._request('/snippets');

    if (response.ok) {
      return await response.json();
    }

    return [];
  }

  async createProject(name: string, isPrivate: boolean = false): Promise<GitLabProjectResponse> {
    // Sanitize project name to ensure it's valid for GitLab
    const sanitizedName = name
      .replace(/[^a-zA-Z0-9-_.]/g, '-') // Replace invalid chars with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .toLowerCase();

    const response = await this._request('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: sanitizedName,
        path: sanitizedName, // Explicitly set path to match name
        visibility: isPrivate ? 'private' : 'public',
        initialize_with_readme: false, // Don't initialize with README to avoid conflicts
        default_branch: 'main', // Explicitly set default branch
        description: gitlabProjectDescription(),
      }),
    });

    if (!response.ok) {
      throw gitLabRequestError('clientServices.gitlab.projectCreateFailed', response);
    }

    return await response.json();
  }

  async getProject(owner: string, name: string): Promise<GitLabProjectResponse | null> {
    const response = await this._request(`/projects/${encodeURIComponent(`${owner}/${name}`)}`);

    if (response.ok) {
      return await response.json();
    }

    return null;
  }

  /*
   * Returns true when the branch exists. Probing the branches API directly is
   * correct, unlike inferring existence from the presence of a specific file
   * (a real branch without a root README.md would look non-existent).
   */
  async branchExists(projectId: number, branchName: string): Promise<boolean> {
    const response = await this._request(
      `/projects/${projectId}/repository/branches/${encodeURIComponent(branchName)}`,
    );

    return response.ok;
  }

  async createBranch(projectId: number, branchName: string, ref: string): Promise<any> {
    const response = await this._request(`/projects/${projectId}/repository/branches`, {
      method: 'POST',
      body: JSON.stringify({
        branch: branchName,
        ref,
      }),
    });

    if (!response.ok) {
      throw gitLabRequestError('clientServices.gitlab.branchCreateFailed', response);
    }

    return await response.json();
  }

  async commitFiles(projectId: number, commitRequest: GitLabCommitRequest): Promise<any> {
    const response = await this._request(`/projects/${projectId}/repository/commits`, {
      method: 'POST',
      body: JSON.stringify(commitRequest),
    });

    if (!response.ok) {
      let upstreamMessage: string | undefined;

      try {
        const errorData = (await response.json()) as { message?: string; error?: string };

        if (errorData.message) {
          upstreamMessage = errorData.message;
        } else if (errorData.error) {
          upstreamMessage = errorData.error;
        }
      } catch {
        // An unreadable upstream payload must not be exposed to the interface.
      }

      throw gitLabRequestError('clientServices.gitlab.commitFailed', response, upstreamMessage);
    }

    return await response.json();
  }

  async getFile(projectId: number, filePath: string, ref: string): Promise<Response> {
    /*
     * Encode the ref too — a branch name containing ?/&/# would otherwise break
     * the query string (and could read the wrong ref).
     */
    return this._request(
      `/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`,
    );
  }

  async getProjectByPath(projectPath: string): Promise<GitLabProjectResponse | null> {
    try {
      // Double encode the project path as GitLab API requires it
      const encodedPath = encodeURIComponent(projectPath);
      const response = await this._request(`/projects/${encodedPath}`);

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 404) {
        console.log(`Project not found: ${projectPath}`);
        return null;
      }

      const errorText = await response.text();
      console.error(`Failed to fetch project ${projectPath}:`, response.status, errorText);
      throw gitLabRequestError('clientServices.gitlab.projectRequestFailed', response);
    } catch (error) {
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
        return null;
      }

      throw error;
    }
  }

  async updateProjectVisibility(projectId: number, visibility: 'public' | 'private'): Promise<void> {
    const response = await this._request(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify({ visibility }),
    });

    if (!response.ok) {
      throw gitLabRequestError('clientServices.gitlab.visibilityUpdateFailed', response);
    }
  }

  async createProjectWithFiles(
    name: string,
    isPrivate: boolean,
    files: Record<string, string>,
  ): Promise<GitLabProjectResponse> {
    // Create the project first
    const project = await this.createProject(name, isPrivate);

    // If we have files to commit, commit them
    if (Object.keys(files).length > 0) {
      // Wait a moment for the project to be fully created
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const actions = Object.entries(files).map(([filePath, content]) => ({
        action: 'create' as const,
        file_path: filePath,
        content,
      }));

      const commitRequest: GitLabCommitRequest = {
        branch: 'main',
        commit_message: gitlabInitialCommitMessage(),
        actions,
      };

      try {
        await this.commitFiles(project.id, commitRequest);
      } catch (error) {
        console.error('Failed to commit files to new project:', error);

        /*
         * Don't throw the error, as the project was created successfully
         * The user can still access it and add files manually
         */
      }
    }

    return project;
  }

  async updateProjectWithFiles(projectId: number, files: Record<string, string>): Promise<void> {
    if (Object.keys(files).length === 0) {
      return;
    }

    // For existing projects, we need to determine which files exist and which are new
    const actions = Object.entries(files).map(([filePath, content]) => ({
      action: 'create' as const, // Start with create, we'll handle conflicts in the API response
      file_path: filePath,
      content,
    }));

    const commitRequest: GitLabCommitRequest = {
      branch: 'main',
      commit_message: gitlabUpdateCommitMessage(),
      actions,
    };

    try {
      await this.commitFiles(projectId, commitRequest);
    } catch (error) {
      // If we get file conflicts, retry with update actions
      if (error instanceof GitLabApiRequestError && error.upstreamMessage?.includes('already exists')) {
        const updateActions = Object.entries(files).map(([filePath, content]) => ({
          action: 'update' as const,
          file_path: filePath,
          content,
        }));

        const updateCommitRequest: GitLabCommitRequest = {
          branch: 'main',
          commit_message: gitlabUpdateCommitMessage(),
          actions: updateActions,
        };

        await this.commitFiles(projectId, updateCommitRequest);
      } else {
        throw error;
      }
    }
  }
}

export { gitlabCache };
