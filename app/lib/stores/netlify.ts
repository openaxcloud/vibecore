import { atom } from 'nanostores';
import { toast } from 'react-toastify';
import { logStore } from './logs';
import { CONNECTION_SECRET_FIELDS, persistConnectionWithoutSecrets } from '~/lib/connections/serverConnections';
import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { getI18nInstance } from '~/lib/i18n/runtime';
import type { NetlifyConnection, NetlifyUser } from '~/types/netlify';

// Initialize with stored connection or environment variable
const storedConnection = typeof window !== 'undefined' ? localStorage.getItem('netlify_connection') : null;
const envToken = import.meta.env.VITE_NETLIFY_ACCESS_TOKEN;
console.log('Netlify store: envToken loaded:', envToken ? '[TOKEN_EXISTS]' : '[NO_TOKEN]');

function getNetlifyConnectionCopy() {
  const i18n = getI18nInstance();

  return getClientRuntimeResidualCopy(i18n.resolvedLanguage ?? i18n.language);
}

// If we have an environment token but no stored connection, initialize with the env token
function parseStoredNetlifyConnection(raw: string | null): NetlifyConnection {
  const fallback: NetlifyConnection = {
    user: null,
    token: envToken || '',
    stats: undefined,
  };

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as NetlifyConnection;
  } catch {
    // Corrupt localStorage must not crash module initialization.
    return fallback;
  }
}

const initialConnection: NetlifyConnection = parseStoredNetlifyConnection(storedConnection);

export const netlifyConnection = atom<NetlifyConnection>(initialConnection);
export const isConnecting = atom<boolean>(false);
export const isFetchingStats = atom<boolean>(false);

// Function to initialize Netlify connection with environment token
export async function initializeNetlifyConnection() {
  const copy = getNetlifyConnectionCopy();
  const currentState = netlifyConnection.get();

  // If we already have a connection or no token, don't try to connect
  if (currentState.user || !envToken) {
    console.log('Netlify: Skipping auto-connect - user exists or no env token');
    return;
  }

  console.log('Netlify: Attempting auto-connection with env token');

  try {
    isConnecting.set(true);

    const response = await fetch('https://api.netlify.com/api/v1/user', {
      headers: {
        Authorization: `Bearer ${envToken}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.failed'], { provider: 'Netlify' }),
      );
    }

    const userData = await response.json();

    // Update the connection state
    const connectionData: Partial<NetlifyConnection> = {
      user: userData as NetlifyUser,
      token: envToken,
    };

    // Store in localStorage for persistence
    persistConnectionWithoutSecrets('netlify_connection', connectionData, CONNECTION_SECRET_FIELDS.netlify);

    // Update the store
    updateNetlifyConnection(connectionData);

    // Fetch initial stats
    await fetchNetlifyStats(envToken);
  } catch (error) {
    console.error('Error initializing Netlify connection:', error);
    logStore.logError(
      formatClientRuntimeResidualCopy(copy['clientRuntime.connection.initializationFailed'], { provider: 'Netlify' }),
      { error },
    );
  } finally {
    isConnecting.set(false);
  }
}

export const updateNetlifyConnection = (updates: Partial<NetlifyConnection>) => {
  const currentState = netlifyConnection.get();
  const newState = { ...currentState, ...updates };
  netlifyConnection.set(newState);

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    persistConnectionWithoutSecrets('netlify_connection', newState, CONNECTION_SECRET_FIELDS.netlify);
  }
};

export async function fetchNetlifyStats(token: string) {
  const copy = getNetlifyConnectionCopy();

  try {
    isFetchingStats.set(true);

    const sitesResponse = await fetch('https://api.netlify.com/api/v1/sites', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!sitesResponse.ok) {
      throw Object.assign(new Error(), { code: 'NETLIFY_SITES_HTTP_ERROR', status: sitesResponse.status });
    }

    const sitesJson = (await sitesResponse.json()) as any;

    /*
     * Guard against a non-array body (error envelope / paginated wrapper with a
     * 200): `sites.length` would be undefined and `sites` non-iterable downstream.
     */
    const sites = Array.isArray(sitesJson) ? sitesJson : [];

    const currentState = netlifyConnection.get();
    updateNetlifyConnection({
      ...currentState,
      stats: {
        sites,
        totalSites: sites.length,
      },
    });
  } catch (error) {
    console.error('Netlify API Error:', error);

    const failureMessage = formatClientRuntimeResidualCopy(copy['clientRuntime.connection.statsFetchFailed'], {
      provider: 'Netlify',
    });
    logStore.logError(failureMessage, { error });
    toast.error(failureMessage);
  } finally {
    isFetchingStats.set(false);
  }
}

/*
 * Cross-device hydration: recover the Netlify connection from the encrypted
 * server-side UserConnection when this device has none locally. Best-effort and
 * idempotent — skips when already connected here, swallows errors, never
 * overrides an active local connection. The token reaches the browser exactly as
 * the legacy localStorage flow already did; the difference is it now follows the
 * signed-in user to any device.
 */
export async function hydrateNetlifyFromUserConnection() {
  if (typeof window === 'undefined' || netlifyConnection.get().user) {
    return;
  }

  try {
    const tokenResponse = await fetch('/api/connector-token/netlify');

    if (!tokenResponse.ok) {
      return;
    }

    const { token } = (await tokenResponse.json()) as { token?: string | null };

    if (!token) {
      return;
    }

    const userResponse = await fetch('https://api.netlify.com/api/v1/user', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!userResponse.ok) {
      return;
    }

    const userData = (await userResponse.json()) as NetlifyUser;
    updateNetlifyConnection({ user: userData, token });
    await fetchNetlifyStats(token);
  } catch (error) {
    console.debug('Netlify cross-device hydration skipped:', error);
  }
}
