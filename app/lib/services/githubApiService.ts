import { mapRecentActivity } from '~/lib/github-stats-metrics';
import { clientStoresServicesText } from '~/lib/i18n/catalogs/client-stores-services';
import type {
  GitHubUserResponse,
  GitHubRepoInfo,
  GitHubBranch,
  GitHubOrganization,
  GitHubStats,
  GitHubLanguageStats,
} from '~/types/GitHub';

export interface GitHubApiServiceConfig {
  token?: string;
  tokenType?: 'classic' | 'fine-grained';
  baseURL?: string;
}

export interface DetailedRepoInfo extends GitHubRepoInfo {
  branches_count?: number;
  contributors_count?: number;
  issues_count?: number;
  pull_requests_count?: number;
}

export interface GitHubApiError {
  message: string;
  status: number;
  code?: string;
}

export class GitHubApiServiceClass {
  private _config: GitHubApiServiceConfig;
  private _baseURL: string;
  private _statsCache = new Map<string, { expiresAt: number; value: GitHubStats }>();
  private _userCache = new Map<string, { expiresAt: number; value: { user: GitHubUserResponse; rateLimit: any } }>();
  private _cacheTtlMs = 5 * 60 * 1000;

  constructor(config: GitHubApiServiceConfig = {}) {
    this._config = config;
    this._baseURL = config.baseURL || 'https://api.github.com';
  }

  /**
   * Configure the service with authentication details
   */
  configure(config: GitHubApiServiceConfig): void {
    this._config = { ...this._config, ...config };
    this._baseURL = config.baseURL || this._baseURL;
  }

  private _cacheKey(token: string, tokenType: 'classic' | 'fine-grained') {
    let hash = 2166136261;

    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return `${this._baseURL}:${tokenType}:${token.length}:${(hash >>> 0).toString(36)}`;
  }

  private async _makeRequestInternal<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this._config.token) {
      throw new Error(clientStoresServicesText('clientServices.github.tokenRequired'));
    }

    const response = await fetch(`${this._baseURL}${endpoint}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `${this._config.tokenType === 'classic' ? 'token' : 'Bearer'} ${this._config.token}`,
        'User-Agent': 'e-code-app',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { code?: unknown };

      const error: GitHubApiError = {
        message: clientStoresServicesText('clientServices.github.requestFailed', { status: response.status }),
        status: response.status,
        code: typeof errorData.code === 'string' ? errorData.code : undefined,
      };
      throw error;
    }

    return response.json();
  }

  /**
   * Fetch all user repositories with pagination
   */
  async getAuthenticatedUser(): Promise<GitHubUserResponse> {
    return this._makeRequestInternal<GitHubUserResponse>('/user');
  }

  async getAllUserRepositories(): Promise<GitHubRepoInfo[]> {
    const allRepos: GitHubRepoInfo[] = [];

    let page = 1;
    let hasMore = true;

    const maxPages = 50; // Hard cap (5000 repos) to prevent a runaway/hung pagination loop

    while (hasMore && page <= maxPages) {
      const repos = await this._makeRequestInternal<GitHubRepoInfo[]>(
        `/user/repos?per_page=100&page=${page}&sort=updated`,
      );

      allRepos.push(...repos);
      hasMore = repos.length === 100; // If we got 100 repos, there might be more
      page++;
    }

    return allRepos;
  }

  /**
   * Fetch detailed information for a repository including additional metrics
   */
  async getDetailedRepositoryInfo(owner: string, repo: string): Promise<DetailedRepoInfo> {
    const [repoInfo, branches] = await Promise.all([
      this._makeRequestInternal<GitHubRepoInfo>(`/repos/${owner}/${repo}`),
      this.getRepositoryBranches(owner, repo).catch(() => []),
    ]);

    // Try to get additional metrics
    const [contributors, issues, pullRequests] = await Promise.allSettled([
      this._getRepositoryContributorsCount(owner, repo),
      this._getRepositoryIssuesCount(owner, repo),
      this._getRepositoryPullRequestsCount(owner, repo),
    ]);

    const detailedInfo: DetailedRepoInfo = {
      ...repoInfo,
      branches_count: branches.length,
      contributors_count: contributors.status === 'fulfilled' ? contributors.value : undefined,
      issues_count: issues.status === 'fulfilled' ? issues.value : undefined,
      pull_requests_count: pullRequests.status === 'fulfilled' ? pullRequests.value : undefined,
    };

    return detailedInfo;
  }

  /**
   * Get repository branches
   */
  async getRepositoryBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    return this._makeRequestInternal<GitHubBranch[]>(`/repos/${owner}/${repo}/branches`);
  }

  /**
   * Get contributors count using Link header pagination info
   */
  private async _getRepositoryContributorsCount(owner: string, repo: string): Promise<number> {
    const response = await fetch(`${this._baseURL}/repos/${owner}/${repo}/contributors?per_page=1`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `${this._config.tokenType === 'classic' ? 'token' : 'Bearer'} ${this._config.token}`,
        'User-Agent': 'e-code-app',
      },
    });

    if (!response.ok) {
      return 0;
    }

    const linkHeader = response.headers.get('Link');

    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      return match ? parseInt(match[1], 10) : 1;
    }

    const data = await response.json();

    return Array.isArray(data) ? data.length : 0;
  }

  /**
   * Get issues count, excluding pull requests.
   *
   * GitHub's REST issues endpoint (`/repos/{owner}/{repo}/issues`) treats pull
   * requests as issues, so the Link-header pagination trick would double-count
   * every PR. The search API supports an explicit `is:issue` qualifier and
   * returns an exact `total_count`, giving a PR-excluded total.
   */
  private async _getRepositoryIssuesCount(owner: string, repo: string): Promise<number> {
    const query = encodeURIComponent(`repo:${owner}/${repo} is:issue`);

    const response = await fetch(`${this._baseURL}/search/issues?q=${query}&per_page=1`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `${this._config.tokenType === 'classic' ? 'token' : 'Bearer'} ${this._config.token}`,
        'User-Agent': 'e-code-app',
      },
    });

    if (!response.ok) {
      return 0;
    }

    const data: any = await response.json().catch(() => null);

    return data && typeof data.total_count === 'number' ? data.total_count : 0;
  }

  /**
   * Get pull requests count using Link header pagination info
   */
  private async _getRepositoryPullRequestsCount(owner: string, repo: string): Promise<number> {
    const response = await fetch(`${this._baseURL}/repos/${owner}/${repo}/pulls?state=all&per_page=1`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `${this._config.tokenType === 'classic' ? 'token' : 'Bearer'} ${this._config.token}`,
        'User-Agent': 'e-code-app',
      },
    });

    if (!response.ok) {
      return 0;
    }

    const linkHeader = response.headers.get('Link');

    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      return match ? parseInt(match[1], 10) : 1;
    }

    const data = await response.json();

    return Array.isArray(data) ? data.length : 0;
  }

  /**
   * Fetch detailed information for multiple repositories in batches
   */
  async getDetailedRepositoriesInfo(
    repos: GitHubRepoInfo[],
    batchSize: number = 5,
    delayMs: number = 100,
  ): Promise<DetailedRepoInfo[]> {
    const detailedRepos: DetailedRepoInfo[] = [];

    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map((repo) => {
          const [owner, repoName] = repo.full_name.split('/');
          return this.getDetailedRepositoryInfo(owner, repoName);
        }),
      );

      // Collect successful results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          detailedRepos.push(result.value);
        } else {
          console.error(`Failed to fetch details for ${batch[index].full_name}:`, result.reason);

          // Fallback to original repo data
          detailedRepos.push(batch[index]);
        }
      });

      // Add delay between batches to be respectful to the API
      if (i + batchSize < repos.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return detailedRepos;
  }

  /**
   * Calculate comprehensive statistics from repositories
   */
  calculateRepositoryStats(repos: DetailedRepoInfo[]): {
    languages: GitHubLanguageStats;
    mostUsedLanguages: Array<{ language: string; bytes: number; repos: number }>;
    totalBranches: number;
    totalContributors: number;
    totalIssues: number;
    totalPullRequests: number;
    repositoryHealth: {
      healthy: number;
      active: number;
      archived: number;
      forked: number;
    };
  } {
    const languages: GitHubLanguageStats = {};
    const languageBytes: Record<string, number> = {};
    const languageRepos: Record<string, number> = {};

    let totalBranches = 0;
    let totalContributors = 0;
    let totalIssues = 0;
    let totalPullRequests = 0;

    let healthyRepos = 0;
    let activeRepos = 0;
    let archivedRepos = 0;
    let forkedRepos = 0;

    repos.forEach((repo) => {
      // Language statistics
      if (repo.language) {
        languages[repo.language] = (languages[repo.language] || 0) + 1;
        languageBytes[repo.language] = (languageBytes[repo.language] || 0) + (repo.size || 0);
        languageRepos[repo.language] = (languageRepos[repo.language] || 0) + 1;
      }

      // Aggregate metrics
      totalBranches += repo.branches_count || 0;
      totalContributors += repo.contributors_count || 0;
      totalIssues += repo.issues_count || 0;
      totalPullRequests += repo.pull_requests_count || 0;

      // Repository health analysis
      const daysSinceUpdate = Math.floor((Date.now() - new Date(repo.updated_at).getTime()) / (1000 * 60 * 60 * 24));

      if (repo.archived) {
        archivedRepos++;
      } else if (repo.fork) {
        forkedRepos++;
      } else if (daysSinceUpdate < 7) {
        activeRepos++;
      } else if (daysSinceUpdate < 30 && repo.stargazers_count > 0) {
        healthyRepos++;
      }
    });

    // Create most used languages array sorted by bytes
    const mostUsedLanguages = Object.entries(languageBytes)
      .map(([language, bytes]) => ({
        language,
        bytes,
        repos: languageRepos[language] || 0,
      }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 20);

    return {
      languages,
      mostUsedLanguages,
      totalBranches,
      totalContributors,
      totalIssues,
      totalPullRequests,
      repositoryHealth: {
        healthy: healthyRepos,
        active: activeRepos,
        archived: archivedRepos,
        forked: forkedRepos,
      },
    };
  }

  /**
   * Generate comprehensive GitHub stats for a user
   */
  async generateComprehensiveStats(userData: GitHubUserResponse): Promise<GitHubStats> {
    try {
      // Fetch all repositories
      const allRepos = await this.getAllUserRepositories();

      // Get detailed information for repositories (in batches)
      const detailedRepos = await this.getDetailedRepositoriesInfo(allRepos);

      // Calculate statistics
      const stats = this.calculateRepositoryStats(detailedRepos);

      // Fetch additional data in parallel
      const [organizations, recentActivity] = await Promise.allSettled([
        this._makeRequestInternal<GitHubOrganization[]>('/user/orgs'),
        this._makeRequestInternal<any[]>(`/users/${userData.login}/events?per_page=10`),
      ]);

      // Calculate aggregated metrics
      const totalStars = detailedRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
      const totalForks = detailedRepos.reduce((sum, repo) => sum + repo.forks_count, 0);
      const privateRepos = detailedRepos.filter((repo) => repo.private).length;

      const githubStats: GitHubStats = {
        repos: detailedRepos,
        recentActivity: recentActivity.status === 'fulfilled' ? mapRecentActivity(recentActivity.value) : [],
        languages: stats.languages,
        totalGists: userData.public_gists || 0,
        publicRepos: userData.public_repos || 0,
        privateRepos,
        stars: totalStars,
        forks: totalForks,
        followers: userData.followers || 0,
        publicGists: userData.public_gists || 0,
        privateGists: 0, // This would need additional API call
        lastUpdated: new Date().toISOString(),
        totalStars,
        totalForks,
        organizations: organizations.status === 'fulfilled' ? organizations.value : [],
        totalBranches: stats.totalBranches,
        totalContributors: stats.totalContributors,
        totalIssues: stats.totalIssues,
        totalPullRequests: stats.totalPullRequests,
        mostUsedLanguages: stats.mostUsedLanguages,
      };

      return githubStats;
    } catch (error) {
      console.error('Error generating comprehensive stats:', error);
      throw error;
    }
  }

  /**
   * Fetch authenticated user and rate limit info
   */
  async fetchUser(
    token: string,
    tokenType: 'classic' | 'fine-grained' = 'classic',
  ): Promise<{ user: GitHubUserResponse; rateLimit: any }> {
    const cacheKey = this._cacheKey(token, tokenType);
    const cached = this._userCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    this.configure({ token, tokenType });

    const [user, rateLimit] = await Promise.all([
      this.getAuthenticatedUser(),
      this._makeRequestInternal('/rate_limit'),
    ]);

    const value = { user, rateLimit };
    this._userCache.set(cacheKey, { expiresAt: Date.now() + this._cacheTtlMs, value });

    return value;
  }

  /**
   * Fetch comprehensive GitHub stats for authenticated user
   */
  async fetchStats(token: string, tokenType: 'classic' | 'fine-grained' = 'classic'): Promise<GitHubStats> {
    const cacheKey = this._cacheKey(token, tokenType);
    const cached = this._statsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    this.configure({ token, tokenType });

    const user = await this.getAuthenticatedUser();

    const stats = await this.generateComprehensiveStats(user);
    this._statsCache.set(cacheKey, { expiresAt: Date.now() + this._cacheTtlMs, value: stats });

    return stats;
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this._statsCache.clear();
    this._userCache.clear();
  }

  /**
   * Clear user-specific cache
   */
  clearUserCache(token: string): void {
    for (const tokenType of ['classic', 'fine-grained'] as const) {
      const cacheKey = this._cacheKey(token, tokenType);
      this._statsCache.delete(cacheKey);
      this._userCache.delete(cacheKey);
    }
  }
}

// Export an instance of the service
export const gitHubApiService = new GitHubApiServiceClass();
