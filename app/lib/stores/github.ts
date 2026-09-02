import { atom } from 'nanostores';
import { logStore } from './logs';
import { CONNECTION_SECRET_FIELDS, persistConnectionWithoutSecrets } from '~/lib/connections/serverConnections';
import { clientStoresServicesText } from '~/lib/i18n/catalogs/client-stores-services';
import type { GitHubConnection } from '~/types/GitHub';

// Initialize with stored connection or defaults
const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('github_connection') : null;

function parseStoredGitHubConnection(raw: string | null): GitHubConnection {
  const fallback: GitHubConnection = {
    user: null,
    token: '',
    tokenType: 'classic',
  };

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as GitHubConnection;
  } catch {
    // Corrupt localStorage must not crash module initialization.
    return fallback;
  }
}

const initialConnection: GitHubConnection = parseStoredGitHubConnection(storedConnection);

export const githubConnection = atom<GitHubConnection>(initialConnection);
export const isConnecting = atom<boolean>(false);
export const isFetchingStats = atom<boolean>(false);

// Function to initialize GitHub connection via server-side API
export async function initializeGitHubConnection() {
  const currentState = githubConnection.get();

  // If we already have a connection, don't override it
  if (currentState.user) {
    return;
  }

  try {
    isConnecting.set(true);

    const response = await fetch('/api/github-user');

    if (!response.ok) {
      if (response.status === 401) {
        // No server-side token available, skip initialization
        return;
      }

      throw new Error(clientStoresServicesText('clientStores.github.connectionFailed', { status: response.status }));
    }

    const userData = await response.json();

    // Update the connection state (no token stored client-side)
    const connectionData: Partial<GitHubConnection> = {
      user: userData as any,
      token: '', // Token stored server-side only
      tokenType: 'classic',
    };

    // Store in localStorage for persistence
    if (typeof window !== 'undefined') {
      persistConnectionWithoutSecrets('github_connection', connectionData, CONNECTION_SECRET_FIELDS.github);
    }

    // Update the store
    updateGitHubConnection(connectionData);

    // Fetch initial stats
    await fetchGitHubStatsViaAPI();

    logStore.logSystem(clientStoresServicesText('clientStores.github.connectionInitialized'));
  } catch (error) {
    console.error('Error initializing GitHub connection:', error);
    logStore.logError(clientStoresServicesText('clientStores.github.connectionInitializationFailed'), {
      code: 'GITHUB_CONNECTION_INITIALIZATION_FAILED',
    });
  } finally {
    isConnecting.set(false);
  }
}

// Function to fetch GitHub stats via server-side API
export async function fetchGitHubStatsViaAPI() {
  try {
    isFetchingStats.set(true);

    const response = await fetch('/api/github-stats');

    if (!response.ok) {
      throw new Error(clientStoresServicesText('clientStores.github.statsRequestFailed', { status: response.status }));
    }

    const stats = (await response.json()) as NonNullable<GitHubConnection['stats']>;

    const currentState = githubConnection.get();
    updateGitHubConnection({
      ...currentState,
      stats,
    });

    logStore.logSystem(clientStoresServicesText('clientStores.github.statsFetched'));
  } catch (error) {
    console.error('GitHub API Error:', error);
    logStore.logError(clientStoresServicesText('clientStores.github.statsFetchFailed'), {
      code: 'GITHUB_STATS_FETCH_FAILED',
    });
  } finally {
    isFetchingStats.set(false);
  }
}

export const updateGitHubConnection = (updates: Partial<GitHubConnection>) => {
  const currentState = githubConnection.get();
  const newState = { ...currentState, ...updates };
  githubConnection.set(newState);

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    persistConnectionWithoutSecrets('github_connection', newState, CONNECTION_SECRET_FIELDS.github);
  }
};
