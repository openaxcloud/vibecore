import { useMemo } from 'react';
import { GitHubApiServiceClass, gitHubApiService, type GitHubApiServiceConfig } from '~/lib/services/githubApiService';

export interface UseGitHubApiOptions extends GitHubApiServiceConfig {
  isolated?: boolean;
}

export function useGitHubAPI(options: UseGitHubApiOptions = {}) {
  const { isolated = false, ...config } = options;

  return useMemo(() => {
    if (isolated) {
      return new GitHubApiServiceClass(config);
    }

    if (config.token || config.tokenType || config.baseURL) {
      gitHubApiService.configure(config);
    }

    return gitHubApiService;
  }, [config.baseURL, config.token, config.tokenType, isolated]);
}
