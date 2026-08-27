import { useStore } from '@nanostores/react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { lazy, Suspense, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AvatarDropdown } from './AvatarDropdown';
import { TabPanelBoundary } from './TabPanelBoundary';
import { DEFAULT_TAB_CONFIG } from './constants';
import { getTabPanelBoundaryKey } from './tab-panel-boundary-key';
import { getTabUpdateStatus } from './tab-status';
import type { TabType } from './types';
import { TabTile } from '~/components/@settings/shared/components/TabTile';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { DialogTitle } from '~/components/ui/Dialog';
import { useFeatures } from '~/lib/hooks/useFeatures';
import { useNotifications } from '~/lib/hooks/useNotifications';
import {
  formatSettingsCoreStatusMessage,
  getSettingsCoreCopy,
  getSettingsCoreTabDescription,
  getSettingsCoreTabLabel,
  resolveSettingsCoreLanguage,
  type SettingsCoreCopy,
} from '~/lib/i18n/catalogs/settings-core';
import { tabConfigurationStore, resetTabConfiguration } from '~/lib/stores/settings';
import { classNames } from '~/utils/classNames';

const ProfileTab = lazy(() => import('~/components/@settings/tabs/profile/ProfileTab'));
const SettingsTab = lazy(() => import('~/components/@settings/tabs/settings/SettingsTab'));
const NotificationsTab = lazy(() => import('~/components/@settings/tabs/notifications/NotificationsTab'));
const FeaturesTab = lazy(() => import('~/components/@settings/tabs/features/FeaturesTab'));

const DataTab = lazy(() =>
  import('~/components/@settings/tabs/data/DataTab').then((module) => ({ default: module.DataTab })),
);
const EventLogsTab = lazy(() =>
  import('~/components/@settings/tabs/event-logs/EventLogsTab').then((module) => ({ default: module.EventLogsTab })),
);

const GitHubTab = lazy(() => import('~/components/@settings/tabs/github/GitHubTab'));
const GitLabTab = lazy(() => import('~/components/@settings/tabs/gitlab/GitLabTab'));
const SupabaseTab = lazy(() => import('~/components/@settings/tabs/supabase/SupabaseTab'));
const VercelTab = lazy(() => import('~/components/@settings/tabs/vercel/VercelTab'));
const NetlifyTab = lazy(() => import('~/components/@settings/tabs/netlify/NetlifyTab'));
const CloudProvidersTab = lazy(() => import('~/components/@settings/tabs/providers/cloud/CloudProvidersTab'));
const LocalProvidersTab = lazy(() => import('~/components/@settings/tabs/providers/local/LocalProvidersTab'));
const McpTab = lazy(() => import('~/components/@settings/tabs/mcp/McpTab'));
const ConnectionsTab = lazy(() => import('~/components/@settings/tabs/connections/ConnectionsTab'));
const UpdateTab = lazy(() => import('~/components/@settings/tabs/update/UpdateTab'));
const DebugTab = lazy(() => import('~/components/@settings/tabs/debug/DebugTab'));
const TaskManagerTab = lazy(() => import('~/components/@settings/tabs/task-manager/TaskManagerTab'));
const ServiceStatusTab = lazy(() => import('~/components/@settings/tabs/service-status/ServiceStatusTab'));

interface ControlPanelProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabType | null;

  /*
   * Servi comme PAGE (`/settings`) et non comme dialogue au-dessus d'une autre
   * page. Le titre devient alors le `h1` du document : sans lui la route n'avait
   * AUCUN titre de niveau 1 et démarrait au niveau 2, laissant un lecteur d'écran
   * sans point d'entrée (WCAG 1.3.1). En dialogue, `h2` reste correct — la page
   * en dessous porte déjà son propre `h1`.
   */
  asPage?: boolean;
}

// Beta status for experimental features
const BETA_TABS = new Set<TabType>(['local-providers', 'mcp']);

const BetaLabel = ({ label }: { label: string }) => (
  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]">
    <span className="text-[11px] font-medium text-[var(--vc-ide-accent-action)]">{label}</span>
  </div>
);

export const SettingsTabLoading = ({ label }: { label: string }) => (
  <div className="mx-auto w-full max-w-3xl space-y-4 p-1 sm:p-2" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div className="h-8 w-2/5 animate-pulse rounded-md bg-bolt-elements-background-depth-3 motion-reduce:animate-none" />
    <div className="h-24 w-full animate-pulse rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 motion-reduce:animate-none" />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="h-20 animate-pulse rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 motion-reduce:animate-none" />
      <div className="h-20 animate-pulse rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 motion-reduce:animate-none" />
    </div>
  </div>
);

const EmptySettingsTabs = ({ copy }: { copy: SettingsCoreCopy }) => (
  <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-10 text-center sm:px-6 sm:py-16">
    <div className="i-ph:sliders-horizontal mb-3 h-10 w-10 text-bolt-elements-textTertiary" aria-hidden="true" />
    <h2 className="text-base font-semibold text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
      {copy['settingsCore.panel.empty.title']}
    </h2>
    <p className="mt-2 text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
      {copy['settingsCore.panel.empty.description']}
    </p>
    <button
      type="button"
      onClick={resetTabConfiguration}
      className={classNames(
        'vc-focus-ring mt-5 inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium focus:outline-none',
        'bg-[var(--vc-ide-accent-action)] text-[var(--vc-ide-text-on-accent)]',
        'hover:brightness-110 active:brightness-95',
      )}
    >
      {copy['settingsCore.panel.empty.action']}
    </button>
  </div>
);

export const ControlPanel = ({ open, onClose, initialTab = null, asPage = false }: ControlPanelProps) => {
  // State
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);
  const [showTabManagement, setShowTabManagement] = useState(false);

  /*
   * Bumped to force a full remount of the lazy tab subtree, so a previously
   * rejected dynamic import() is retried after the user clicks "Retry".
   */
  const [tabReloadKey, setTabReloadKey] = useState(0);
  const { i18n } = useTranslation();
  const language = resolveSettingsCoreLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getSettingsCoreCopy(language);

  // Store values
  const tabConfiguration = useStore(tabConfigurationStore);

  // Status hooks
  const { hasNewFeatures, unviewedFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, unreadNotifications, markAllAsRead } = useNotifications();

  // Memoize the base tab configurations to avoid recalculation
  const baseTabConfig = useMemo(() => {
    return new Map(DEFAULT_TAB_CONFIG.map((tab) => [tab.id, tab]));
  }, []);

  /*
   * Detect a corrupt persisted tab configuration. The repair (a store write) must
   * not happen during render — `resetTabConfiguration()` calls
   * `tabConfigurationStore.set(...)`, the very store this component subscribes to,
   * which violates React's render purity (store-write-during-render). Do it in an
   * effect instead; the memo below just returns [] while the config is invalid.
   */
  const isTabConfigValid = Boolean(tabConfiguration?.userTabs && Array.isArray(tabConfiguration.userTabs));

  useEffect(() => {
    if (!isTabConfigValid) {
      console.warn('Invalid tab configuration, resetting to defaults');
      resetTabConfiguration();
    }
  }, [isTabConfigValid]);

  // Add visibleTabs logic using useMemo with optimized calculations
  const visibleTabs = useMemo(() => {
    if (!tabConfiguration?.userTabs || !Array.isArray(tabConfiguration.userTabs)) {
      return [];
    }

    // Optimize user mode tab filtering
    return tabConfiguration.userTabs
      .filter((tab) => {
        if (!tab?.id) {
          return false;
        }

        return tab.visible && tab.window === 'user';
      })
      .sort((a, b) => a.order - b.order);
  }, [tabConfiguration, baseTabConfig]);

  // Reset to default view when modal opens/closes
  useEffect(() => {
    if (!open) {
      // Reset when closing
      setActiveTab(null);
      setLoadingTab(null);
      setShowTabManagement(false);
    } else {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Handle closing
  const handleClose = () => {
    setActiveTab(null);
    setLoadingTab(null);
    setShowTabManagement(false);
    onClose();
  };

  // Handlers
  const handleBack = () => {
    if (showTabManagement) {
      setShowTabManagement(false);
    } else if (activeTab) {
      setActiveTab(null);
    }
  };

  // Force the lazy tab subtree to remount so a previously rejected chunk import is retried.
  const handleRetryTabLoad = useCallback(() => {
    setTabReloadKey((key) => key + 1);
  }, []);

  const getTabComponent = (tabId: TabType) => {
    let tab: ReactNode = null;

    switch (tabId) {
      case 'profile':
        tab = <ProfileTab />;
        break;
      case 'settings':
        tab = <SettingsTab />;
        break;
      case 'notifications':
        tab = <NotificationsTab />;
        break;
      case 'features':
        tab = <FeaturesTab />;
        break;
      case 'data':
        tab = <DataTab />;
        break;
      case 'cloud-providers':
        tab = <CloudProvidersTab />;
        break;
      case 'local-providers':
        tab = <LocalProvidersTab />;
        break;
      case 'github':
        tab = <GitHubTab />;
        break;
      case 'gitlab':
        tab = <GitLabTab />;
        break;
      case 'supabase':
        tab = <SupabaseTab />;
        break;
      case 'vercel':
        tab = <VercelTab />;
        break;
      case 'netlify':
        tab = <NetlifyTab />;
        break;
      case 'event-logs':
        tab = <EventLogsTab />;
        break;
      case 'mcp':
        tab = <McpTab />;
        break;
      case 'connections':
        tab = <ConnectionsTab />;
        break;
      case 'update':
        tab = <UpdateTab />;
        break;
      case 'debug':
        tab = <DebugTab />;
        break;
      case 'task-manager':
        tab = <TaskManagerTab />;
        break;
      case 'service-status':
        tab = <ServiceStatusTab />;
        break;

      default:
        return null;
    }

    return (
      <TabPanelBoundary
        key={getTabPanelBoundaryKey(tabId, tabReloadKey)}
        onRetry={handleRetryTabLoad}
        language={language}
      >
        <Suspense fallback={<SettingsTabLoading label={copy['settingsCore.panel.loading']} />}>{tab}</Suspense>
      </TabPanelBoundary>
    );
  };

  const tabStatusInputs = {
    hasNewFeatures,
    unviewedFeaturesCount: unviewedFeatures.length,
    hasUnreadNotifications,
    unreadNotificationsCount: unreadNotifications.length,
  };

  const handleTabClick = (tabId: TabType) => {
    setLoadingTab(tabId);
    setActiveTab(tabId);
    setShowTabManagement(false);

    // Acknowledge notifications based on tab
    switch (tabId) {
      case 'features':
        acknowledgeAllFeatures();
        break;
      case 'notifications':
        markAllAsRead();
        break;
    }

    // Clear loading state after a delay
    setTimeout(() => setLoadingTab(null), 500);
  };

  const localizedStatusMessage = (tabId: TabType) => {
    if (tabId === 'features') {
      return formatSettingsCoreStatusMessage(tabId, unviewedFeatures.length, language);
    }

    if (tabId === 'notifications') {
      return formatSettingsCoreStatusMessage(tabId, unreadNotifications.length, language);
    }

    return '';
  };

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <div className="modern-scrollbar fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-2 sm:p-4">
          <RadixDialog.Overlay className="absolute inset-0 bg-[var(--vc-ide-overlay)] backdrop-blur-sm transition-opacity duration-200" />

          <RadixDialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={handleClose}
            onPointerDownOutside={handleClose}
            className="relative z-[101]"
          >
            <div
              className={classNames(
                'h-[min(90dvh,calc(100dvh-24px))] w-[min(1200px,calc(100vw-24px))]',
                'bg-bolt-elements-background-depth-1',
                'rounded-2xl shadow-2xl',
                'border border-bolt-elements-borderColor',
                'flex flex-col overflow-hidden',
                'relative',
                'transform transition-all duration-200 ease-out',
                open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4',
              )}
            >
              <div className="absolute inset-0 overflow-hidden rounded-2xl">
                <BackgroundRays />
              </div>
              <div className="relative z-10 flex flex-col h-full">
                {/* Header */}
                <div className="flex min-h-14 items-center justify-between gap-2 border-b border-bolt-elements-borderColor px-2 py-2 sm:px-6 sm:py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
                    {(activeTab || showTabManagement) && (
                      <button
                        type="button"
                        onClick={handleBack}
                        aria-label={copy['settingsCore.panel.back']}
                        title={copy['settingsCore.panel.back']}
                        className="vc-focus-ring group flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-transparent transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] focus:outline-none"
                      >
                        <div
                          className="i-ph:arrow-left w-4 h-4 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors"
                          aria-hidden="true"
                        />
                      </button>
                    )}
                    <DialogTitle
                      asChild={asPage}
                      className="min-w-0 text-base font-semibold leading-tight text-bolt-elements-textPrimary [overflow-wrap:anywhere] sm:text-xl"
                    >
                      {asPage ? (
                        <h1>
                          {showTabManagement
                            ? copy['settingsCore.panel.tabManagement']
                            : activeTab
                              ? getSettingsCoreTabLabel(activeTab, language)
                              : copy['settingsCore.panel.title']}
                        </h1>
                      ) : (
                        <>
                          {showTabManagement
                            ? copy['settingsCore.panel.tabManagement']
                            : activeTab
                              ? getSettingsCoreTabLabel(activeTab, language)
                              : copy['settingsCore.panel.title']}
                        </>
                      )}
                    </DialogTitle>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 sm:gap-3">
                    {/* Avatar and Dropdown */}
                    <div>
                      <AvatarDropdown onSelectTab={handleTabClick} />
                    </div>

                    {/* Close Button */}
                    <button
                      type="button"
                      onClick={handleClose}
                      aria-label={copy['settingsCore.panel.close']}
                      title={copy['settingsCore.panel.close']}
                      className="vc-focus-ring group flex h-11 w-11 items-center justify-center rounded-full bg-transparent transition-all duration-200 hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] focus:outline-none"
                    >
                      <div
                        className="i-ph:x w-4 h-4 text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div
                  className={classNames(
                    'flex-1',
                    'overflow-y-auto',
                    'hover:overflow-y-auto',
                    'scrollbar scrollbar-w-2',
                    'scrollbar-track-transparent',
                    'scrollbar-thumb-[var(--vc-ide-border-visible)] hover:scrollbar-thumb-[var(--vc-ide-bg-hover)]',
                    'will-change-scroll',
                    'touch-auto',
                  )}
                >
                  <div
                    className={classNames(
                      'p-3 transition-opacity duration-150 sm:p-6',
                      activeTab || showTabManagement ? 'opacity-100' : 'opacity-100',
                    )}
                  >
                    {!isTabConfigValid ? (
                      <SettingsTabLoading label={copy['settingsCore.panel.repairing']} />
                    ) : activeTab ? (
                      getTabComponent(activeTab)
                    ) : visibleTabs.length === 0 ? (
                      <EmptySettingsTabs copy={copy} />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
                        {visibleTabs.map((tab, index) => (
                          <div
                            key={tab.id}
                            className={classNames(
                              'min-h-[180px] transition-transform duration-100 ease-out sm:aspect-[1.5/1]',
                              'hover:scale-[1.01]',
                            )}
                            style={{
                              animationDelay: `${index * 30}ms`,
                              animation: open ? 'fadeInUp 200ms ease-out forwards' : 'none',
                            }}
                          >
                            <TabTile
                              tab={tab}
                              label={getSettingsCoreTabLabel(tab.id, language)}
                              onClick={() => handleTabClick(tab.id as TabType)}
                              isActive={activeTab === tab.id}
                              hasUpdate={getTabUpdateStatus(tab.id as TabType, tabStatusInputs)}
                              statusMessage={localizedStatusMessage(tab.id as TabType)}
                              description={getSettingsCoreTabDescription(tab.id, language)}
                              isLoading={loadingTab === tab.id}
                              className="h-full relative"
                            >
                              {BETA_TABS.has(tab.id) && <BetaLabel label={copy['settingsCore.panel.beta']} />}
                            </TabTile>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
