import { atom } from 'nanostores';
import { logStore } from './logs';
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

      throw new Error(`Failed to connect to GitHub: ${response.statusText}`);
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
      localStorage.setItem('github_connection', JSON.stringify(connectionData));
    }

    // Update the store
    updateGitHubConnection(connectionData);

    // Fetch initial stats
    await fetchGitHubStatsViaAPI();

    logStore.logSystem('GitHub connection initialized successfully');
  } catch (error) {
    console.error('Error initializing GitHub connection:', error);
    logStore.logError('Failed to initialize GitHub connection', { error });
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
      throw new Error(`Failed to fetch GitHub statistics: ${response.status}`);
    }

    const stats = (await response.json()) as NonNullable<GitHubConnection['stats']>;

    const currentState = githubConnection.get();
    updateGitHubConnection({
      ...currentState,
      stats,
    });

    logStore.logSystem('GitHub stats fetched successfully');
  } catch (error) {
    console.error('GitHub API Error:', error);
    logStore.logError('Failed to fetch GitHub stats', { error });
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
    localStorage.setItem('github_connection', JSON.stringify(newState));
  }
};
