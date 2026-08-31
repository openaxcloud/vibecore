import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import Cookies from 'js-cookie';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { normalizeVercelUser } from './vercel-connect';
import { redactVercelConnection } from './vercel-redact';
import { buildVercelRedeployRequest } from './vercel-redeploy';
import { ConnectorApiKeyConnectButton } from '~/components/@settings/shared/connectors';
import {
  ServiceHeader,
  ConnectionTestIndicator,
  type ConnectionTestResult,
} from '~/components/@settings/shared/service-integration';
import { Button } from '~/components/ui/Button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { logStore } from '~/lib/stores/logs';
import {
  vercelConnection,
  isConnecting,
  isFetchingStats,
  updateVercelConnection,
  fetchVercelStats,
  fetchVercelStatsViaAPI,
  initializeVercelConnection,
} from '~/lib/stores/vercel';
import type { VercelUserResponse } from '~/types/vercel';
import { classNames } from '~/utils/classNames';

interface ProjectAction {
  name: string;
  icon: string;
  action: (projectId: string) => Promise<void>;
  requiresConfirmation?: boolean;
  variant?: 'default' | 'destructive' | 'outline';
}

// Vercel logo SVG component
const VercelLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="currentColor" d="m12 2 10 18H2z" />
  </svg>
);

export default function VercelTab() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  const percentFormatter = new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  });

  const connection = useStore(vercelConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [isProjectActionLoading, setIsProjectActionLoading] = useState(false);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);

  const [pendingProjectAction, setPendingProjectAction] = useState<{
    projectId: string;
    action: ProjectAction;
  } | null>(null);

  const isTestingConnection = connectionTest?.status === 'testing';

  const testConnection = async () => {
    setConnectionTest({ status: 'testing', message: t('settings.copy.testingConnection_3d0032b7') });

    try {
      const response = await fetch('/api/vercel-user', { headers: { 'Content-Type': 'application/json' } });

      if (!response.ok) {
        setConnectionTest({
          status: 'error',
          message: t('settings.vercel.connection.failedHttp', { status: response.status }),
        });
        return;
      }

      const data = (await response.json()) as VercelUserResponse;
      const user = data.username || data.user?.username || data.email || data.user?.email || t('settings.vercel.user');
      setConnectionTest({ status: 'success', message: t('settings.vercel.connection.successAs', { user }) });
    } catch {
      setConnectionTest({ status: 'error', message: t('settings.copy.failedToConnectToVercel_13100f98') });
    }
  };

  const formatDeploymentState = (state: string | null | undefined) => {
    switch (state?.toUpperCase()) {
      case 'READY':
        return t('settings.vercel.status.ready');
      case 'ERROR':
        return t('settings.vercel.status.error');
      case 'BUILDING':
      case 'QUEUED':
      case 'INITIALIZING':
        return t('settings.vercel.status.building');
      case 'CANCELED':
        return t('settings.vercel.status.canceled');
      default:
        return t('settings.copy.unknown_b764cdc0');
    }
  };

  // Memoize project actions to prevent unnecessary re-renders
  const projectActions: ProjectAction[] = useMemo(
    () => [
      {
        name: t('settings.vercel.action.redeploy'),
        icon: 'i-ph:arrows-clockwise',
        action: async (projectId: string) => {
          try {
            /*
             * Redeploy the project's last production deployment from source via
             * the v13 create-deployment API (deploymentId + project *name*).
             */
            const { url, body } = buildVercelRedeployRequest(projectId, connection.stats?.projects);

            const response = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${connection.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            });

            if (!response.ok) {
              throw new Error(t('settings.vercel.redeployFailed'));
            }

            toast.success(t('settings.copy.projectRedeploymentInitiated_7170d074'));
            await fetchVercelStats(connection.token);
          } catch (err: unknown) {
            console.error('Failed to redeploy Vercel project', err);
            toast.error(t('settings.vercel.redeployFailed'));
          }
        },
      },
      {
        name: t('settings.vercel.action.viewDashboard'),
        icon: 'i-ph:layout',
        action: async (projectId: string) => {
          window.open(`https://vercel.com/dashboard/${projectId}`, '_blank');
        },
      },
      {
        name: t('settings.vercel.action.viewDeployments'),
        icon: 'i-ph:rocket',
        action: async (projectId: string) => {
          window.open(`https://vercel.com/dashboard/${projectId}/deployments`, '_blank');
        },
      },
      {
        name: t('settings.vercel.action.viewFunctions'),
        icon: 'i-ph:code',
        action: async (projectId: string) => {
          window.open(`https://vercel.com/dashboard/${projectId}/functions`, '_blank');
        },
      },
      {
        name: t('settings.vercel.action.viewAnalytics'),
        icon: 'i-ph:chart-bar',
        action: async (projectId: string) => {
          const project = connection.stats?.projects.find((p) => p.id === projectId);

          if (project) {
            window.open(`https://vercel.com/${connection.user?.username}/${project.name}/analytics`, '_blank');
          }
        },
      },
      {
        name: t('settings.vercel.action.viewDomains'),
        icon: 'i-ph:globe',
        action: async (projectId: string) => {
          window.open(`https://vercel.com/dashboard/${projectId}/domains`, '_blank');
        },
      },
      {
        name: t('settings.vercel.action.viewSettings'),
        icon: 'i-ph:gear',
        action: async (projectId: string) => {
          window.open(`https://vercel.com/dashboard/${projectId}/settings`, '_blank');
        },
      },
      {
        name: t('settings.vercel.action.viewLogs'),
        icon: 'i-ph:scroll',
        action: async (projectId: string) => {
          window.open(`https://vercel.com/dashboard/${projectId}/logs`, '_blank');
        },
      },
      {
        name: t('settings.vercel.action.deleteProject'),
        icon: 'i-ph:trash',
        action: async (projectId: string) => {
          try {
            const response = await fetch(`https://api.vercel.com/v1/projects/${projectId}`, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${connection.token}`,
              },
            });

            if (!response.ok) {
              throw new Error(t('settings.copy.failedToDeleteProject_e0e158d1'));
            }

            toast.success(t('settings.copy.projectDeletedSuccessfully_4dd069ca'));
            await fetchVercelStats(connection.token);
          } catch (err: unknown) {
            console.error('Failed to delete Vercel project', err);
            toast.error(t('settings.copy.failedToDeleteProject_e0e158d1'));
          }
        },
        requiresConfirmation: true,
        variant: 'destructive',
      },
    ],
    [connection.token, connection.stats?.projects, t],
  ); // Re-create when token or the resolved project list changes

  // Initialize connection on component mount - check server-side token first
  useEffect(() => {
    const initializeConnection = async () => {
      try {
        // First try to initialize using server-side token
        await initializeVercelConnection();

        // If no connection was established, the user will need to manually enter a token
        const currentState = vercelConnection.get();

        if (!currentState.user) {
          console.log('No server-side Vercel token available, manual connection required');
        }
      } catch (error) {
        console.error('Failed to initialize Vercel connection:', error);
      }
    };
    initializeConnection();
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      if (connection.user) {
        // Use server-side API if we have a connected user
        try {
          await fetchVercelStatsViaAPI(connection.token);
        } catch {
          // Fallback to direct API if server-side fails and we have a token
          if (connection.token) {
            await fetchVercelStats(connection.token);
          }
        }
      }
    };
    fetchProjects();
  }, [connection.user, connection.token]);

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    isConnecting.set(true);

    try {
      const token = connection.token;

      if (!token.trim()) {
        throw new Error(t('settings.copy.tokenIsRequired_6c718161'));
      }

      // First test the token directly with Vercel API
      const testResponse = await fetch('https://api.vercel.com/v2/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'e-code-app',
        },
      });

      if (!testResponse.ok) {
        if (testResponse.status === 401) {
          throw new Error(t('settings.copy.invalidVercelToken_98dacbe8'));
        }

        throw new Error(t('settings.vercel.connection.failedHttp', { status: testResponse.status }));
      }

      const userData = (await testResponse.json()) as VercelUserResponse;

      /*
       * SECURITY: never persist the Vercel access token to a JavaScript-readable
       * cookie. It is a long-lived, high-privilege credential (can delete
       * projects / trigger deployments); a non-httpOnly cookie is exfiltratable
       * by any XSS in the app. The token is held in-memory for this session and
       * server-side access goes through the connector flow
       * (ConnectorApiKeyConnectButton), which stores it encrypted at rest.
       */

      // Normalize the user data structure
      const normalizedUser = normalizeVercelUser(userData);

      updateVercelConnection({
        user: normalizedUser,
        token,
      });

      await fetchVercelStats(token);
      toast.success(t('settings.copy.successfullyConnectedToVercel_b11bdb69'));
    } catch (error) {
      console.error('Auth error:', error);
      logStore.logError(t('settings.vercel.authenticationFailed'), { error });
      toast.error(t('settings.copy.failedToConnectToVercel_13100f98'));
      updateVercelConnection({ user: null, token: '' });
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    // Clear Vercel-related cookies
    Cookies.remove('VITE_VERCEL_ACCESS_TOKEN');

    updateVercelConnection({ user: null, token: '' });
    toast.success(t('settings.copy.disconnectedFromVercel_f567b00a'));
  };

  const performProjectAction = useCallback(async (projectId: string, action: ProjectAction) => {
    setIsProjectActionLoading(true);
    await action.action(projectId);
    setIsProjectActionLoading(false);
  }, []);

  const handleProjectAction = useCallback(
    (projectId: string, action: ProjectAction) => {
      if (action.requiresConfirmation) {
        setPendingProjectAction({ projectId, action });
        return;
      }

      void performProjectAction(projectId, action);
    },
    [performProjectAction],
  );

  const renderProjects = useCallback(() => {
    if (fetchingStats) {
      return (
        <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
          <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
          {t('settings.copy.fetchingVercelProjects_a1e62108')}
        </div>
      );
    }

    return (
      <Collapsible open={isProjectsExpanded} onOpenChange={setIsProjectsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70 dark:hover:border-bolt-elements-borderColorActive/70 transition-all duration-200 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="i-ph:buildings w-4 h-4 text-bolt-elements-item-contentAccent" />
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
            {/* Vercel Overview Dashboard */}
            {connection.stats?.projects?.length ? (
              <div className="mb-6 p-4 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">
                  {t('settings.copy.vercelOverview_d21c758b')}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                      {
                        connection.stats.projects.filter(
                          (p) => p.targets?.production?.alias && p.targets.production.alias.length > 0,
                        ).length
                      }
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary">
                      {t('settings.copy.deployedProjects_d86ff17e')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                      {new Set(connection.stats.projects.map((p) => p.framework).filter(Boolean)).size}
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary">
                      {t('settings.copy.frameworksUsed_ba10cf19')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                      {connection.stats.projects.filter((p) => p.latestDeployments?.[0]?.state === 'READY').length}
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary">
                      {t('settings.copy.activeDeployments_3a490e28')}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Performance Analytics */}
            {connection.stats?.projects?.length ? (
              <div className="mb-6 space-y-4">
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
                  {t('settings.copy.performanceAnalytics_87aa0998')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor">
                    <h6 className="text-xs font-medium text-bolt-elements-textPrimary flex items-center gap-2 mb-2">
                      <div className="i-ph:rocket w-4 h-4 text-bolt-elements-item-contentAccent" />
                      {t('settings.copy.deploymentHealth_18dfb623')}
                    </h6>
                    <div className="space-y-1">
                      {(() => {
                        const totalDeployments = connection.stats.projects.reduce(
                          (sum, p) => sum + (p.latestDeployments?.length || 0),
                          0,
                        );
                        const readyDeployments = connection.stats.projects.filter(
                          (p) => p.latestDeployments?.[0]?.state === 'READY',
                        ).length;
                        const errorDeployments = connection.stats.projects.filter(
                          (p) => p.latestDeployments?.[0]?.state === 'ERROR',
                        ).length;
                        const successRate =
                          totalDeployments > 0
                            ? Math.round((readyDeployments / connection.stats.projects.length) * 100)
                            : 0;

                        return [
                          {
                            label: t('settings.copy.successRate_5068c6c3'),
                            value: percentFormatter.format(successRate / 100),
                          },
                          { label: t('settings.copy.active_92340695'), value: readyDeployments },
                          { label: t('settings.copy.failed_031a8f0f'), value: errorDeployments },
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
                      <div className="i-ph:chart-bar w-4 h-4 text-bolt-elements-item-contentAccent" />
                      {t('settings.copy.frameworkDistribution_43adda5b')}
                    </h6>
                    <div className="space-y-1">
                      {(() => {
                        const frameworks = connection.stats.projects.reduce(
                          (acc, p) => {
                            if (p.framework) {
                              acc[p.framework] = (acc[p.framework] || 0) + 1;
                            }

                            return acc;
                          },
                          {} as Record<string, number>,
                        );

                        return Object.entries(frameworks)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 3)
                          .map(([framework, count]) => ({ label: framework, value: count }));
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
                      <div className="i-ph:activity w-4 h-4 text-bolt-elements-item-contentAccent" />
                      {t('settings.copy.activitySummary_82fdd80c')}
                    </h6>
                    <div className="space-y-1">
                      {(() => {
                        const now = Date.now();

                        const recentDeployments = connection.stats.projects.filter((p) => {
                          const lastDeploy = p.latestDeployments?.[0]?.created;
                          return lastDeploy && now - new Date(lastDeploy).getTime() < 7 * 24 * 60 * 60 * 1000;
                        }).length;
                        const totalDomains = connection.stats.projects.reduce(
                          (sum, p) => sum + (p.targets?.production?.alias ? p.targets.production.alias.length : 0),
                          0,
                        );
                        const avgDomainsPerProject =
                          connection.stats.projects.length > 0
                            ? Math.round((totalDomains / connection.stats.projects.length) * 10) / 10
                            : 0;

                        return [
                          { label: t('settings.copy.recentDeploys_774ca7ed'), value: recentDeployments },
                          { label: t('settings.copy.totalDomains_0822e300'), value: totalDomains },
                          { label: t('settings.copy.avgDomainsProject_396db732'), value: avgDomainsPerProject },
                        ];
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
            ) : null}

            {/* Project Health Overview */}
            {connection.stats?.projects?.length ? (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  {t('settings.copy.projectHealthOverview_b02e68a2')}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(() => {
                    const healthyProjects = connection.stats.projects.filter(
                      (p) =>
                        p.latestDeployments?.[0]?.state === 'READY' && (p.targets?.production?.alias?.length ?? 0) > 0,
                    ).length;
                    const needsAttention = connection.stats.projects.filter(
                      (p) =>
                        p.latestDeployments?.[0]?.state === 'ERROR' || p.latestDeployments?.[0]?.state === 'CANCELED',
                    ).length;
                    const withCustomDomain = connection.stats.projects.filter((p) =>
                      p.targets?.production?.alias?.some((alias: string) => !alias.includes('.vercel.app')),
                    ).length;
                    const buildingProjects = connection.stats.projects.filter(
                      (p) => p.latestDeployments?.[0]?.state === 'BUILDING',
                    ).length;

                    return [
                      {
                        label: t('settings.copy.healthy_7f1e323b'),
                        value: healthyProjects,
                        icon: 'i-ph:check-circle',
                        color: 'text-green-500',
                        bgColor: 'bg-green-100 dark:bg-green-900/20',
                        textColor: 'text-green-800 dark:text-green-400',
                      },
                      {
                        label: t('settings.copy.customDomain_c1683eeb'),
                        value: withCustomDomain,
                        icon: 'i-ph:globe',
                        color: 'text-blue-500',
                        bgColor: 'bg-blue-100 dark:bg-blue-900/20',
                        textColor: 'text-blue-800 dark:text-blue-400',
                      },
                      {
                        label: t('settings.copy.building_87c5912f'),
                        value: buildingProjects,
                        icon: 'i-ph:gear',
                        color: 'text-yellow-500',
                        bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
                        textColor: 'text-yellow-800 dark:text-yellow-400',
                      },
                      {
                        label: t('settings.copy.issues_666067dd'),
                        value: needsAttention,
                        icon: 'i-ph:warning',
                        color: 'text-red-500',
                        bgColor: 'bg-red-100 dark:bg-red-900/20',
                        textColor: 'text-red-800 dark:text-red-400',
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
            ) : null}

            {connection.stats?.projects?.length ? (
              <div className="grid gap-3">
                {connection.stats.projects.map((project) => (
                  <div
                    key={project.id}
                    className="p-4 rounded-lg border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70 transition-colors bg-bolt-elements-background-depth-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h5 className="text-sm font-medium text-bolt-elements-textPrimary flex items-center gap-2">
                          <div className="i-ph:globe w-4 h-4 text-bolt-elements-borderColorActive" />
                          {project.name}
                        </h5>
                        <div className="flex items-center gap-2 mt-2 text-xs text-bolt-elements-textSecondary">
                          {project.targets?.production?.alias && project.targets.production.alias.length > 0 ? (
                            <>
                              <a
                                href={`https://${project.targets.production.alias.find((a: string) => a.endsWith('.vercel.app') && !a.includes('-projects.vercel.app')) || project.targets.production.alias[0]}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-bolt-elements-borderColorActive underline"
                              >
                                {project.targets.production.alias.find(
                                  (a: string) => a.endsWith('.vercel.app') && !a.includes('-projects.vercel.app'),
                                ) || project.targets.production.alias[0]}
                              </a>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <div className="i-ph:clock w-3 h-3" />
                                {new Date(project.createdAt).toLocaleDateString(language)}
                              </span>
                            </>
                          ) : project.latestDeployments && project.latestDeployments.length > 0 ? (
                            <>
                              <a
                                href={`https://${project.latestDeployments[0].url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-bolt-elements-borderColorActive underline"
                              >
                                {project.latestDeployments[0].url}
                              </a>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <div className="i-ph:clock w-3 h-3" />
                                {new Date(project.latestDeployments[0].created).toLocaleDateString(language)}
                              </span>
                            </>
                          ) : null}
                        </div>

                        {/* Project Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t border-bolt-elements-borderColor">
                          <div className="text-center">
                            <div className="text-sm font-semibold text-bolt-elements-textPrimary">
                              {/* Deployments - This would be fetched from API */}
                              --
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary flex items-center justify-center gap-1">
                              <div className="i-ph:rocket w-3 h-3" />
                              {t('settings.copy.deployments_842a4697')}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-semibold text-bolt-elements-textPrimary">
                              {/* Domains - This would be fetched from API */}
                              --
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary flex items-center justify-center gap-1">
                              <div className="i-ph:globe w-3 h-3" />
                              {t('settings.copy.domains_ced67718')}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-semibold text-bolt-elements-textPrimary">
                              {/* Team Members - This would be fetched from API */}
                              --
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary flex items-center justify-center gap-1">
                              <div className="i-ph:users w-3 h-3" />
                              {t('settings.copy.team_5985039f')}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-semibold text-bolt-elements-textPrimary">
                              {/* Bandwidth - This would be fetched from API */}
                              --
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary flex items-center justify-center gap-1">
                              <div className="i-ph:activity w-3 h-3" />
                              {t('settings.copy.bandwidth_bec749e6')}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {project.latestDeployments && project.latestDeployments.length > 0 && (
                          <div
                            className={classNames(
                              'flex items-center gap-1 px-2 py-1 rounded-full text-xs',
                              project.latestDeployments[0].state === 'READY'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                : project.latestDeployments[0].state === 'ERROR'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
                            )}
                          >
                            <div
                              className={classNames(
                                'w-2 h-2 rounded-full',
                                project.latestDeployments[0].state === 'READY'
                                  ? 'bg-green-500'
                                  : project.latestDeployments[0].state === 'ERROR'
                                    ? 'bg-red-500'
                                    : 'bg-yellow-500',
                              )}
                            />
                            {formatDeploymentState(project.latestDeployments[0].state)}
                          </div>
                        )}
                        {project.framework && (
                          <div className="text-xs text-bolt-elements-textSecondary px-2 py-1 rounded-md bg-bolt-elements-background-depth-2">
                            <span className="flex items-center gap-1">
                              <div className="i-ph:code w-3 h-3" />
                              {project.framework}
                            </span>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`https://vercel.com/dashboard/${project.id}`, '_blank')}
                          className="flex items-center gap-1 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary"
                        >
                          <div className="i-ph:arrow-square-out w-3 h-3" />
                          {t('settings.copy.view_dcc839a4')}
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-1 mt-3 pt-3 border-t border-bolt-elements-borderColor">
                      {projectActions.map((action) => (
                        <Button
                          key={action.name}
                          variant={action.variant || 'outline'}
                          size="sm"
                          onClick={() => handleProjectAction(project.id, action)}
                          disabled={isProjectActionLoading}
                          className="flex items-center gap-1 text-xs px-2 py-1 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary"
                        >
                          <div className={`${action.icon} w-2.5 h-2.5`} />
                          {action.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-bolt-elements-textSecondary flex items-center gap-2 p-4">
                <div className="i-ph:info w-4 h-4" />
                {t('settings.copy.noProjectsFoundInYourVercelAccount_95b15497')}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }, [
    connection.stats,
    fetchingStats,
    isProjectsExpanded,
    isProjectActionLoading,
    handleProjectAction,
    projectActions,
  ]);

  /*
   * SECURITY: never log the raw connection (it holds the Vercel access token).
   * Log only a redacted shape so the high-privilege token cannot leak to the
   * console, browser extensions, error reporters or session-replay tools.
   */
  console.log('vercel connection', redactVercelConnection(connection));

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
      <ServiceHeader
        icon={VercelLogo}
        title={t('settings.copy.vercelIntegration_f03a9d1b')}
        description={t('settings.copy.connectAndManageYourVercelProjectsWithAdvanced_c54d120d')}
        onTestConnection={connection.user ? () => testConnection() : undefined}
        isTestingConnection={isTestingConnection}
      />

      <ConnectionTestIndicator testResult={connectionTest} />

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
                  provider="vercel"
                  displayName="Vercel"
                  helpUrl="https://vercel.com/account/tokens"
                  helpLabel={t('settings.vercel.generateToken')}
                  tokenPlaceholder={t('settings.vercel.tokenPlaceholder')}
                />
              </div>

              <div className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 p-3 rounded-lg mb-4">
                <p className="flex items-center gap-1 mb-1">
                  <span className="i-ph:lightbulb w-3.5 h-3.5 text-bolt-elements-icon-success dark:text-bolt-elements-icon-success" />
                  <span className="font-medium">{t('settings.copy.tip_ab744fe2')}</span>{' '}
                  {t('settings.copy.youCanAlsoSetThe_26377eef')}{' '}
                  <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 rounded">
                    VITE_VERCEL_ACCESS_TOKEN
                  </code>{' '}
                  {t('settings.copy.environmentVariableToConnectAutomatically_34496ce0')}
                </p>
              </div>

              <div>
                <label className="block text-sm text-bolt-elements-textSecondary mb-2">
                  {t('settings.copy.personalAccessToken_5572fccc')}
                </label>
                <input
                  type="password"
                  value={connection.token}
                  onChange={(e) => updateVercelConnection({ ...connection, token: e.target.value })}
                  disabled={connecting}
                  placeholder={t('settings.copy.enterYourVercelPersonalAccessToken_b1562395')}
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
                    href="https://vercel.com/account/tokens"
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
                disabled={connecting || !connection.token}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-[var(--vc-ide-accent-action)] text-[var(--vc-ide-on-accent-action)]',
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
                      'bg-red-600 text-white',
                      'hover:bg-red-600',
                    )}
                  >
                    <div className="i-ph:plug w-4 h-4" />
                    {t('settings.copy.disconnect_acfc5be7')}
                  </button>
                  <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                    <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                    {t('settings.copy.connectedToVercel_699b4165')}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 rounded-lg">
                  <img
                    src={`https://vercel.com/api/www/avatar?u=${connection.user?.username}`}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    alt={t('settings.copy.userAvatar_2a87bfe3')}
                    className="w-12 h-12 rounded-full border-2 border-bolt-elements-borderColorActive"
                  />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary">
                      {connection.user?.username || t('settings.vercel.user')}
                    </h4>
                    <p className="text-sm text-bolt-elements-textSecondary">
                      {connection.user?.email || t('settings.vercel.noEmail')}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-bolt-elements-textSecondary">
                      <span className="flex items-center gap-1">
                        <div className="i-ph:buildings w-3 h-3" />
                        {connection.stats?.totalProjects || 0} {t('settings.copy.projects_04e2a972')}
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="i-ph:check-circle w-3 h-3" />
                        {connection.stats?.projects.filter((p) => p.latestDeployments?.[0]?.state === 'READY').length ||
                          0}{' '}
                        {t('settings.copy.live_b64ac05f')}
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="i-ph:users w-3 h-3" />
                        {/* Team size would be fetched from API */}
                        --
                      </span>
                    </div>
                  </div>
                </div>

                {/* Usage Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="i-ph:buildings w-4 h-4 text-bolt-elements-item-contentAccent" />
                      <span className="text-xs font-medium text-bolt-elements-textPrimary">
                        {t('settings.copy.projects_04e2a972')}
                      </span>
                    </div>
                    <div className="text-sm text-bolt-elements-textSecondary">
                      <div>
                        {t('settings.copy.active_b49c81b7')}{' '}
                        {connection.stats?.projects.filter((p) => p.latestDeployments?.[0]?.state === 'READY').length ||
                          0}
                      </div>
                      <div>
                        {t('settings.copy.total_18e872be')} {connection.stats?.totalProjects || 0}
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="i-ph:globe w-4 h-4 text-bolt-elements-item-contentAccent" />
                      <span className="text-xs font-medium text-bolt-elements-textPrimary">
                        {t('settings.copy.domains_ced67718')}
                      </span>
                    </div>
                    <div className="text-sm text-bolt-elements-textSecondary">
                      {/* Domain usage would be fetched from API */}
                      <div>{t('settings.copy.custom_01c6ed83')}</div>
                      <div>{t('settings.copy.vercel_2158e5fe')}</div>
                    </div>
                  </div>
                  <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="i-ph:activity w-4 h-4 text-bolt-elements-item-contentAccent" />
                      <span className="text-xs font-medium text-bolt-elements-textPrimary">
                        {t('settings.copy.usage_8d59829c')}
                      </span>
                    </div>
                    <div className="text-sm text-bolt-elements-textSecondary">
                      {/* Usage metrics would be fetched from API */}
                      <div>{t('settings.copy.bandwidth_6ac4a3f5')}</div>
                      <div>{t('settings.copy.requests_ab1158f4')}</div>
                    </div>
                  </div>
                </div>
              </div>

              {renderProjects()}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
