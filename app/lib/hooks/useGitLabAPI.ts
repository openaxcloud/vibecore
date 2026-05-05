import { useMemo } from 'react';
import { GitLabApiService } from '~/lib/services/gitlabApiService';

export interface GitLabApiConfig {
  token: string;
  baseUrl?: string;
}

export function useGitLabAPI(config?: GitLabApiConfig) {
  return useMemo(() => {
    if (!config?.token) {
      return null;
    }

    return new GitLabApiService(config.token, config.baseUrl ?? 'https://gitlab.com');
  }, [config?.baseUrl, config?.token]);
}
