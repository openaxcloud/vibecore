import { useStore } from '@nanostores/react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { lazy, Suspense, useState, useEffect, useMemo, type ReactNode } from 'react';
import { AvatarDropdown } from './AvatarDropdown';
import { TAB_LABELS, DEFAULT_TAB_CONFIG, TAB_DESCRIPTIONS } from './constants';
import type { TabType } from './types';
import { TabTile } from '~/components/@settings/shared/components/TabTile';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { DialogTitle } from '~/components/ui/Dialog';
import { useConnectionStatus } from '~/lib/hooks/useConnectionStatus';
import { useFeatures } from '~/lib/hooks/useFeatures';
import { useNotifications } from '~/lib/hooks/useNotifications';
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
}

// Beta status for experimental features
const BETA_TABS = new Set<TabType>(['local-providers', 'mcp']);

const BetaLabel = () => (
  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-purple-500/10 dark:bg-purple-500/20">
    <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">BETA</span>
  </div>
);

export const ControlPanel = ({ open, onClose, initialTab = null }: ControlPanelProps) => {
  // State
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);
  const [showTabManagement, setShowTabManagement] = useState(false);

  // Store values
  const tabConfiguration = useStore(tabConfigurationStore);

  // Status hooks
  const { hasNewFeatures, unviewedFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, unreadNotifications, markAllAsRead } = useNotifications();
  const { hasConnectionIssues, currentIssue, acknowledgeIssue } = useConnectionStatus();

  // Memoize the base tab configurations to avoid recalculation
  const baseTabConfig = useMemo(() => {
    return new Map(DEFAULT_TAB_CONFIG.map((tab) => [tab.id, tab]));
  }, []);

  // Add visibleTabs logic using useMemo with optimized calculations
  const visibleTabs = useMemo(() => {
    if (!tabConfiguration?.userTabs || !Array.isArray(tabConfiguration.userTabs)) {
      console.warn('Invalid tab configuration, resetting to defaults');
      resetTabConfiguration();

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
      <Suspense fallback={<div className="p-6 text-sm text-bolt-elements-textSecondary">Loading settings...</div>}>
        {tab}
      </Suspense>
    );
  };

  const getTabUpdateStatus = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'features':
        return hasNewFeatures;
      case 'notifications':
        return hasUnreadNotifications;
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        return hasConnectionIssues;
      default:
        return false;
    }
  };

  const getStatusMessage = (tabId: TabType): string => {
    switch (tabId) {
      case 'features':
        return `${unviewedFeatures.length} new feature${unviewedFeatures.length === 1 ? '' : 's'} to explore`;
      case 'notifications':
        return `${unreadNotifications.length} unread notification${unreadNotifications.length === 1 ? '' : 's'}`;
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        return currentIssue === 'disconnected'
          ? 'Connection lost'
          : currentIssue === 'high-latency'
            ? 'High latency detected'
            : 'Connection issues detected';
      default:
        return '';
    }
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
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        acknowledgeIssue();
        break;
    }

    // Clear loading state after a delay
    setTimeout(() => setLoadingTab(null), 500);
  };

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-3 modern-scrollbar sm:p-4">
          <RadixDialog.Overlay className="absolute inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm transition-opacity duration-200" />

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
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-4">
                    {(activeTab || showTabManagement) && (
                      <button
                        onClick={handleBack}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-colors duration-150"
                      >
                        <div className="i-ph:arrow-left w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
                      </button>
                    )}
                    <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                      {showTabManagement ? 'Tab Management' : activeTab ? TAB_LABELS[activeTab] : 'Control Panel'}
                    </DialogTitle>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Avatar and Dropdown */}
                    <div className="pl-6">
                      <AvatarDropdown onSelectTab={handleTabClick} />
                    </div>

                    {/* Close Button */}
                    <button
                      onClick={handleClose}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-transparent hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-all duration-200"
                    >
                      <div className="i-ph:x w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
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
                    'scrollbar-thumb-[#E5E5E5] hover:scrollbar-thumb-[#CCCCCC]',
                    'dark:scrollbar-thumb-[#333333] dark:hover:scrollbar-thumb-[#444444]',
                    'will-change-scroll',
                    'touch-auto',
                  )}
                >
                  <div
                    className={classNames(
                      'p-6 transition-opacity duration-150',
                      activeTab || showTabManagement ? 'opacity-100' : 'opacity-100',
                    )}
                  >
                    {activeTab ? (
                      getTabComponent(activeTab)
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
                        {visibleTabs.map((tab, index) => (
                          <div
                            key={tab.id}
                            className={classNames(
                              'aspect-[1.5/1] transition-transform duration-100 ease-out',
                              'hover:scale-[1.01]',
                            )}
                            style={{
                              animationDelay: `${index * 30}ms`,
                              animation: open ? 'fadeInUp 200ms ease-out forwards' : 'none',
                            }}
                          >
                            <TabTile
                              tab={tab}
                              onClick={() => handleTabClick(tab.id as TabType)}
                              isActive={activeTab === tab.id}
                              hasUpdate={getTabUpdateStatus(tab.id)}
                              statusMessage={getStatusMessage(tab.id)}
                              description={TAB_DESCRIPTIONS[tab.id]}
                              isLoading={loadingTab === tab.id}
                              className="h-full relative"
                            >
                              {BETA_TABS.has(tab.id) && <BetaLabel />}
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
