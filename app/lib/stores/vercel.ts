import { atom } from 'nanostores';
import { toast } from 'react-toastify';
import { logStore } from './logs';
import type { VercelConnection, VercelProject } from '~/types/vercel';

// Auto-connect using environment variable
const envToken = import.meta.env?.VITE_VERCEL_ACCESS_TOKEN;

// Initialize with stored connection or defaults
const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('vercel_connection') : null;

let initialConnection: VercelConnection;

if (storedConnection) {
  try {
    const parsed = JSON.parse(storedConnection);

    // If we have a stored connection but no user and no token, clear it and use env token
    if (!parsed.user && !parsed.token && envToken) {
      console.log('Vercel store: Clearing incomplete saved connection, using env token');

      if (typeof window !== 'undefined') {
        localStorage.removeItem('vercel_connection');
      }

      initialConnection = {
        user: null,
        token: envToken,
        stats: undefined,
      };
    } else {
      initialConnection = parsed;
    }
  } catch (error) {
    console.error('Error parsing saved Vercel connection:', error);
    initialConnection = {
      user: null,
      token: envToken || '',
      stats: undefined,
    };
  }
} else {
  initialConnection = {
    user: null,
    token: envToken || '',
    stats: undefined,
  };
}

export const vercelConnection = atom<VercelConnection>(initialConnection);
export const isConnecting = atom<boolean>(false);
export const isFetchingStats = atom<boolean>(false);

export const updateVercelConnection = (updates: Partial<VercelConnection>) => {
  const currentState = vercelConnection.get();
  const newState = { ...currentState, ...updates };
  vercelConnection.set(newState);

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('vercel_connection', JSON.stringify(newState));
  }
};

// Auto-connect using environment token
export async function autoConnectVercel() {
  console.log('autoConnectVercel called, envToken exists:', !!envToken);

  if (!envToken) {
    console.error('No Vercel token found in environment');
    return { success: false, error: 'No Vercel token found in environment' };
  }

  try {
    console.log('Setting isConnecting to true');
    isConnecting.set(true);

    // Test the connection
    console.log('Making API call to Vercel');

    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${envToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Vercel API response status:', response.status);

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status}`);
    }

    const userData = (await response.json()) as any;
    console.log('Vercel API response userData:', userData);

    // Update connection
    console.log('Updating Vercel connection');
    updateVercelConnection({
      user: userData.user || userData,
      token: envToken,
    });

    logStore.logInfo('Auto-connected to Vercel', {
      type: 'system',
      message: `Auto-connected to Vercel as ${userData.user?.username || userData.username}`,
    });

    // Fetch stats
    console.log('Fetching Vercel stats');
    await fetchVercelStats(envToken);

    console.log('Vercel auto-connection successful');

    return { success: true };
  } catch (error) {
    console.error('Failed to auto-connect to Vercel:', error);
    logStore.logError(`Vercel auto-connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      type: 'system',
      message: 'Vercel auto-connection failed',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    console.log('Setting isConnecting to false');
    isConnecting.set(false);
  }
}

/*
 * Phase 2 server-backed initializer. Calls /api/vercel-user, which
 * routes through the API service's UserConnection-backed proxy. On
 * 200 we hydrate the connection user from the server (the token never
 * reaches the browser) and trigger a stats refresh. On 401 we fall
 * back to the legacy env-token auto-connect so existing builders are
 * not stranded.
 */
export async function initializeVercelConnection() {
  try {
    const response = await fetch('/api/vercel-user', { method: 'GET' });

    if (response.ok) {
      const profile = (await response.json()) as {
        id: string | null;
        username: string | null;
        email: string | null;
        name: string | null;
        avatar: string | null;
      };

      if (profile.id) {
        updateVercelConnection({
          user: {
            id: profile.id,
            username: profile.username ?? '',
            email: profile.email ?? '',
            name: profile.name ?? '',
            avatar: profile.avatar ?? undefined,
          } as VercelConnection['user'],
          token: '',
        });

        await fetchVercelStats(null);

        return;
      }
    }
  } catch (error) {
    console.error('Vercel server-backed initialize failed:', error);
  }

  /*
   * Legacy fallback: env-token auto-connect for builders who have not
   * yet reconnected through the new ConnectorApiKeyConnectButton.
   */
  const envTokenLocal = import.meta.env?.VITE_VERCEL_ACCESS_TOKEN;

  if (envTokenLocal && !vercelConnection.get().token) {
    updateVercelConnection({ token: envTokenLocal });
    fetchVercelStats(envTokenLocal).catch(console.error);
  }
}

export const fetchVercelStatsViaAPI = (token: string | null) => fetchVercelStats(token);

async function fetchProjectsAndDeploymentsViaServer(): Promise<VercelProject[] | null> {
  const projectsResponse = await fetch('/api/vercel-proxy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method: 'GET', path: '/v9/projects' }),
  });

  if (projectsResponse.status === 401) {
    return null;
  }

  if (!projectsResponse.ok) {
    throw new Error(`Failed to fetch projects via server proxy: ${projectsResponse.status}`);
  }

  const projectsData = (await projectsResponse.json()) as { projects?: VercelProject[] };
  const projects = projectsData.projects ?? [];

  return Promise.all(
    projects.map(async (project) => {
      try {
        const deploymentsResponse = await fetch('/api/vercel-proxy', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            method: 'GET',
            path: '/v6/deployments',
            query: { projectId: project.id, limit: '1' },
          }),
        });

        if (deploymentsResponse.ok) {
          const deploymentsData = (await deploymentsResponse.json()) as {
            deployments?: VercelProject['latestDeployments'];
          };
          return { ...project, latestDeployments: deploymentsData.deployments ?? [] };
        }

        return project;
      } catch (error) {
        console.error(`Error fetching deployments for project ${project.id}:`, error);
        return project;
      }
    }),
  );
}

async function fetchProjectsAndDeploymentsViaToken(token: string): Promise<VercelProject[]> {
  const projectsResponse = await fetch('https://api.vercel.com/v9/projects', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!projectsResponse.ok) {
    throw new Error(`Failed to fetch projects: ${projectsResponse.status}`);
  }

  const projectsData = (await projectsResponse.json()) as { projects?: VercelProject[] };
  const projects = projectsData.projects ?? [];

  return Promise.all(
    projects.map(async (project) => {
      try {
        const deploymentsResponse = await fetch(
          `https://api.vercel.com/v6/deployments?projectId=${project.id}&limit=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (deploymentsResponse.ok) {
          const deploymentsData = (await deploymentsResponse.json()) as {
            deployments?: VercelProject['latestDeployments'];
          };
          return { ...project, latestDeployments: deploymentsData.deployments ?? [] };
        }

        return project;
      } catch (error) {
        console.error(`Error fetching deployments for project ${project.id}:`, error);
        return project;
      }
    }),
  );
}

/*
 * Pass null to route through /api/vercel-proxy (the UserConnection-
 * backed path); pass a bearer token to keep the legacy direct fetch
 * working for builders who have not yet reconnected.
 */
export async function fetchVercelStats(token: string | null) {
  try {
    isFetchingStats.set(true);

    let projectsWithDeployments: VercelProject[] | null = null;

    if (!token) {
      projectsWithDeployments = await fetchProjectsAndDeploymentsViaServer();

      if (!projectsWithDeployments) {
        return;
      }
    } else {
      projectsWithDeployments = await fetchProjectsAndDeploymentsViaToken(token);
    }

    const currentState = vercelConnection.get();
    updateVercelConnection({
      ...currentState,
      stats: {
        projects: projectsWithDeployments,
        totalProjects: projectsWithDeployments.length,
      },
    });
  } catch (error) {
    console.error('Vercel API Error:', error);
    logStore.logError('Failed to fetch Vercel stats', { error });
    toast.error('Failed to fetch Vercel statistics');
  } finally {
    isFetchingStats.set(false);
  }
}
