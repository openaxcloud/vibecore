import Cookies from 'js-cookie';
import { atom, computed } from 'nanostores';
import { CONNECTION_SECRET_FIELDS, persistConnectionWithoutSecrets } from '~/lib/connections/serverConnections';
import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { getI18nInstance } from '~/lib/i18n/runtime';
import { GitLabApiService } from '~/lib/services/gitlabApiService';
import { logStore } from '~/lib/stores/logs';
import type { GitLabConnection, GitLabStats } from '~/types/GitLab';
import { calculateStatsSummary } from '~/utils/gitlabStats';

// Auto-connect using environment variable
const envToken = import.meta.env?.VITE_GITLAB_ACCESS_TOKEN;

function getGitLabConnectionCopy() {
  const i18n = getI18nInstance();

  return getClientRuntimeResidualCopy(i18n.resolvedLanguage ?? i18n.language);
}

const gitlabConnectionAtom = atom<GitLabConnection>({
  user: null,
  token: envToken || '',
  tokenType: 'personal-access-token',
});

const gitlabUrlAtom = atom('https://gitlab.com');

// Initialize connection from localStorage on startup
function initializeConnection() {
  try {
    const savedConnection = localStorage.getItem('gitlab_connection');

    if (savedConnection) {
      const parsed = JSON.parse(savedConnection);
      parsed.tokenType = 'personal-access-token';

      if (parsed.gitlabUrl) {
        gitlabUrlAtom.set(parsed.gitlabUrl);
      }

      // Only set if we have a valid user
      if (parsed.user) {
        gitlabConnectionAtom.set(parsed);
      }
    }
  } catch (error) {
    console.error('Error initializing GitLab connection:', error);
    localStorage.removeItem('gitlab_connection');
  }
}

// Initialize on module load (client-side only)
if (typeof window !== 'undefined') {
  initializeConnection();
}

// Computed store for checking if connected
export const isGitLabConnected = computed(gitlabConnectionAtom, (connection) => !!connection.user);

// Computed store for current connection
export const gitlabConnection = computed(gitlabConnectionAtom, (connection) => connection);

// Computed store for current user
export const gitlabUser = computed(gitlabConnectionAtom, (connection) => connection.user);

// Computed store for current stats
export const gitlabStats = computed(gitlabConnectionAtom, (connection) => connection.stats);

// Computed store for current URL
export const gitlabUrl = computed(gitlabUrlAtom, (url) => url);

class GitLabConnectionStore {
  async connect(token: string, gitlabUrl = 'https://gitlab.com') {
    const copy = getGitLabConnectionCopy();

    try {
      const apiService = new GitLabApiService(token, gitlabUrl);

      // Test connection by fetching user
      const user = await apiService.getUser();

      // Update state
      gitlabConnectionAtom.set({
        user,
        token,
        tokenType: 'personal-access-token',
        gitlabUrl,
      });

      /*
       * Token-bearing cookies must be Secure + SameSite=strict + expiring, same
       * as the GitHub connection (wave 20). Bare Cookies.set() defaults to no
       * Secure flag + SameSite=Lax + session-less, exposing the GitLab PAT over
       * plain HTTP and to broader cross-site contexts.
       */
      const secureCookieOptions = { secure: true, sameSite: 'strict' as const, expires: 7 };
      Cookies.set('gitlabUsername', user.username, secureCookieOptions);
      Cookies.set('gitlabToken', token, secureCookieOptions);
      Cookies.set('git:gitlab.com', JSON.stringify({ username: user.username, password: token }), secureCookieOptions);
      Cookies.set('gitlabUrl', gitlabUrl, secureCookieOptions);

      // Store connection details WITHOUT the token (AUDX-007).
      persistConnectionWithoutSecrets(
        'gitlab_connection',
        { user, token, tokenType: 'personal-access-token', gitlabUrl },
        CONNECTION_SECRET_FIELDS.gitlab,
      );

      const connectedMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.connectedAs'], {
        provider: 'GitLab',
        account: user.username,
      });
      logStore.logInfo(connectedMessage, {
        type: 'system',
        message: connectedMessage,
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to connect to GitLab:', error);

      const failureMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.authenticationFailed'], {
        provider: 'GitLab',
      });
      logStore.logError(failureMessage, {
        type: 'system',
        message: failureMessage,
      });

      return {
        success: false,
        error: failureMessage,
      };
    }
  }

  async fetchStats(_forceRefresh = false) {
    const copy = getGitLabConnectionCopy();
    const connection = gitlabConnectionAtom.get();

    if (!connection.user || !connection.token) {
      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsUnavailable'], { provider: 'GitLab' }),
      );
    }

    try {
      const apiService = new GitLabApiService(connection.token, connection.gitlabUrl || 'https://gitlab.com');

      // Fetch user data
      const userData = await apiService.getUser();

      // Fetch projects
      const projects = await apiService.getProjects();

      // Fetch events
      const events = await apiService.getEvents();

      // Fetch groups
      const groups = await apiService.getGroups();

      // Fetch snippets
      const snippets = await apiService.getSnippets();

      // Calculate stats
      const stats: GitLabStats = calculateStatsSummary(projects, events, groups, snippets, userData);

      // Update connection with stats
      gitlabConnectionAtom.set({
        ...connection,
        stats,
      });

      // Update localStorage
      const updatedConnection = { ...connection, stats };
      persistConnectionWithoutSecrets('gitlab_connection', updatedConnection, CONNECTION_SECRET_FIELDS.gitlab);

      return { success: true, stats };
    } catch (error) {
      console.error('Error fetching GitLab stats:', error);
      return {
        success: false,
        error: formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], {
          provider: 'GitLab',
        }),
      };
    }
  }

  disconnect() {
    const copy = getGitLabConnectionCopy();

    // Remove cookies
    Cookies.remove('gitlabToken');
    Cookies.remove('gitlabUsername');
    Cookies.remove('git:gitlab.com');
    Cookies.remove('gitlabUrl');

    // Clear localStorage
    localStorage.removeItem('gitlab_connection');

    // Reset state
    gitlabConnectionAtom.set({
      user: null,
      token: '',
      tokenType: 'personal-access-token',
    });

    const disconnectedMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.disconnected'], {
      provider: 'GitLab',
    });
    logStore.logInfo(disconnectedMessage, {
      type: 'system',
      message: disconnectedMessage,
    });
  }

  loadSavedConnection() {
    try {
      const savedConnection = localStorage.getItem('gitlab_connection');

      if (savedConnection) {
        const parsed = JSON.parse(savedConnection);
        parsed.tokenType = 'personal-access-token';

        // Set GitLab URL if saved
        if (parsed.gitlabUrl) {
          gitlabUrlAtom.set(parsed.gitlabUrl);
        }

        // Set connection
        gitlabConnectionAtom.set(parsed);

        return parsed;
      }
    } catch (error) {
      console.error('Error parsing saved GitLab connection:', error);
      localStorage.removeItem('gitlab_connection');
    }

    return null;
  }

  setGitLabUrl(url: string) {
    gitlabUrlAtom.set(url);
  }

  setToken(token: string) {
    gitlabConnectionAtom.set({
      ...gitlabConnectionAtom.get(),
      token,
    });
  }

  // Auto-connect using environment token
  async autoConnect() {
    const copy = getGitLabConnectionCopy();

    // Check if token exists and is not empty
    if (!envToken || envToken.trim() === '') {
      return {
        success: false,
        error: formatClientRuntimeResidualCopy(copy['clientRuntime.connection.environmentTokenMissing'], {
          provider: 'GitLab',
        }),
      };
    }

    try {
      const apiService = new GitLabApiService(envToken);
      const user = await apiService.getUser();

      // Update state
      gitlabConnectionAtom.set({
        user,
        token: envToken,
        tokenType: 'personal-access-token',
        gitlabUrl: 'https://gitlab.com',
      });

      // Token-bearing cookies — Secure + SameSite=strict + expiring (see connect()).
      const secureCookieOptions = { secure: true, sameSite: 'strict' as const, expires: 7 };
      Cookies.set('gitlabUsername', user.username, secureCookieOptions);
      Cookies.set('gitlabToken', envToken, secureCookieOptions);
      Cookies.set(
        'git:gitlab.com',
        JSON.stringify({ username: user.username, password: envToken }),
        secureCookieOptions,
      );
      Cookies.set('gitlabUrl', 'https://gitlab.com', secureCookieOptions);

      // Store connection details WITHOUT the token (AUDX-007).
      persistConnectionWithoutSecrets(
        'gitlab_connection',
        { user, token: envToken, tokenType: 'personal-access-token', gitlabUrl: 'https://gitlab.com' },
        CONNECTION_SECRET_FIELDS.gitlab,
      );

      const connectedMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.autoConnectedAs'], {
        provider: 'GitLab',
        account: user.username,
      });
      logStore.logInfo(connectedMessage, {
        type: 'system',
        message: connectedMessage,
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to auto-connect to GitLab:', error);

      /*
       * Never log token material (even a partial prefix). GitLab PATs have known
       * fixed-length prefixes, so the first 10 chars materially reduce the token's
       * secrecy if captured from the browser console (extensions, screen-share,
       * error-reporting). Log only the error message.
       */
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('GitLab auto-connect error details:', {
        error: errorMessage,
      });

      const failureMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.autoConnectionFailed'], {
        provider: 'GitLab',
      });
      logStore.logError(failureMessage, {
        type: 'system',
        message: failureMessage,
      });

      return {
        success: false,
        error: failureMessage,
      };
    }
  }
}

export const gitlabConnectionStore = new GitLabConnectionStore();

// Export hooks for React components
export function useGitLabConnection() {
  return {
    connection: gitlabConnection,
    isConnected: isGitLabConnected,
    user: gitlabUser,
    stats: gitlabStats,
    gitlabUrl,
    connect: gitlabConnectionStore.connect.bind(gitlabConnectionStore),
    disconnect: gitlabConnectionStore.disconnect.bind(gitlabConnectionStore),
    fetchStats: gitlabConnectionStore.fetchStats.bind(gitlabConnectionStore),
    loadSavedConnection: gitlabConnectionStore.loadSavedConnection.bind(gitlabConnectionStore),
    setGitLabUrl: gitlabConnectionStore.setGitLabUrl.bind(gitlabConnectionStore),
    setToken: gitlabConnectionStore.setToken.bind(gitlabConnectionStore),
    autoConnect: gitlabConnectionStore.autoConnect.bind(gitlabConnectionStore),
  };
}
