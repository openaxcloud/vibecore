import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { logStore } from '~/lib/stores/logs';
import { supabaseConnection, isConnecting, isFetchingStats, updateSupabaseConnection } from '~/lib/stores/supabase';

export function useSupabaseConnection() {
  const connection = useStore(supabaseConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const savedConnection = localStorage.getItem('supabase_connection');

    if (savedConnection) {
      const parsed = JSON.parse(savedConnection);
      updateSupabaseConnection(parsed);
    }
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

      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      updateSupabaseConnection({
        user: data.user,
        token: connection.token,
        stats: data.stats,
      });

      toast.success('Successfully connected to Supabase');

      // Keep the dialog open and expand the projects section
      setIsProjectsExpanded(true);

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      logStore.logError('Failed to authenticate with Supabase', { error });
      toast.error(error instanceof Error ? error.message : 'Failed to connect to Supabase');
      updateSupabaseConnection({ user: null, token: '' });

      return false;
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    updateSupabaseConnection({ user: null, token: '' });
    toast.success('Disconnected from Supabase');
    setIsDropdownOpen(false);
  };

  const selectProject = (projectId: string) => {
    const currentState = supabaseConnection.get();
    let projectData = undefined;

    if (projectId && currentState.stats?.projects) {
      projectData = currentState.stats.projects.find((project) => project.id === projectId);
    }

    updateSupabaseConnection({
      selectedProjectId: projectId,
      project: projectData,
    });

    toast.success('Project selected successfully');
    setIsDropdownOpen(false);
  };

  const handleCreateProject = async () => {
    window.open('https://app.supabase.com/new/new-project', '_blank');
  };

  return {
    connection,
    connecting,
    fetchingStats,
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
  };
}
