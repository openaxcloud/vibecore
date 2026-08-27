import { atom } from 'nanostores';
import { toast } from 'react-toastify';
import { logStore } from './logs';
import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { getI18nInstance } from '~/lib/i18n/runtime';
import type { VercelConnection } from '~/types/vercel';

// Auto-connect using environment variable
const envToken = import.meta.env?.VITE_VERCEL_ACCESS_TOKEN;

function getVercelConnectionCopy() {
  const i18n = getI18nInstance();

  return getClientRuntimeResidualCopy(i18n.resolvedLanguage ?? i18n.language);
}

// Initialize with stored connection or defaults
const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('vercel_connection') : null;

let initialConnection: VercelConnection;

if (storedConnection) {
  try {
    const parsed = JSON.parse(storedConnection);

    /*
     * JSON.parse('null')/'42' succeed but yield a non-object; later `.get().token`
     * would throw. Treat a valid-but-wrong shape the same as invalid JSON.
     */
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(
        formatClientRuntimeResidualCopy(getVercelConnectionCopy()['clientRuntime.connection.savedDataInvalid'], {
          provider: 'Vercel',
        }),
      );
    }

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
  const copy = getVercelConnectionCopy();
  console.log('autoConnectVercel called, envToken exists:', !!envToken);

  if (!envToken) {
    console.error('No Vercel token found in environment');
    return {
      success: false,
      error: formatClientRuntimeResidualCopy(copy['clientRuntime.connection.environmentTokenMissing'], {
        provider: 'Vercel',
      }),
    };
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
      throw Object.assign(new Error(), { code: 'VERCEL_USER_HTTP_ERROR', status: response.status });
    }

    const userData = (await response.json()) as any;
    console.log('Vercel API response userData:', userData);

    // Update connection
    console.log('Updating Vercel connection');
    updateVercelConnection({
      user: userData.user || userData,
      token: envToken,
    });

    const connectedMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.autoConnectedAs'], {
      provider: 'Vercel',
      account: userData.user?.username || userData.username,
    });
    logStore.logInfo(connectedMessage, {
      type: 'system',
      message: connectedMessage,
    });

    // Fetch stats
    console.log('Fetching Vercel stats');
    await fetchVercelStats(envToken);

    console.log('Vercel auto-connection successful');

    return { success: true };
  } catch (error) {
    console.error('Failed to auto-connect to Vercel:', error);

    const failureMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.autoConnectionFailed'], {
      provider: 'Vercel',
    });
    logStore.logError(failureMessage, {
      type: 'system',
      message: failureMessage,
    });

    return {
      success: false,
      error: failureMessage,
    };
  } finally {
    console.log('Setting isConnecting to false');
    isConnecting.set(false);
  }
}

export function initializeVercelConnection() {
  // Auto-connect using environment variable if available
  const envToken = import.meta.env?.VITE_VERCEL_ACCESS_TOKEN;

  if (envToken && !vercelConnection.get().token) {
    updateVercelConnection({ token: envToken });
    fetchVercelStats(envToken).catch(console.error);
  }
}

export const fetchVercelStatsViaAPI = fetchVercelStats;

export async function fetchVercelStats(token: string) {
  const copy = getVercelConnectionCopy();

  try {
    isFetchingStats.set(true);

    const projectsResponse = await fetch('https://api.vercel.com/v9/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!projectsResponse.ok) {
      throw Object.assign(new Error(), { code: 'VERCEL_PROJECTS_HTTP_ERROR', status: projectsResponse.status });
    }

    const projectsData = (await projectsResponse.json()) as any;
    const projects = Array.isArray(projectsData.projects) ? projectsData.projects : [];

    const fetchProjectDeployments = async (project: any) => {
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
          const deploymentsData = (await deploymentsResponse.json()) as any;
          return {
            ...project,
            latestDeployments: deploymentsData.deployments || [],
          };
        }

        return project;
      } catch (error) {
        console.error(`Error fetching deployments for project ${project.id}:`, error);
        return project;
      }
    };

    /*
     * Fetch latest deployment per project in bounded batches. An unbounded
     * Promise.all over hundreds of projects fired hundreds of simultaneous
     * requests, hitting Vercel rate limits (429) and failing the whole batch.
     */
    const CONCURRENCY = 5;
    const projectsWithDeployments: any[] = [];

    for (let i = 0; i < projects.length; i += CONCURRENCY) {
      const batch = projects.slice(i, i + CONCURRENCY);
      projectsWithDeployments.push(...(await Promise.all(batch.map(fetchProjectDeployments))));
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

    const failureMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], {
      provider: 'Vercel',
    });
    logStore.logError(failureMessage, { error });
    toast.error(failureMessage);
  } finally {
    isFetchingStats.set(false);
  }
}

/*
 * Cross-device hydration: recover the Vercel connection from the encrypted
 * server-side UserConnection when this device has none locally (see netlify.ts
 * for the rationale). Best-effort, idempotent, never overrides a local session.
 */
export async function hydrateVercelFromUserConnection() {
  if (typeof window === 'undefined' || vercelConnection.get().user) {
    return;
  }

  try {
    const tokenResponse = await fetch('/api/connector-token/vercel');

    if (!tokenResponse.ok) {
      return;
    }

    const { token } = (await tokenResponse.json()) as { token?: string | null };

    if (!token) {
      return;
    }

    const userResponse = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!userResponse.ok) {
      return;
    }

    const userData = (await userResponse.json()) as any;
    updateVercelConnection({ user: userData.user || userData, token });
    await fetchVercelStats(token);
  } catch (error) {
    console.debug('Vercel cross-device hydration skipped:', error);
  }
}
