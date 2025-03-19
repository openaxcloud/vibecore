import { atom } from 'nanostores';
import type { SupabaseUser, SupabaseStats } from '~/types/supabase';

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
}

export interface SupabaseConnectionState {
  user: SupabaseUser | null;
  token: string;
  stats?: SupabaseStats;
  selectedProjectId?: string;
  isConnected?: boolean;
  project?: SupabaseProject; // Add the selected project data
}

// Init from localStorage if available
const savedConnection = typeof localStorage !== 'undefined' ? localStorage.getItem('supabase_connection') : null;

const initialState: SupabaseConnectionState = savedConnection
  ? JSON.parse(savedConnection)
  : {
      user: null,
      token: '',
      stats: undefined,
      selectedProjectId: undefined,
      isConnected: false,
      project: undefined, // Initialize as undefined
    };

export const supabaseConnection = atom<SupabaseConnectionState>(initialState);

// After init, fetch stats if we have a token
if (initialState.token && !initialState.stats) {
  fetchSupabaseStats(initialState.token).catch(console.error);
}

export const isConnecting = atom(false);
export const isFetchingStats = atom(false);

export function updateSupabaseConnection(connection: Partial<SupabaseConnectionState>) {
  const currentState = supabaseConnection.get();

  // Set isConnected based on user presence AND token
  if (connection.user !== undefined || connection.token !== undefined) {
    const newUser = connection.user !== undefined ? connection.user : currentState.user;
    const newToken = connection.token !== undefined ? connection.token : currentState.token;
    connection.isConnected = !!(newUser && newToken);
  }

  // Update the project data when selectedProjectId changes
  if (connection.selectedProjectId !== undefined) {
    if (connection.selectedProjectId && currentState.stats?.projects) {
      const selectedProject = currentState.stats.projects.find(
        (project) => project.id === connection.selectedProjectId,
      );

      if (selectedProject) {
        connection.project = selectedProject;
      } else {
        // If project not found in stats but ID is provided, set a minimal project object
        connection.project = {
          id: connection.selectedProjectId,
          name: `Project ${connection.selectedProjectId.substring(0, 8)}...`,
          region: 'unknown',
          organization_id: '',
          status: 'active',
          created_at: new Date().toISOString(),
        };
      }
    } else if (connection.selectedProjectId === '') {
      // Clear the project when selectedProjectId is empty
      connection.project = undefined;
    }
  }

  const newState = { ...currentState, ...connection };
  supabaseConnection.set(newState);

  /*
   * Always save the connection state to localStorage to persist across chats
   * Always save the connection state to localStorage to persist across chats
   */
  if (connection.user || connection.token || connection.selectedProjectId !== undefined) {
    localStorage.setItem('supabase_connection', JSON.stringify(newState));
  } else {
    localStorage.removeItem('supabase_connection');
  }
}

export async function fetchSupabaseStats(token: string) {
  isFetchingStats.set(true);

  try {
    const response = await fetch('https://api.supabase.com/v1/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }

    const projects = (await response.json()) as any;

    updateSupabaseConnection({
      stats: {
        projects,
        totalProjects: projects.length,
      },
    });
  } catch (error) {
    console.error('Failed to fetch Supabase stats:', error);
    throw error;
  } finally {
    isFetchingStats.set(false);
  }
}
