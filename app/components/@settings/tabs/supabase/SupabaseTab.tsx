import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { ConnectorApiKeyConnectButton } from '~/components/@settings/shared/connectors';
import { Button } from '~/components/ui/Button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
  formatClientAstResidualCopy,
  formatClientAstStorage,
  getClientAstResidualCopy,
} from '~/lib/i18n/catalogs/client-ast-residual';
import {
  supabaseConnection,
  isConnecting,
  isFetchingStats,
  isFetchingApiKeys,
  updateSupabaseConnection,
  fetchSupabaseStats,
  fetchProjectApiKeys,
  initializeSupabaseConnection,
  type SupabaseProject,
} from '~/lib/stores/supabase';
import { classNames } from '~/utils/classNames';

/**
 * Produce a human-readable status badge label for a Supabase project.
 *
 * `project.status` originates from the Supabase Management API response, which is
 * typed `as any` in fetchSupabaseStats (app/lib/stores/supabase.ts). If the API
 * omits/null's `status` (or schema-drifts), calling `.replace` directly would throw
 * during render and crash the whole projects list, so we coerce to 'UNKNOWN' first.
 */
export function formatProjectStatusLabel(status: string | null | undefined): string {
  return (status ?? 'UNKNOWN').replace('_', ' ');
}

interface ConnectionTestResult {
  status: 'success' | 'error' | 'testing';
  message: string;
  timestamp?: number;
}

interface ProjectAction {
  id: string;
  name: string;
  icon: string;
  action: (projectId: string) => Promise<void>;
  requiresConfirmation?: boolean;
  variant?: 'default' | 'destructive' | 'outline';
}

// Supabase logo SVG component
const SupabaseLogo = () => (
  <svg viewBox="0 0 109 113" className="w-5 h-5">
    <path
      fill="currentColor"
      d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z"
    />
    <path
      fillOpacity="0.2"
      fill="currentColor"
      d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z"
    />
    <path
      fill="currentColor"
      d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z"
    />
  </svg>
);

export default function SupabaseTab() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const astCopy = getClientAstResidualCopy(language);

  const percentFormatter = new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  });

  const formatLocalizedProjectStatus = (status: string | null | undefined) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE_HEALTHY':
        return t('settings.supabase.status.activeHealthy');
      case 'INACTIVE':
        return t('settings.supabase.status.inactive');
      case 'SUSPENDED':
        return t('settings.supabase.status.suspended');
      case 'COMING_UP':
        return t('settings.supabase.status.starting');
      case 'GOING_DOWN':
        return t('settings.supabase.status.stopping');
      case 'RESTORING':
        return t('settings.supabase.status.restoring');
      default:
        return t('settings.copy.unknown_b764cdc0');
    }
  };

  const connection = useStore(supabaseConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const fetchingApiKeys = useStore(isFetchingApiKeys);

  const [tokenInput, setTokenInput] = useState('');
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);
  const [isProjectActionLoading, setIsProjectActionLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const [pendingProjectAction, setPendingProjectAction] = useState<{
    projectId: string;
    action: ProjectAction;
  } | null>(null);

  // Connection testing function - uses server-side API to test environment token
  const testConnection = async () => {
    setConnectionTest({
      status: 'testing',
      message: t('settings.copy.testingConnection_3d0032b7'),
    });

    try {
      const response = await fetch('/api/supabase-user', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        setConnectionTest({
          status: 'success',
          message: t('settings.supabase.connection.environmentSuccess', { count: data.projects?.length || 0 }),
          timestamp: Date.now(),
        });
      } else {
        await response.json().catch(() => ({}));
        setConnectionTest({
          status: 'error',
          message: t('settings.supabase.connection.failedHttp', { status: response.status }),
          timestamp: Date.now(),
        });
      }
    } catch {
      setConnectionTest({
        status: 'error',
        message: t('settings.copy.failedToConnectToSupabase_55693a40'),
        timestamp: Date.now(),
      });
    }
  };

  // Project actions
  const projectActions: ProjectAction[] = [
    {
      id: 'api-keys',
      name: t('settings.supabase.action.getApiKeys'),
      icon: 'i-ph:key',
      action: async (projectId: string) => {
        try {
          await fetchProjectApiKeys(projectId, connection.token);
          toast.success(t('settings.copy.apiKeysFetchedSuccessfully_bf28ba7d'));
        } catch (err: unknown) {
          console.error('Failed to fetch Supabase API keys', err);
          toast.error(t('settings.supabase.apiKeys.fetchFailed'));
        }
      },
    },
    {
      id: 'dashboard',
      name: t('settings.supabase.action.viewDashboard'),
      icon: 'i-ph:layout',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}`, '_blank');
      },
    },
    {
      id: 'database',
      name: t('settings.supabase.action.viewDatabase'),
      icon: 'i-ph:database',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/editor`, '_blank');
      },
    },
    {
      id: 'auth',
      name: t('settings.supabase.action.viewAuth'),
      icon: 'i-ph:user-circle',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/auth/users`, '_blank');
      },
    },
    {
      id: 'storage',
      name: t('settings.supabase.action.viewStorage'),
      icon: 'i-ph:folder',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/storage/buckets`, '_blank');
      },
    },
    {
      id: 'functions',
      name: t('settings.supabase.action.viewFunctions'),
      icon: 'i-ph:code',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/functions`, '_blank');
      },
    },
    {
      id: 'logs',
      name: t('settings.supabase.action.viewLogs'),
      icon: 'i-ph:scroll',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/logs`, '_blank');
      },
    },
    {
      id: 'settings',
      name: t('settings.supabase.action.viewSettings'),
      icon: 'i-ph:gear',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/settings`, '_blank');
      },
    },
    {
      id: 'api-docs',
      name: t('settings.supabase.action.viewApiDocs'),
      icon: 'i-ph:book',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/api`, '_blank');
      },
    },
    {
      id: 'realtime',
      name: t('settings.supabase.action.viewRealtime'),
      icon: 'i-ph:radio',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/realtime`, '_blank');
      },
    },
    {
      id: 'edge-functions',
      name: t('settings.supabase.action.viewEdgeFunctions'),
      icon: 'i-ph:terminal',
      action: async (projectId: string) => {
        window.open(`https://supabase.com/dashboard/project/${projectId}/functions`, '_blank');
      },
    },
  ];

  // Initialize connection on component mount - check server-side token first
  useEffect(() => {
    const initializeConnection = async () => {
      try {
        // First try to initialize using server-side token
        await initializeSupabaseConnection();

        // If no connection was established, the user will need to manually enter a token
        const currentState = supabaseConnection.get();

        if (!currentState.user) {
          console.log('No server-side Supabase token available, manual connection required');
        }
      } catch (error) {
        console.error('Failed to initialize Supabase connection:', error);
      }
    };
    initializeConnection();
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      if (connection.user && connection.token && !connection.stats) {
        await fetchSupabaseStats(connection.token);
      }
    };
    fetchProjects().catch((error) => {
      console.error('Failed to fetch Supabase projects:', error);
    });
  }, [connection.user, connection.token]);

  const handleConnect = async () => {
    if (!tokenInput) {
      toast.error(t('settings.copy.pleaseEnterASupabaseAccessToken_441c8ccc'));
      return;
    }

    isConnecting.set(true);

    try {
      await fetchSupabaseStats(tokenInput);
      updateSupabaseConnection({
        token: tokenInput,
        isConnected: true,
      });
      toast.success(t('settings.copy.successfullyConnectedToSupabase_155c601e'));
      setTokenInput('');
    } catch (error) {
      console.error('Auth error:', error);
      toast.error(t('settings.copy.failedToConnectToSupabase_55693a40'));
      updateSupabaseConnection({ user: null, token: '' });
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    updateSupabaseConnection({
      user: null,
      token: '',
      stats: undefined,
      selectedProjectId: undefined,
      isConnected: false,
      project: undefined,
      credentials: undefined,
    });
    setConnectionTest(null);
    setSelectedProjectId('');
    toast.success(t('settings.copy.disconnectedFromSupabase_01f2830c'));
  };

  const performProjectAction = async (projectId: string, action: ProjectAction) => {
    setIsProjectActionLoading(true);
    await action.action(projectId);
    setIsProjectActionLoading(false);
  };

  const handleProjectAction = (projectId: string, action: ProjectAction) => {
    if (action.requiresConfirmation) {
      setPendingProjectAction({ projectId, action });
      return;
    }

    void performProjectAction(projectId, action);
  };

  const handleProjectSelect = async (projectId: string) => {
    setSelectedProjectId(projectId);
    updateSupabaseConnection({ selectedProjectId: projectId });

    if (projectId && connection.token) {
      try {
        await fetchProjectApiKeys(projectId, connection.token);
      } catch (error) {
        console.error('Failed to fetch API keys:', error);
      }
    }
  };

  const renderProjects = () => {
    if (fetchingStats) {
      return (
        <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
          <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
          {t('settings.copy.fetchingSupabaseProjects_e335dbd9')}
        </div>
      );
    }

    return (
      <Collapsible open={isProjectsExpanded} onOpenChange={setIsProjectsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70 dark:hover:border-bolt-elements-borderColorActive/70 transition-all duration-200 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="i-ph:database w-4 h-4 text-bolt-elements-item-contentAccent" />
              <span className="text-sm font-medium text-bolt-elements-textPrimary">
                {t('settings.copy.yourProjects_638a3b27')}
                {connection.stats?.totalProjects || 0})
              </span>
            </div>
            <div
              className={classNames(
                'i-ph:caret-down w-4 h-4 transform transition-transform duration-200 text-bolt-elements-textSecondary',
                isProjectsExpanded ? 'rotate-180' : '',
              )}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden">
          <div className="space-y-4 mt-4">
            {/* Supabase Overview Dashboard */}
            {connection.stats?.projects?.length ? (
              <div className="mb-6 p-4 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">
                  {t('settings.copy.supabaseOverview_dbf49062')}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                      {connection.stats.totalProjects}
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary">
                      {t('settings.copy.totalProjects_4ae08988')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                      {connection.stats.projects.filter((p: SupabaseProject) => p.status === 'ACTIVE_HEALTHY').length}
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary">
                      {t('settings.copy.activeProjects_80e50215')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                      {new Set(connection.stats.projects.map((p: SupabaseProject) => p.region)).size}
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary">
                      {t('settings.copy.regionsUsed_8c0c2e86')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                      {connection.stats.projects.filter((p: SupabaseProject) => p.status !== 'ACTIVE_HEALTHY').length}
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary">
                      {t('settings.copy.inactiveProjects_9f463f85')}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {connection.stats?.projects?.length ? (
              <div className="grid gap-3">
                {connection.stats.projects.map((project: SupabaseProject) => (
                  <div
                    key={project.id}
                    className={classNames(
                      'p-4 rounded-lg border transition-colors bg-bolt-elements-background-depth-1 cursor-pointer',
                      selectedProjectId === project.id
                        ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-item-backgroundActive/10'
                        : 'border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70',
                    )}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedProjectId === project.id}
                    aria-label={formatClientAstResidualCopy(astCopy['clientAst.settings.supabase.selectProject'], {
                      project: project.name,
                    })}
                    onClick={() => handleProjectSelect(project.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleProjectSelect(project.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <h5 className="text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                          <div className="i-ph:database w-4 h-4 shrink-0 text-bolt-elements-borderColorActive" />
                          <span className="min-w-0 truncate">{project.name}</span>
                        </h5>
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-bolt-elements-textSecondary">
                          <span className="flex items-center gap-1">
                            <div className="i-ph:globe w-3 h-3" />
                            {project.region}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <div className="i-ph:clock w-3 h-3" />
                            {new Date(project.created_at).toLocaleDateString(language)}
                          </span>
                          <span>•</span>
                          <span
                            className={classNames(
                              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                              project.status === 'ACTIVE_HEALTHY'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                : project.status === 'SUSPENDED'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                  : project.status === 'INACTIVE'
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
                            )}
                          >
                            <div
                              className={classNames(
                                'w-2 h-2 rounded-full',
                                project.status === 'ACTIVE_HEALTHY'
                                  ? 'bg-green-500'
                                  : project.status === 'SUSPENDED'
                                    ? 'bg-red-500'
                                    : project.status === 'INACTIVE'
                                      ? 'bg-yellow-500'
                                      : 'bg-[var(--vc-status-muted)]',
                              )}
                            />
                            {formatLocalizedProjectStatus(project.status)}
                          </span>
                        </div>

                        {/* Project Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-bolt-elements-borderColor">
                          <div className="text-center">
                            <div className="text-sm font-semibold text-bolt-elements-textPrimary">
                              {project.stats?.database?.tables ?? '--'}
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary flex items-center justify-center gap-1">
                              <div className="i-ph:table w-3 h-3" />
                              {t('settings.copy.tables_e3fe2a3f')}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-semibold text-bolt-elements-textPrimary">
                              {project.stats?.storage?.buckets ?? '--'}
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary flex items-center justify-center gap-1">
                              <div className="i-ph:folder w-3 h-3" />
                              {t('settings.copy.buckets_9b5cc8b7')}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-semibold text-bolt-elements-textPrimary">
                              {project.stats?.functions?.deployed ?? '--'}
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary flex items-center justify-center gap-1">
                              <div className="i-ph:code w-3 h-3" />
                              {t('settings.copy.functions_75e942e5')}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-semibold text-bolt-elements-textPrimary">
                              {project.stats?.database?.size_mb
                                ? formatClientAstStorage(project.stats.database.size_mb, 'MB', language)
                                : '--'}
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary flex items-center justify-center gap-1">
                              <div className="i-ph:database w-3 h-3" />
                              {t('settings.copy.dbSize_e4eff330')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedProjectId === project.id && (
                      <div className="space-y-4 mt-4 pt-4 border-t border-bolt-elements-borderColor">
                        <div className="flex flex-wrap items-center gap-1">
                          {projectActions.map((action) => (
                            <Button
                              key={action.name}
                              variant={action.variant || 'outline'}
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProjectAction(project.id, action);
                              }}
                              disabled={isProjectActionLoading || (action.id === 'api-keys' && fetchingApiKeys)}
                              className="flex items-center gap-1 text-xs px-2 py-1 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary"
                            >
                              <div className={`${action.icon} w-2.5 h-2.5`} />
                              {action.id === 'api-keys' && fetchingApiKeys
                                ? t('settings.supabase.apiKeys.fetching')
                                : action.name}
                            </Button>
                          ))}
                        </div>

                        {/* Project Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-bolt-elements-background-depth-2 p-3 rounded-lg space-y-2">
                            <h6 className="text-xs font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                              <div className="i-ph:database w-4 h-4 text-bolt-elements-item-contentAccent" />
                              {t('settings.copy.databaseSchema_e0cf4b65')}
                            </h6>
                            <div className="space-y-1 text-xs text-bolt-elements-textSecondary">
                              <div className="flex justify-between">
                                <span>{t('settings.copy.tables_0aef4f2b')}</span>
                                <span>{project.stats?.database?.tables ?? '--'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t('settings.copy.views_b6e45f9e')}</span>
                                <span>{project.stats?.database?.views ?? '--'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t('settings.copy.functions_219f5c63')}</span>
                                <span>{project.stats?.database?.functions ?? '--'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t('settings.copy.size_c987f668')}</span>
                                <span>
                                  {project.stats?.database?.size_mb
                                    ? formatClientAstStorage(project.stats.database.size_mb, 'MB', language)
                                    : '--'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-bolt-elements-background-depth-2 p-3 rounded-lg space-y-2">
                            <h6 className="text-xs font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                              <div className="i-ph:folder w-4 h-4 text-bolt-elements-item-contentAccent" />
                              {t('settings.copy.storage_a69c4dec')}
                            </h6>
                            <div className="space-y-1 text-xs text-bolt-elements-textSecondary">
                              <div className="flex justify-between">
                                <span>{t('settings.copy.buckets_026e0349')}</span>
                                <span>{project.stats?.storage?.buckets ?? '--'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t('settings.copy.files_e1a1abcf')}</span>
                                <span>{project.stats?.storage?.files ?? '--'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t('settings.copy.used_05b15ffb')}</span>
                                <span>
                                  {project.stats?.storage?.used_gb
                                    ? formatClientAstStorage(project.stats.storage.used_gb, 'GB', language)
                                    : '--'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>{t('settings.copy.available_72074a8a')}</span>
                                <span>
                                  {project.stats?.storage?.available_gb
                                    ? formatClientAstStorage(project.stats.storage.available_gb, 'GB', language)
                                    : '--'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {connection.credentials && (
                          <div className="bg-bolt-elements-background-depth-2 p-3 rounded-lg space-y-2">
                            <h6 className="text-xs font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                              <div className="i-ph:key w-4 h-4 text-bolt-elements-item-contentAccent" />
                              {t('settings.copy.projectCredentials_f92339b2')}
                            </h6>
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-bolt-elements-textSecondary">
                                  {t('settings.copy.supabaseUrl_dbb40813')}
                                </label>
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="text"
                                    value={connection.credentials.supabaseUrl || ''}
                                    readOnly
                                    className="flex-1 px-2 py-1 text-xs bg-bolt-elements-background border border-bolt-elements-borderColor rounded"
                                  />
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();

                                      if (connection.credentials?.supabaseUrl) {
                                        void navigator.clipboard
                                          .writeText(connection.credentials.supabaseUrl)
                                          .then(() => toast.success(t('settings.copy.urlCopiedToClipboard_2f396c3e')))
                                          .catch(() => toast.error(t('settings.common.clipboardUnavailable')));
                                      }
                                    }}
                                    className="w-8 h-8"
                                  >
                                    <div className="i-ph:copy w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-bolt-elements-textSecondary">
                                  {t('settings.copy.anonKey_a2d54eb8')}
                                </label>
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="password"
                                    value={connection.credentials.anonKey || ''}
                                    readOnly
                                    className="flex-1 px-2 py-1 text-xs bg-bolt-elements-background border border-bolt-elements-borderColor rounded"
                                  />
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();

                                      if (connection.credentials?.anonKey) {
                                        void navigator.clipboard
                                          .writeText(connection.credentials.anonKey)
                                          .then(() => toast.success(t('settings.copy.keyCopiedToClipboard_340f5dc8')))
                                          .catch(() => toast.error(t('settings.common.clipboardUnavailable')));
                                      }
                                    }}
                                    className="w-8 h-8"
                                  >
                                    <div className="i-ph:copy w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-bolt-elements-textSecondary flex items-center gap-2 p-4">
                <div className="i-ph:info w-4 h-4" />
                {t('settings.copy.noProjectsFoundInYourSupabaseAccount_bf4d45b7')}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-6">
      <ConfirmationDialog
        isOpen={pendingProjectAction !== null}
        onClose={() => setPendingProjectAction(null)}
        onConfirm={() => {
          const pending = pendingProjectAction;
          setPendingProjectAction(null);

          if (pending) {
            void performProjectAction(pending.projectId, pending.action);
          }
        }}
        title={t('settings.netlify.confirmActionTitle', {
          action: pendingProjectAction?.action.name ?? t('settings.netlify.action.run'),
        })}
        description={t('settings.netlify.confirmActionDescription', {
          action: pendingProjectAction?.action.name ?? t('settings.netlify.action.run'),
        })}
        confirmLabel={pendingProjectAction?.action.name ?? t('settings.netlify.confirm')}
        variant="destructive"
      />
      {/* Header */}
      <motion.div
        className="flex items-center justify-between gap-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2">
          <div className="text-[#3ECF8E]">
            <SupabaseLogo />
          </div>
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
            {t('settings.copy.supabaseIntegration_4c5095f2')}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {connection.user && (
            <Button
              onClick={testConnection}
              disabled={connectionTest?.status === 'testing'}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
            >
              {connectionTest?.status === 'testing' ? (
                <>
                  <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                  {t('settings.copy.testing_6c02a284')}
                </>
              ) : (
                <>
                  <div className="i-ph:plug-charging w-4 h-4" />
                  {t('settings.copy.testConnection_c02977b0')}
                </>
              )}
            </Button>
          )}
        </div>
      </motion.div>

      <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
        {t('settings.copy.connectAndManageYourSupabaseProjectsWithDatabase_f9c3d2a8')}
      </p>

      {/* Connection Test Results */}
      {connectionTest && (
        <motion.div
          className={classNames('p-4 rounded-lg border', {
            'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700':
              connectionTest.status === 'success',
            'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700': connectionTest.status === 'error',
            'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700': connectionTest.status === 'testing',
          })}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2">
            {connectionTest.status === 'success' && (
              <div className="i-ph:check-circle w-5 h-5 text-green-600 dark:text-green-400" />
            )}
            {connectionTest.status === 'error' && (
              <div className="i-ph:warning-circle w-5 h-5 text-red-600 dark:text-red-400" />
            )}
            {connectionTest.status === 'testing' && (
              <div className="i-ph:spinner-gap w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
            )}
            <span
              className={classNames('text-sm font-medium', {
                'text-green-800 dark:text-green-200': connectionTest.status === 'success',
                'text-red-800 dark:text-red-200': connectionTest.status === 'error',
                'text-blue-800 dark:text-blue-200': connectionTest.status === 'testing',
              })}
            >
              {connectionTest.message}
            </span>
          </div>
          {connectionTest.timestamp && (
            <p className="text-xs text-bolt-elements-textTertiary mt-1">
              {new Date(connectionTest.timestamp).toLocaleString(language)}
            </p>
          )}
        </motion.div>
      )}

      {/* Main Connection Component */}
      <motion.div
        className="bg-bolt-elements-background dark:bg-bolt-elements-background border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor rounded-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="p-6 space-y-6">
          {!connection.user ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 space-y-3">
                <p className="text-sm text-bolt-elements-textPrimary font-medium">
                  {t('settings.copy.recommendedServerSideConnection_5014a2b2')}
                </p>
                <p className="text-xs text-bolt-elements-textSecondary">
                  {t('settings.copy.yourTokenIsEncryptedAtRestAndNever_ffd74cea')}
                </p>
                <ConnectorApiKeyConnectButton
                  provider="supabase"
                  displayName="Supabase"
                  helpUrl="https://supabase.com/dashboard/account/tokens"
                  helpLabel={t('settings.supabase.generateToken')}
                  tokenPlaceholder={t('settings.supabase.tokenPlaceholder')}
                />
              </div>

              <div className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 p-3 rounded-lg mb-4">
                <p className="flex items-center gap-1 mb-1">
                  <span className="i-ph:lightbulb w-3.5 h-3.5 text-bolt-elements-icon-success dark:text-bolt-elements-icon-success" />
                  <span className="font-medium">{t('settings.copy.tip_ab744fe2')}</span>{' '}
                  {t('settings.copy.youCanAlsoSetThe_26377eef')}{' '}
                  <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 rounded">
                    VITE_SUPABASE_ACCESS_TOKEN
                  </code>{' '}
                  {t('settings.copy.environmentVariableToConnectAutomatically_34496ce0')}
                </p>
              </div>

              <div>
                <label className="block text-sm text-bolt-elements-textSecondary mb-2">
                  {t('settings.copy.accessToken_f9db72ce')}
                </label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  disabled={connecting}
                  placeholder={t('settings.copy.enterYourSupabaseAccessToken_5ba04661')}
                  className={classNames(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-bolt-elements-background-depth-3',
                    'border border-bolt-elements-borderColor',
                    'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                    'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                    'disabled:opacity-50',
                  )}
                />
                <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                  <a
                    href="https://supabase.com/dashboard/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
                  >
                    {t('settings.copy.getYourToken_41c867bf')}
                    <div className="i-ph:arrow-square-out w-4 h-4" />
                  </a>
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={connecting || !tokenInput}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-[var(--vc-ide-accent-action)] text-white',
                  'hover:opacity-90 hover:text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                  'transform active:scale-95',
                )}
              >
                {connecting ? (
                  <>
                    <div className="i-ph:spinner-gap animate-spin" />
                    {t('settings.copy.connecting_5f04ae9e')}
                  </>
                ) : (
                  <>
                    <div className="i-ph:plug-charging w-4 h-4" />
                    {t('settings.copy.connect_1a2303ed')}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDisconnect}
                    className={classNames(
                      'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                      'bg-red-500 text-white',
                      'hover:bg-red-600',
                    )}
                  >
                    <div className="i-ph:plug w-4 h-4" />
                    {t('settings.copy.disconnect_acfc5be7')}
                  </button>
                  <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                    <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                    {t('settings.copy.connectedToSupabase_389ab0c8')}
                  </span>
                </div>
              </div>

              {connection.user && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 rounded-lg">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                      <div className="i-ph:user w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{connection.user.email}</h4>
                      <p className="text-sm text-bolt-elements-textSecondary">
                        {connection.user.role} {t('settings.copy.memberSince_1ba87d11')}{' '}
                        {new Date(connection.user.created_at).toLocaleDateString(language)}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-bolt-elements-textSecondary">
                        <span className="flex items-center gap-1">
                          <div className="i-ph:buildings w-3 h-3" />
                          {connection.stats?.totalProjects || 0} {t('settings.copy.projects_04e2a972')}
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="i-ph:globe w-3 h-3" />
                          {new Set(connection.stats?.projects?.map((p: SupabaseProject) => p.region) || []).size}{' '}
                          {t('settings.copy.regions_610c65d8')}
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="i-ph:activity w-3 h-3" />
                          {connection.stats?.projects?.filter((p: SupabaseProject) => p.status === 'ACTIVE_HEALTHY')
                            .length || 0}{' '}
                          {t('settings.copy.active_92340695')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Analytics */}
                  <div className="mb-6 space-y-4">
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
                      {t('settings.copy.performanceAnalytics_87aa0998')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor">
                        <h6 className="text-xs font-medium text-bolt-elements-textPrimary flex items-center gap-2 mb-2">
                          <div className="i-ph:chart-line w-4 h-4 text-bolt-elements-item-contentAccent" />
                          {t('settings.copy.databaseHealth_11fb4459')}
                        </h6>
                        <div className="space-y-1">
                          {(() => {
                            const totalProjects = connection.stats?.totalProjects || 0;

                            const activeProjects =
                              connection.stats?.projects?.filter((p: SupabaseProject) => p.status === 'ACTIVE_HEALTHY')
                                .length || 0;
                            const healthRate =
                              totalProjects > 0 ? Math.round((activeProjects / totalProjects) * 100) : 0;
                            const avgTablesPerProject =
                              totalProjects > 0
                                ? Math.round(
                                    (connection.stats?.projects?.reduce(
                                      (sum, p) => sum + (p.stats?.database?.tables || 0),
                                      0,
                                    ) || 0) / totalProjects,
                                  )
                                : 0;

                            return [
                              {
                                label: t('settings.copy.healthRate_68d22a4d'),
                                value: percentFormatter.format(healthRate / 100),
                              },
                              { label: t('settings.copy.activeProjects_80e50215'), value: activeProjects },
                              { label: t('settings.copy.avgTablesProject_24aa1dce'), value: avgTablesPerProject },
                            ];
                          })().map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-bolt-elements-textSecondary">{item.label}:</span>
                              <span className="text-bolt-elements-textPrimary font-medium">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor">
                        <h6 className="text-xs font-medium text-bolt-elements-textPrimary flex items-center gap-2 mb-2">
                          <div className="i-ph:shield-check w-4 h-4 text-bolt-elements-item-contentAccent" />
                          {t('settings.copy.authSecurity_d13b5098')}
                        </h6>
                        <div className="space-y-1">
                          {(() => {
                            const totalProjects = connection.stats?.totalProjects || 0;

                            const projectsWithAuth =
                              connection.stats?.projects?.filter((p) => p.stats?.auth?.users !== undefined).length || 0;
                            const authEnabledRate =
                              totalProjects > 0 ? Math.round((projectsWithAuth / totalProjects) * 100) : 0;
                            const totalUsers =
                              connection.stats?.projects?.reduce((sum, p) => sum + (p.stats?.auth?.users || 0), 0) || 0;

                            return [
                              {
                                label: t('settings.copy.authEnabled_8c2c9721'),
                                value: percentFormatter.format(authEnabledRate / 100),
                              },
                              { label: t('settings.copy.totalUsers_0ca3aa44'), value: totalUsers },
                              {
                                label: t('settings.copy.avgUsersProject_cd7378ce'),
                                value: totalProjects > 0 ? Math.round(totalUsers / totalProjects) : 0,
                              },
                            ];
                          })().map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-bolt-elements-textSecondary">{item.label}:</span>
                              <span className="text-bolt-elements-textPrimary font-medium">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor">
                        <h6 className="text-xs font-medium text-bolt-elements-textPrimary flex items-center gap-2 mb-2">
                          <div className="i-ph:globe w-4 h-4 text-bolt-elements-item-contentAccent" />
                          {t('settings.copy.regionalDistribution_a7e9f85b')}
                        </h6>
                        <div className="space-y-1">
                          {(() => {
                            const regions =
                              connection.stats?.projects?.reduce(
                                (acc, p: SupabaseProject) => {
                                  acc[p.region] = (acc[p.region] || 0) + 1;
                                  return acc;
                                },
                                {} as Record<string, number>,
                              ) || {};

                            return Object.entries(regions)
                              .sort(([, a], [, b]) => b - a)
                              .slice(0, 3)
                              .map(([region, count]) => ({ label: region.toUpperCase(), value: count }));
                          })().map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-bolt-elements-textSecondary">{item.label}:</span>
                              <span className="text-bolt-elements-textPrimary font-medium">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resource Utilization */}
                  <div className="mb-6">
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      {t('settings.copy.resourceOverview_af304045')}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {(() => {
                        const totalDatabase =
                          connection.stats?.projects?.reduce((sum, p) => sum + (p.stats?.database?.size_mb || 0), 0) ||
                          0;
                        const totalStorage =
                          connection.stats?.projects?.reduce((sum, p) => sum + (p.stats?.storage?.used_gb || 0), 0) ||
                          0;
                        const totalFunctions =
                          connection.stats?.projects?.reduce(
                            (sum, p) => sum + (p.stats?.functions?.deployed || 0),
                            0,
                          ) || 0;
                        const totalTables =
                          connection.stats?.projects?.reduce((sum, p) => sum + (p.stats?.database?.tables || 0), 0) ||
                          0;
                        const totalBuckets =
                          connection.stats?.projects?.reduce((sum, p) => sum + (p.stats?.storage?.buckets || 0), 0) ||
                          0;

                        return [
                          {
                            label: t('settings.copy.database_fa7fe671'),
                            value: totalDatabase > 0 ? formatClientAstStorage(totalDatabase, 'MB', language) : '--',
                            icon: 'i-ph:database',
                            color: 'text-blue-500',
                            bgColor: 'bg-blue-100 dark:bg-blue-900/20',
                            textColor: 'text-blue-800 dark:text-blue-400',
                          },
                          {
                            label: t('settings.copy.storage_a69c4dec'),
                            value: totalStorage > 0 ? formatClientAstStorage(totalStorage, 'GB', language) : '--',
                            icon: 'i-ph:folder',
                            color: 'text-green-500',
                            bgColor: 'bg-green-100 dark:bg-green-900/20',
                            textColor: 'text-green-800 dark:text-green-400',
                          },
                          {
                            label: t('settings.copy.functions_75e942e5'),
                            value: totalFunctions,
                            icon: 'i-ph:code',
                            color: 'text-[var(--vc-ide-accent-action)]',
                            bgColor: 'bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_12%,transparent)]',
                            textColor: 'text-[var(--vc-ide-accent-action)]',
                          },
                          {
                            label: t('settings.copy.tables_e3fe2a3f'),
                            value: totalTables,
                            icon: 'i-ph:table',
                            color: 'text-orange-500',
                            bgColor: 'bg-orange-100 dark:bg-orange-900/20',
                            textColor: 'text-orange-800 dark:text-orange-400',
                          },
                          {
                            label: t('settings.copy.buckets_9b5cc8b7'),
                            value: totalBuckets,
                            icon: 'i-ph:archive',
                            color: 'text-teal-500',
                            bgColor: 'bg-teal-100 dark:bg-teal-900/20',
                            textColor: 'text-teal-800 dark:text-teal-400',
                          },
                        ];
                      })().map((metric, index) => (
                        <div
                          key={index}
                          className={`flex flex-col p-3 rounded-lg border border-bolt-elements-borderColor ${metric.bgColor}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`${metric.icon} w-4 h-4 ${metric.color}`} />
                            <span className="text-xs text-bolt-elements-textSecondary">{metric.label}</span>
                          </div>
                          <span className={`text-lg font-medium ${metric.textColor}`}>{metric.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Usage Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:database w-4 h-4 text-bolt-elements-item-contentAccent" />
                        <span className="text-xs font-medium text-bolt-elements-textPrimary">
                          {t('settings.copy.database_fa7fe671')}
                        </span>
                      </div>
                      <div className="text-sm text-bolt-elements-textSecondary">
                        <div>
                          {t('settings.copy.tables_0aef4f2b')}{' '}
                          {connection.stats?.projects?.reduce((sum, p) => sum + (p.stats?.database?.tables || 0), 0) ||
                            '--'}
                        </div>
                        <div>
                          {t('settings.copy.size_c987f668')}{' '}
                          {(() => {
                            const totalSize =
                              connection.stats?.projects?.reduce(
                                (sum, p) => sum + (p.stats?.database?.size_mb || 0),
                                0,
                              ) || 0;
                            return totalSize > 0 ? formatClientAstStorage(totalSize, 'MB', language) : '--';
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:folder w-4 h-4 text-bolt-elements-item-contentAccent" />
                        <span className="text-xs font-medium text-bolt-elements-textPrimary">
                          {t('settings.copy.storage_a69c4dec')}
                        </span>
                      </div>
                      <div className="text-sm text-bolt-elements-textSecondary">
                        <div>
                          {t('settings.copy.buckets_026e0349')}{' '}
                          {connection.stats?.projects?.reduce((sum, p) => sum + (p.stats?.storage?.buckets || 0), 0) ||
                            '--'}
                        </div>
                        <div>
                          {t('settings.copy.used_05b15ffb')}{' '}
                          {(() => {
                            const totalUsed =
                              connection.stats?.projects?.reduce(
                                (sum, p) => sum + (p.stats?.storage?.used_gb || 0),
                                0,
                              ) || 0;
                            return totalUsed > 0 ? formatClientAstStorage(totalUsed, 'GB', language) : '--';
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:code w-4 h-4 text-bolt-elements-item-contentAccent" />
                        <span className="text-xs font-medium text-bolt-elements-textPrimary">
                          {t('settings.copy.functions_75e942e5')}
                        </span>
                      </div>
                      <div className="text-sm text-bolt-elements-textSecondary">
                        <div>
                          {t('settings.copy.deployed_cb8a4bb4')}{' '}
                          {connection.stats?.projects?.reduce(
                            (sum, p) => sum + (p.stats?.functions?.deployed || 0),
                            0,
                          ) || '--'}
                        </div>
                        <div>
                          {t('settings.copy.invocations_f4d01184')}{' '}
                          {connection.stats?.projects?.reduce(
                            (sum, p) => sum + (p.stats?.functions?.invocations || 0),
                            0,
                          ) || '--'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {renderProjects()}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
