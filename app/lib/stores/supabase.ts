import { atom } from 'nanostores';
import {
  formatClientRuntimeResidualCopy,
  getClientRuntimeResidualCopy,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { getI18nInstance } from '~/lib/i18n/runtime';
import type { SupabaseUser, SupabaseStats, SupabaseApiKey, SupabaseCredentials } from '~/types/supabase';

function getSupabaseStoreCopy() {
  const i18n = getI18nInstance();

  return getClientRuntimeResidualCopy(i18n.resolvedLanguage ?? i18n.language);
}

export interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  organization_id: string;
  status: string;
  database?: {
    host: string;
    version: string;
    postgres_engine: string;
    release_channel: string;
  };
  created_at: string;
  stats?: {
    database?: {
      tables: number;
      size: string;
      size_mb?: number;
      views?: number;
      functions?: number;
    };
    storage?: {
      objects: number;
      size: string;
      buckets?: number;
      files?: number;
      used_gb?: number;
      available_gb?: number;
    };
    functions?: {
      count: number;
      deployed?: number;
      invocations?: number;
    };
    auth?: {
      users: number;
    };
  };
}

export interface SupabaseConnectionState {
  user: SupabaseUser | null;
  token: string;
  stats?: SupabaseStats;
  selectedProjectId?: string;
  isConnected?: boolean;
  project?: SupabaseProject;
  credentials?: SupabaseCredentials;
}

const storage =
  typeof globalThis !== 'undefined' &&
  typeof globalThis.localStorage !== 'undefined' &&
  typeof globalThis.localStorage.getItem === 'function'
    ? globalThis.localStorage
    : null;

const savedConnection = storage ? storage.getItem('supabase_connection') : null;
const savedCredentials = storage ? storage.getItem('supabaseCredentials') : null;

const defaultState: SupabaseConnectionState = {
  user: null,
  token: '',
  stats: undefined,
  selectedProjectId: undefined,
  isConnected: false,
  project: undefined,
};

export function parseSavedConnection(raw: string | null): SupabaseConnectionState {
  if (!raw) {
    return { ...defaultState };
  }

  try {
    const parsed = JSON.parse(raw);

    /*
     * JSON.parse succeeds for valid-but-wrong shapes (e.g. the literal "null",
     * "42", or an array). Returning those would make `initialState` a non-object
     * and crash the module at import time (e.g. `initialState.token` throws on null).
     */
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as SupabaseConnectionState)
      : { ...defaultState };
  } catch {
    // Corrupt localStorage must not crash module initialization.
    return { ...defaultState };
  }
}

const initialState: SupabaseConnectionState = parseSavedConnection(savedConnection);

if (savedCredentials && !initialState.credentials) {
  try {
    initialState.credentials = JSON.parse(savedCredentials);
  } catch (e) {
    console.error('Failed to parse saved credentials:', e);
  }
}

export const supabaseConnection = atom<SupabaseConnectionState>(initialState);

export const isConnecting = atom(false);
export const isFetchingStats = atom(false);
export const isFetchingApiKeys = atom(false);

if (initialState.token && !initialState.stats) {
  fetchSupabaseStats(initialState.token).catch(console.error);
}

export function updateSupabaseConnection(connection: Partial<SupabaseConnectionState>) {
  const currentState = supabaseConnection.get();

  if (connection.user !== undefined || connection.token !== undefined) {
    const newUser = connection.user !== undefined ? connection.user : currentState.user;
    const newToken = connection.token !== undefined ? connection.token : currentState.token;
    connection.isConnected = !!(newUser && newToken);
  }

  if (connection.selectedProjectId !== undefined) {
    if (connection.selectedProjectId && currentState.stats?.projects) {
      const selectedProject = currentState.stats.projects.find(
        (project) => project.id === connection.selectedProjectId,
      );

      if (selectedProject) {
        connection.project = selectedProject;
      } else {
        const copy = getSupabaseStoreCopy();
        connection.project = {
          id: connection.selectedProjectId,
          name: formatClientRuntimeResidualCopy(copy['clientRuntime.connection.fallbackProjectName'], {
            identifier: `${connection.selectedProjectId.substring(0, 8)}…`,
          }),
          region: 'unknown',
          organization_id: '',
          status: 'active',
          created_at: new Date().toISOString(),
        };
      }
    } else if (connection.selectedProjectId === '') {
      connection.project = undefined;
      connection.credentials = undefined;
    }
  }

  const newState = { ...currentState, ...connection };
  supabaseConnection.set(newState);

  /*
   * Always save the connection state to localStorage to persist across chats
   */
  if (connection.user || connection.token || connection.selectedProjectId !== undefined || connection.credentials) {
    storage?.setItem('supabase_connection', JSON.stringify(newState));

    if (newState.credentials) {
      storage?.setItem('supabaseCredentials', JSON.stringify(newState.credentials));
    } else {
      storage?.removeItem('supabaseCredentials');
    }
  } else {
    storage?.removeItem('supabase_connection');
    storage?.removeItem('supabaseCredentials');
  }
}

export function initializeSupabaseConnection() {
  // Auto-connect using environment variable if available
  const envToken = import.meta.env?.VITE_SUPABASE_ACCESS_TOKEN;

  if (envToken && !supabaseConnection.get().token) {
    updateSupabaseConnection({ token: envToken });
    fetchSupabaseStats(envToken).catch(console.error);
  }
}

export async function fetchSupabaseStats(token: string) {
  const copy = getSupabaseStoreCopy();
  isFetchingStats.set(true);

  try {
    // Use the internal API route instead of direct Supabase API call
    const response = await fetch('/api/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
      }),
    });

    if (!response.ok) {
      throw new Error(
        formatClientRuntimeResidualCopy(copy['clientRuntime.connection.projectsFetchFailed'], { provider: 'Supabase' }),
      );
    }

    const data = (await response.json()) as any;

    updateSupabaseConnection({
      user: data.user,
      stats: data.stats,
    });
  } catch (error) {
    console.error('Failed to fetch Supabase stats:', error);
    throw error;
  } finally {
    isFetchingStats.set(false);
  }
}

/*
 * Cross-device hydration: recover the Supabase connection from the encrypted
 * server-side UserConnection when this device has none locally (see netlify.ts
 * for the rationale). Best-effort, idempotent, never overrides a local session.
 * fetchSupabaseStats hits /api/supabase, which itself prefers the server token —
 * so the per-project selection (kept per chatId) reconnects on a fresh device.
 */
export async function hydrateSupabaseFromUserConnection() {
  if (typeof window === 'undefined' || supabaseConnection.get().user) {
    return;
  }

  try {
    const tokenResponse = await fetch('/api/connector-token/supabase');

    if (!tokenResponse.ok) {
      return;
    }

    const { token } = (await tokenResponse.json()) as { token?: string | null };

    if (!token) {
      return;
    }

    updateSupabaseConnection({ token });
    await fetchSupabaseStats(token);
  } catch (error) {
    console.debug('Supabase cross-device hydration skipped:', error);
  }
}

export async function fetchProjectApiKeys(projectId: string, token: string) {
  const copy = getSupabaseStoreCopy();
  isFetchingApiKeys.set(true);

  try {
    const response = await fetch('/api/supabase/variables', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        token,
      }),
    });

    if (!response.ok) {
      throw new Error(copy['clientRuntime.connection.apiKeysFetchFailed']);
    }

    const data = (await response.json()) as any;

    /*
     * A 200 that omits `apiKeys` (error payload / schema drift) would make
     * `.find` throw and surface as an unhandled rejection — default to [].
     */
    const apiKeys = Array.isArray(data?.apiKeys) ? data.apiKeys : [];

    const anonKey = apiKeys.find((key: SupabaseApiKey) => key.name === 'anon' || key.name === 'public');

    if (anonKey) {
      const supabaseUrl = `https://${projectId}.supabase.co`;

      updateSupabaseConnection({
        credentials: {
          anonKey: anonKey.api_key,
          supabaseUrl,
        },
      });

      return { anonKey: anonKey.api_key, supabaseUrl };
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch project API keys:', error);
    throw error;
  } finally {
    isFetchingApiKeys.set(false);
  }
}
