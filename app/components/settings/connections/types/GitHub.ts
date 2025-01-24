export interface GitHubUserResponse {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string;
  bio: string;
  public_repos: number;
  followers: number;
  following: number;
}

export interface GitHubRepoInfo {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  updated_at: string;
}

export interface GitHubStats {
  repos: GitHubRepoInfo[];
  totalStars: number;
  totalForks: number;
}

export interface GitHubConnection {
  user: GitHubUserResponse | null;
  token: string;
  tokenType: 'classic' | 'fine-grained';
  stats?: GitHubStats;
}

export interface GitHubTokenInfo {
  token: string;
  scope: string[];
  avatar_url: string;
  name: string | null;
  created_at: string;
  followers: number;
}

export interface GitHubRateLimits {
  limit: number;
  remaining: number;
  reset: Date;
  used: number;
}

export interface GitHubAuthState {
  username: string;
  tokenInfo: GitHubTokenInfo | null;
  isConnected: boolean;
  isVerifying: boolean;
  isLoadingRepos: boolean;
  rateLimits?: GitHubRateLimits;
}
