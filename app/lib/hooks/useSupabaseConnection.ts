import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { getSupabaseConnectionCopy } from '~/lib/i18n/catalogs/supabase-connection';
import { logStore } from '~/lib/stores/logs';
import {
  supabaseConnection,
  isConnecting,
  isFetchingStats,
  isFetchingApiKeys,
  updateSupabaseConnection,
  fetchProjectApiKeys,
  initializeSupabaseConnection,
} from '~/lib/stores/supabase';
import type { SupabaseStats, SupabaseUser } from '~/types/supabase';

interface SupabaseConnectionPayload {
  user: SupabaseUser;
  stats: SupabaseStats;
}

class SupabaseConnectionRequestError extends Error {
  readonly statusCode: number | undefined;

  constructor(statusCode?: number) {
    super();
    this.name = 'SupabaseConnectionRequestError';
    this.statusCode = statusCode;
  }
}

function isSupabaseConnectionPayload(value: unknown): value is SupabaseConnectionPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SupabaseConnectionPayload>;

  return Boolean(
    candidate.user &&
      typeof candidate.user === 'object' &&
      candidate.stats &&
      typeof candidate.stats === 'object' &&
      Array.isArray(candidate.stats.projects) &&
      typeof candidate.stats.totalProjects === 'number',
  );
}

export function useSupabaseConnection() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getSupabaseConnectionCopy(language);
  const connection = useStore(supabaseConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const fetchingApiKeys = useStore(isFetchingApiKeys);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const initConnection = async () => {
      console.log('useSupabaseConnection: Initializing connection...');

      // First, try to initialize from server-side token
      try {
        await initializeSupabaseConnection();
        console.log('useSupabaseConnection: Server-side initialization completed');
      } catch {
        console.log('useSupabaseConnection: Server-side initialization failed, trying localStorage');
      }

      // Then check localStorage for additional data
      const savedConnection = localStorage.getItem('supabase_connection');
      const savedCredentials = localStorage.getItem('supabaseCredentials');

      if (savedConnection) {
        console.log('useSupabaseConnection: Loading from localStorage');

        let parsed: any;

        try {
          parsed = JSON.parse(savedConnection);

          if (savedCredentials && !parsed.credentials) {
            parsed.credentials = JSON.parse(savedCredentials);
          }
        } catch {
          // Corrupted cache (partial write / tampering) — drop it rather than crash init.
          console.error('useSupabaseConnection: Failed to parse saved connection, clearing cache');
          localStorage.removeItem('supabase_connection');
          localStorage.removeItem('supabaseCredentials');
          parsed = null;
        }

        if (parsed) {
          // Only update if we don't already have a connection from server-side
          const currentState = supabaseConnection.get();

          if (!currentState.user) {
            updateSupabaseConnection(parsed);
          }

          if (parsed.token && parsed.selectedProjectId && !parsed.credentials) {
            fetchProjectApiKeys(parsed.selectedProjectId, parsed.token).catch(() => {
              console.error('useSupabaseConnection: Failed to restore project API keys');
            });
          }
        }
      }
    };

    initConnection();
  }, []);

  const handleConnect = async () => {
    isConnecting.set(true);

    try {
      const cleanToken = connection.token.trim();

      const response = await fetch('/api/supabase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: cleanToken,
        }),
      });

      if (!response.ok) {
        throw new SupabaseConnectionRequestError(response.status);
      }

      const data: unknown = await response.json();

      if (!isSupabaseConnectionPayload(data)) {
        throw new SupabaseConnectionRequestError(response.status);
      }

      updateSupabaseConnection({
        user: data.user,
        token: connection.token,
        stats: data.stats,
      });

      toast.success(copy['supabaseConnection.toast.connected']);

      setIsProjectsExpanded(true);

      return true;
    } catch (error) {
      const statusCode = error instanceof SupabaseConnectionRequestError ? error.statusCode : undefined;

      console.error('Supabase connection request failed', { statusCode });
      logStore.logError('Supabase authentication failed', undefined, { statusCode });
      toast.error(copy['supabaseConnection.toast.connectFailed']);
      updateSupabaseConnection({ user: null, token: '' });

      return false;
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    updateSupabaseConnection({ user: null, token: '' });
    toast.success(copy['supabaseConnection.toast.disconnected']);
    setIsDropdownOpen(false);
  };

  const selectProject = async (projectId: string) => {
    const currentState = supabaseConnection.get();

    let projectData = undefined;

    if (projectId && currentState.stats?.projects) {
      projectData = currentState.stats.projects.find((project) => project.id === projectId);
    }

    updateSupabaseConnection({
      selectedProjectId: projectId,
      project: projectData,
    });

    if (projectId && currentState.token) {
      try {
        await fetchProjectApiKeys(projectId, currentState.token);
        toast.success(copy['supabaseConnection.toast.projectSelected']);
      } catch {
        console.error('Failed to fetch Supabase project API keys');
        toast.error(copy['supabaseConnection.toast.projectKeysFailed']);
      }
    } else {
      toast.success(copy['supabaseConnection.toast.projectSelected']);
    }

    setIsDropdownOpen(false);
  };

  const handleCreateProject = async () => {
    window.open('https://app.supabase.com/new/new-project', '_blank');
  };

  return {
    connection,
    connecting,
    fetchingStats,
    fetchingApiKeys,
    isProjectsExpanded,
    setIsProjectsExpanded,
    isDropdownOpen,
    setIsDropdownOpen,
    handleConnect,
    handleDisconnect,
    selectProject,
    handleCreateProject,
    updateToken: (token: string) => updateSupabaseConnection({ ...connection, token }),
    isConnected: !!(connection.user && connection.token),
    fetchProjectApiKeys: (projectId: string) => {
      if (connection.token) {
        return fetchProjectApiKeys(projectId, connection.token);
      }

      return Promise.reject(new Error(copy['supabaseConnection.error.noToken']));
    },
  };
}
