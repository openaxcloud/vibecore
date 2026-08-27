import Cookies from 'js-cookie';
import { atom, computed } from 'nanostores';
import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { getI18nInstance } from '~/lib/i18n/runtime';
import { gitHubApiService } from '~/lib/services/githubApiService';
import { logStore } from '~/lib/stores/logs';
import type { GitHubConnection } from '~/types/GitHub';
import { calculateStatsSummary } from '~/utils/githubStats';

// Auto-connect using environment variable
const envToken = import.meta.env?.VITE_GITHUB_ACCESS_TOKEN;
const envTokenType = import.meta.env?.VITE_GITHUB_TOKEN_TYPE;

function getGitHubConnectionCopy() {
  const i18n = getI18nInstance();

  return getClientRuntimeResidualCopy(i18n.resolvedLanguage ?? i18n.language);
}

const githubConnectionAtom = atom<GitHubConnection>({
  user: null,
  token: envToken || '',
  tokenType:
    envTokenType === 'classic' || envTokenType === 'fine-grained'
      ? (envTokenType as 'classic' | 'fine-grained')
      : 'classic',
});

// Initialize connection from localStorage on startup
function initializeConnection() {
  try {
    const savedConnection = localStorage.getItem('github_connection');

    if (savedConnection) {
      const parsed = JSON.parse(savedConnection);

      // Ensure tokenType is set
      if (!parsed.tokenType) {
        parsed.tokenType = 'classic';
      }

      // Only set if we have a valid user
      if (parsed.user) {
        githubConnectionAtom.set(parsed);
      }
    }
  } catch (error) {
    console.error('Error initializing GitHub connection:', error);
    localStorage.removeItem('github_connection');
  }
}

// Initialize on module load (client-side only)
if (typeof window !== 'undefined') {
  initializeConnection();
}

// Computed store for checking if connected
export const isGitHubConnected = computed(githubConnectionAtom, (connection) => !!connection.user);

// Computed store for GitHub stats summary
export const githubStatsSummary = computed(githubConnectionAtom, (connection) => {
  if (!connection.stats) {
    return null;
  }

  return calculateStatsSummary(connection.stats);
});

// Connection status atoms
export const isGitHubConnecting = atom(false);
export const isGitHubLoadingStats = atom(false);

// GitHub connection store methods
export const githubConnectionStore = {
  // Get current connection
  get: () => githubConnectionAtom.get(),

  // Connect to GitHub
  async connect(token: string, tokenType: 'classic' | 'fine-grained' = 'classic'): Promise<void> {
    const copy = getGitHubConnectionCopy();

    if (isGitHubConnecting.get()) {
      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.alreadyInProgress'], { provider: 'GitHub' }),
      );
    }

    isGitHubConnecting.set(true);

    try {
      // Fetch user data
      const { user, rateLimit } = await gitHubApiService.fetchUser(token, tokenType);

      // Create connection object
      const connection: GitHubConnection = {
        user,
        token,
        tokenType,
        rateLimit,
      };

      /*
       * Set cookies for client-side access. The token-bearing cookies must carry
       * Secure + SameSite=strict + a bounded expiry (matching useGit.ts) — the
       * js-cookie default is an insecure, session-less, long-lived cookie sent
       * cross-site over plain HTTP.
       */
      const secureCookieOptions = { secure: true, sameSite: 'strict' as const, expires: 7 };
      Cookies.set('githubUsername', user.login, secureCookieOptions);
      Cookies.set('githubToken', token, secureCookieOptions);
      Cookies.set(
        'git:github.com',
        JSON.stringify({ username: token, password: 'x-oauth-basic' }),
        secureCookieOptions,
      );

      // Store connection details in localStorage
      localStorage.setItem('github_connection', JSON.stringify(connection));

      // Update atom
      githubConnectionAtom.set(connection);

      const connectedMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.connectedAs'], {
        provider: 'GitHub',
        account: user.login,
      });
      logStore.logInfo(connectedMessage, {
        type: 'system',
        message: connectedMessage,
      });

      // Fetch stats in background
      this.fetchStats().catch((error) => {
        console.error('Failed to fetch initial GitHub stats:', error);
      });
    } catch (error) {
      console.error('Failed to connect to GitHub:', error);

      const failureMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.authenticationFailed'], {
        provider: 'GitHub',
      });
      logStore.logError(failureMessage, {
        type: 'system',
        message: failureMessage,
      });
      throw new Error(failureMessage);
    } finally {
      isGitHubConnecting.set(false);
    }
  },

  // Disconnect from GitHub
  disconnect(): void {
    const copy = getGitHubConnectionCopy();

    // Clear atoms
    githubConnectionAtom.set({
      user: null,
      token: '',
      tokenType: 'classic',
    });

    // Clear localStorage
    localStorage.removeItem('github_connection');

    // Clear cookies
    Cookies.remove('githubUsername');
    Cookies.remove('githubToken');
    Cookies.remove('git:github.com');

    // Clear API service cache
    gitHubApiService.clearCache();

    const disconnectedMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.disconnected'], {
      provider: 'GitHub',
    });
    logStore.logInfo(disconnectedMessage, {
      type: 'system',
      message: disconnectedMessage,
    });
  },

  // Fetch GitHub stats
  async fetchStats(): Promise<void> {
    const copy = getGitHubConnectionCopy();
    const connection = githubConnectionAtom.get();

    if (!connection.user || !connection.token) {
      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsUnavailable'], { provider: 'GitHub' }),
      );
    }

    if (isGitHubLoadingStats.get()) {
      return; // Already loading
    }

    isGitHubLoadingStats.set(true);

    try {
      const stats = await gitHubApiService.fetchStats(connection.token, connection.tokenType);

      // Update connection with stats
      const updatedConnection: GitHubConnection = {
        ...connection,
        stats,
      };

      // Update localStorage
      localStorage.setItem('github_connection', JSON.stringify(updatedConnection));

      // Update atom
      githubConnectionAtom.set(updatedConnection);

      const refreshedMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsUpdated'], {
        provider: 'GitHub',
      });
      logStore.logInfo(refreshedMessage, {
        type: 'system',
        message: refreshedMessage,
      });
    } catch (error) {
      console.error('Failed to fetch GitHub stats:', error);

      // If the error is due to expired token, disconnect
      if (error instanceof Error && error.message.includes('401')) {
        const tokenExpiredMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.tokenExpired'], {
          provider: 'GitHub',
        });
        logStore.logError(tokenExpiredMessage, {
          type: 'system',
          message: tokenExpiredMessage,
        });
        this.disconnect();
      }

      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], { provider: 'GitHub' }),
      );
    } finally {
      isGitHubLoadingStats.set(false);
    }
  },

  // Update token type
  updateTokenType(tokenType: 'classic' | 'fine-grained'): void {
    const connection = githubConnectionAtom.get();

    const updatedConnection = {
      ...connection,
      tokenType,
    };

    githubConnectionAtom.set(updatedConnection);
    localStorage.setItem('github_connection', JSON.stringify(updatedConnection));
  },

  // Clear stats cache
  clearCache(): void {
    const connection = githubConnectionAtom.get();

    if (connection.token) {
      gitHubApiService.clearUserCache(connection.token);
    }
  },

  // Subscribe to connection changes
  subscribe: githubConnectionAtom.subscribe.bind(githubConnectionAtom),
};

// Export the atom for direct access
export { githubConnectionAtom };
