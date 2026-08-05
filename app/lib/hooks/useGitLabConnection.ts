import { useStore } from '@nanostores/react';
import Cookies from 'js-cookie';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { useGitLabAPI } from './useGitLabAPI';
import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { gitlabConnectionStore, gitlabConnection, isGitLabConnected } from '~/lib/stores/gitlabConnection';
import type { GitLabConnection } from '~/types/GitLab';

export interface ConnectionState {
  isConnected: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  connection: GitLabConnection | null;
  error: string | null;
}

export interface UseGitLabConnectionReturn extends ConnectionState {
  connect: (token: string, gitlabUrl?: string) => Promise<void>;
  disconnect: () => void;
  refreshConnection: () => Promise<void>;
  testConnection: () => Promise<boolean>;
  refreshStats: () => Promise<void>;
}

const STORAGE_KEY = 'gitlab_connection';
type GitLabConnectionErrorCode = 'saved_load_failed' | 'token_required' | 'connection_failed' | 'refresh_failed';

export function useGitLabConnection(): UseGitLabConnectionReturn {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getClientRuntimeResidualCopy(language);
  const connection = useStore(gitlabConnection);
  const isConnected = useStore(isGitLabConnected);
  const [errorCode, setErrorCode] = useState<GitLabConnectionErrorCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const error =
    errorCode === 'saved_load_failed'
      ? copy['clientRuntime.connection.savedLoadFailed']
      : errorCode === 'token_required'
        ? copy['clientRuntime.connection.tokenRequired']
        : errorCode === 'connection_failed'
          ? formatClientRuntimeResidualCopy(copy['clientRuntime.connection.failed'], { provider: 'GitLab' })
          : errorCode === 'refresh_failed'
            ? formatClientRuntimeResidualCopy(copy['clientRuntime.connection.refreshFailed'], { provider: 'GitLab' })
            : null;

  // Create API instance - will update when connection changes
  useGitLabAPI(
    connection?.token
      ? { token: connection.token, baseUrl: connection.gitlabUrl || 'https://gitlab.com' }
      : { token: '', baseUrl: 'https://gitlab.com' },
  );

  // Load saved connection on mount
  useEffect(() => {
    loadSavedConnection();
  }, []);

  const loadSavedConnection = useCallback(async () => {
    setIsLoading(true);
    setErrorCode(null);

    try {
      // Check if connection already exists in store (likely from initialization)
      if (connection?.user) {
        setIsLoading(false);
        return;
      }

      // Load saved connection from localStorage
      const savedConnection = localStorage.getItem(STORAGE_KEY);

      if (savedConnection) {
        const parsed = JSON.parse(savedConnection);

        if (parsed.user && parsed.token) {
          // Update the store with saved connection
          gitlabConnectionStore.setGitLabUrl(parsed.gitlabUrl || 'https://gitlab.com');
          gitlabConnectionStore.setToken(parsed.token);

          // Test the connection to make sure it's still valid
          await refreshConnectionData(parsed);
        }
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error loading saved connection:', error);
      setErrorCode('saved_load_failed');
      setIsLoading(false);

      // Clean up corrupted data
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [connection, copy]);

  const refreshConnectionData = useCallback(
    async (connection: GitLabConnection) => {
      if (!connection.token) {
        return;
      }

      try {
        // Make direct API call instead of using hook
        const baseUrl = connection.gitlabUrl || 'https://gitlab.com';

        const response = await fetch(`${baseUrl}/api/v4/user`, {
          headers: {
            'Content-Type': 'application/json',
            'PRIVATE-TOKEN': connection.token,
          },
        });

        if (!response.ok) {
          throw Object.assign(new Error(), { code: 'GITLAB_API_ERROR', status: response.status });
        }

        // const userData = (await response.json()) as GitLabUserResponse;
        await response.json(); // Parse response but don't store - data handled by store

        /*
         * Update connection with user data - unused variable removed
         * const updatedConnection: GitLabConnection = {
         *   ...connection,
         *   user: userData,
         * };
         */

        gitlabConnectionStore.setGitLabUrl(baseUrl);
        gitlabConnectionStore.setToken(connection.token);
      } catch (error) {
        console.error('Error refreshing connection data:', error);
        throw new Error(
          formatClientRuntimeResidualCopy(copy['clientRuntime.connection.refreshFailed'], { provider: 'GitLab' }),
        );
      }
    },
    [copy],
  );

  const connect = useCallback(
    async (token: string, gitlabUrl = 'https://gitlab.com') => {
      if (!token.trim()) {
        setErrorCode('token_required');
        return;
      }

      setIsConnecting(true);
      setErrorCode(null);

      try {
        console.log('Calling GitLab store connect method...');

        // Use the store's connect method which handles everything properly
        const result = await gitlabConnectionStore.connect(token, gitlabUrl);

        if (!result.success) {
          throw new Error(
            result.error ||
              formatClientRuntimeResidualCopy(copy['clientRuntime.connection.failed'], { provider: 'GitLab' }),
          );
        }

        console.log('GitLab connection successful, now fetching stats...');

        // Fetch stats after successful connection
        try {
          const statsResult = await gitlabConnectionStore.fetchStats(true);

          if (statsResult.success) {
            console.log('GitLab stats fetched successfully:', statsResult.stats);
          } else {
            console.error('Failed to fetch GitLab stats:', statsResult.error);
          }
        } catch (statsError) {
          console.error('Failed to fetch GitLab stats:', statsError);

          // Don't fail the connection if stats fail
        }

        toast.success(
          formatClientRuntimeResidualCopy(copy['clientRuntime.connection.connected'], { provider: 'GitLab' }),
        );
      } catch (error) {
        console.error('Failed to connect to GitLab:', error);

        const errorMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.failed'], {
          provider: 'GitLab',
        });

        setErrorCode('connection_failed');
        toast.error(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setIsConnecting(false);
      }
    },
    [copy],
  );

  const disconnect = useCallback(() => {
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY);

    // Clear all GitLab-related cookies
    Cookies.remove('gitlabToken');
    Cookies.remove('gitlabUsername');
    Cookies.remove('gitlabUrl');

    // Reset store
    gitlabConnectionStore.disconnect();

    setErrorCode(null);
    toast.success(
      formatClientRuntimeResidualCopy(copy['clientRuntime.connection.disconnected'], { provider: 'GitLab' }),
    );
  }, [copy]);

  const refreshConnection = useCallback(async () => {
    if (!connection?.token) {
      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.noneToRefresh'], { provider: 'GitLab' }),
      );
    }

    setIsLoading(true);
    setErrorCode(null);

    try {
      await refreshConnectionData(connection);
    } catch (error) {
      console.error('Error refreshing connection:', error);

      const errorMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.refreshFailed'], {
        provider: 'GitLab',
      });
      setErrorCode('refresh_failed');
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [connection, copy, refreshConnectionData]);

  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!connection?.token) {
      return false;
    }

    try {
      const baseUrl = connection.gitlabUrl || 'https://gitlab.com';

      const response = await fetch(`${baseUrl}/api/v4/user`, {
        headers: {
          'Content-Type': 'application/json',
          'PRIVATE-TOKEN': connection.token,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }, [connection]);

  const refreshStats = useCallback(async () => {
    if (!connection?.token) {
      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsUnavailable'], { provider: 'GitLab' }),
      );
    }

    try {
      const statsResult = await gitlabConnectionStore.fetchStats(true);

      if (!statsResult.success) {
        throw new Error(
          statsResult.error ||
            formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], { provider: 'GitLab' }),
        );
      }
    } catch (error) {
      console.error('Error refreshing GitLab stats:', error);
      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], { provider: 'GitLab' }),
      );
    }
  }, [connection, copy]);

  return {
    isConnected,
    isLoading,
    isConnecting,
    connection,
    error,
    connect,
    disconnect,
    refreshConnection,
    testConnection,
    refreshStats,
  };
}
