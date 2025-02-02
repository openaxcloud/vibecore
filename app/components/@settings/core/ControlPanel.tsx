import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { Switch } from '@radix-ui/react-switch';
import * as RadixDialog from '@radix-ui/react-dialog';
import { classNames } from '~/utils/classNames';
import { TabManagement } from '~/components/@settings/shared/components/TabManagement';
import { TabTile } from '~/components/@settings/shared/components/TabTile';
import { useUpdateCheck } from '~/lib/hooks/useUpdateCheck';
import { useFeatures } from '~/lib/hooks/useFeatures';
import { useNotifications } from '~/lib/hooks/useNotifications';
import { useConnectionStatus } from '~/lib/hooks/useConnectionStatus';
import { useDebugStatus } from '~/lib/hooks/useDebugStatus';
import { tabConfigurationStore, developerModeStore, setDeveloperMode } from '~/lib/stores/settings';
import { profileStore } from '~/lib/stores/profile';
import type { TabType, TabVisibilityConfig, DevTabConfig, Profile } from './types';
import { TAB_LABELS, DEFAULT_TAB_CONFIG } from './constants';
import { resetTabConfiguration } from '~/lib/stores/settings';
import { DialogTitle } from '~/components/ui/Dialog';
import { AvatarDropdown } from './AvatarDropdown';

// Import all tab components
import ProfileTab from '~/components/@settings/tabs/profile/ProfileTab';
import SettingsTab from '~/components/@settings/tabs/settings/SettingsTab';
import NotificationsTab from '~/components/@settings/tabs/notifications/NotificationsTab';
import FeaturesTab from '~/components/@settings/tabs/features/FeaturesTab';
import DataTab from '~/components/@settings/tabs/data/DataTab';
import DebugTab from '~/components/@settings/tabs/debug/DebugTab';
import { EventLogsTab } from '~/components/@settings/tabs/event-logs/EventLogsTab';
import UpdateTab from '~/components/@settings/tabs/update/UpdateTab';
import ConnectionsTab from '~/components/@settings/tabs/connections/ConnectionsTab';
import CloudProvidersTab from '~/components/@settings/tabs/providers/cloud/CloudProvidersTab';
import ServiceStatusTab from '~/components/@settings/tabs/providers/status/ServiceStatusTab';
import LocalProvidersTab from '~/components/@settings/tabs/providers/local/LocalProvidersTab';
import TaskManagerTab from '~/components/@settings/tabs/task-manager/TaskManagerTab';

interface ControlPanelProps {
  open: boolean;
  onClose: () => void;
}

interface TabWithDevType extends TabVisibilityConfig {
  isExtraDevTab?: boolean;
}

const TAB_DESCRIPTIONS: Record<TabType, string> = {
  profile: 'Manage your profile and account settings',
  settings: 'Configure application preferences',
  notifications: 'View and manage your notifications',
  features: 'Explore new and upcoming features',
  data: 'Manage your data and storage',
  'cloud-providers': 'Configure cloud AI providers and models',
  'local-providers': 'Configure local AI providers and models',
  'service-status': 'Monitor cloud LLM service status',
  connection: 'Check connection status and settings',
  debug: 'Debug tools and system information',
  'event-logs': 'View system events and logs',
  update: 'Check for updates and release notes',
  'task-manager': 'Monitor system resources and processes',
  'tab-management': 'Configure visible tabs and their order',
};

export const ControlPanel = ({ open, onClose }: ControlPanelProps) => {
  // State
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);
  const [showTabManagement, setShowTabManagement] = useState(false);

  // Store values
  const tabConfiguration = useStore(tabConfigurationStore);
  const developerMode = useStore(developerModeStore);
  const profile = useStore(profileStore) as Profile;

  // Status hooks
  const { hasUpdate, currentVersion, acknowledgeUpdate } = useUpdateCheck();
  const { hasNewFeatures, unviewedFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, unreadNotifications, markAllAsRead } = useNotifications();
  const { hasConnectionIssues, currentIssue, acknowledgeIssue } = useConnectionStatus();
  const { hasActiveWarnings, activeIssues, acknowledgeAllIssues } = useDebugStatus();

  // Add visibleTabs logic using useMemo
  const visibleTabs = useMemo(() => {
    if (!tabConfiguration?.userTabs || !Array.isArray(tabConfiguration.userTabs)) {
      console.warn('Invalid tab configuration, resetting to defaults');
      resetTabConfiguration();

      return [];
    }

    // In developer mode, show ALL tabs without restrictions
    if (developerMode) {
      // Combine all unique tabs from both user and developer configurations
      const allTabs = new Set([
        ...DEFAULT_TAB_CONFIG.map((tab) => tab.id),
        ...tabConfiguration.userTabs.map((tab) => tab.id),
        ...(tabConfiguration.developerTabs || []).map((tab) => tab.id),
      ]);

      // Create a complete tab list with all tabs visible
      const devTabs = Array.from(allTabs).map((tabId) => {
        // Try to find existing configuration for this tab
        const existingTab =
          tabConfiguration.developerTabs?.find((t) => t.id === tabId) ||
          tabConfiguration.userTabs?.find((t) => t.id === tabId) ||
          DEFAULT_TAB_CONFIG.find((t) => t.id === tabId);

        return {
          id: tabId,
          visible: true,
          window: 'developer' as const,
          order: existingTab?.order || DEFAULT_TAB_CONFIG.findIndex((t) => t.id === tabId),
        };
      });

      // Add Tab Management tile for developer mode
      const tabManagementConfig: DevTabConfig = {
        id: 'tab-management',
        visible: true,
        window: 'developer',
        order: devTabs.length,
        isExtraDevTab: true,
      };
      devTabs.push(tabManagementConfig);

      return devTabs.sort((a, b) => a.order - b.order);
    }

    // In user mode, only show visible user tabs
    const notificationsDisabled = profile?.preferences?.notifications === false;

    return tabConfiguration.userTabs
      .filter((tab) => {
        if (!tab || typeof tab.id !== 'string') {
          console.warn('Invalid tab entry:', tab);
          return false;
        }

        // Hide notifications tab if notifications are disabled in user preferences
        if (tab.id === 'notifications' && notificationsDisabled) {
          return false;
        }

        // Only show tabs that are explicitly visible and assigned to the user window
        return tab.visible && tab.window === 'user';
      })
      .sort((a, b) => a.order - b.order);
  }, [tabConfiguration, developerMode, profile?.preferences?.notifications]);

  // Handlers
  const handleBack = () => {
    if (showTabManagement) {
      setShowTabManagement(false);
    } else if (activeTab) {
      setActiveTab(null);
    }
  };

  const handleDeveloperModeChange = (checked: boolean) => {
    console.log('Developer mode changed:', checked);
    setDeveloperMode(checked);
  };

  // Add effect to log developer mode changes
  useEffect(() => {
    console.log('Current developer mode:', developerMode);
  }, [developerMode]);

  const getTabComponent = (tabId: TabType | 'tab-management') => {
    if (tabId === 'tab-management') {
      return <TabManagement />;
    }

    switch (tabId) {
      case 'profile':
        return <ProfileTab />;
      case 'settings':
        return <SettingsTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'features':
        return <FeaturesTab />;
      case 'data':
        return <DataTab />;
      case 'cloud-providers':
        return <CloudProvidersTab />;
      case 'local-providers':
        return <LocalProvidersTab />;
      case 'connection':
        return <ConnectionsTab />;
      case 'debug':
        return <DebugTab />;
      case 'event-logs':
        return <EventLogsTab />;
      case 'update':
        return <UpdateTab />;
      case 'task-manager':
        return <TaskManagerTab />;
      case 'service-status':
        return <ServiceStatusTab />;
      default:
        return null;
    }
  };

  const getTabUpdateStatus = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'update':
        return hasUpdate;
      case 'features':
        return hasNewFeatures;
      case 'notifications':
        return hasUnreadNotifications;
      case 'connection':
        return hasConnectionIssues;
      case 'debug':
        return hasActiveWarnings;
      default:
        return false;
    }
  };

  const getStatusMessage = (tabId: TabType): string => {
    switch (tabId) {
      case 'update':
        return `New update available (v${currentVersion})`;
      case 'features':
        return `${unviewedFeatures.length} new feature${unviewedFeatures.length === 1 ? '' : 's'} to explore`;
      case 'notifications':
        return `${unreadNotifications.length} unread notification${unreadNotifications.length === 1 ? '' : 's'}`;
      case 'connection':
        return currentIssue === 'disconnected'
          ? 'Connection lost'
          : currentIssue === 'high-latency'
            ? 'High latency detected'
            : 'Connection issues detected';
      case 'debug': {
        const warnings = activeIssues.filter((i) => i.type === 'warning').length;
        const errors = activeIssues.filter((i) => i.type === 'error').length;

        return `${warnings} warning${warnings === 1 ? '' : 's'}, ${errors} error${errors === 1 ? '' : 's'}`;
      }
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
      case 'update':
        acknowledgeUpdate();
        break;
      case 'features':
        acknowledgeAllFeatures();
        break;
      case 'notifications':
        markAllAsRead();
        break;
      case 'connection':
        acknowledgeIssue();
        break;
      case 'debug':
        acknowledgeAllIssues();
        break;
    }

    // Clear loading state after a delay
    setTimeout(() => setLoadingTab(null), 500);
  };

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <RadixDialog.Overlay asChild>
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          </RadixDialog.Overlay>

          <RadixDialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={onClose}
            onPointerDownOutside={onClose}
            className="relative z-[101]"
          >
            <motion.div
              className={classNames(
                'w-[1200px] h-[90vh]',
                'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
                'rounded-2xl shadow-2xl',
                'border border-[#E5E5E5] dark:border-[#1A1A1A]',
                'flex flex-col overflow-hidden',
              )}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-4">
                  {activeTab || showTabManagement ? (
                    <button
                      onClick={handleBack}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-all duration-200"
                    >
                      <div className="i-ph:arrow-left w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
                    </button>
                  ) : (
                    <motion.div
                      className="w-7 h-7"
                      initial={{ rotate: -5 }}
                      animate={{ rotate: 5 }}
                      transition={{
                        repeat: Infinity,
                        repeatType: 'reverse',
                        duration: 2,
                        ease: 'easeInOut',
                      }}
                    >
                      <div className="w-full h-full flex items-center justify-center bg-gray-100/50 dark:bg-gray-800/50 rounded-full">
                        <div className="i-ph:robot-fill w-5 h-5 text-gray-400 dark:text-gray-400 transition-colors" />
                      </div>
                    </motion.div>
                  )}
                  <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                    {showTabManagement ? 'Tab Management' : activeTab ? TAB_LABELS[activeTab] : 'Control Panel'}
                  </DialogTitle>
                </div>

                <div className="flex items-center gap-6">
                  {/* Developer Mode Controls */}
                  <div className="flex items-center gap-6">
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-2 min-w-[140px] border-r border-gray-200 dark:border-gray-800 pr-6">
                      <Switch
                        id="developer-mode"
                        checked={developerMode}
                        onCheckedChange={handleDeveloperModeChange}
                        className={classNames(
                          'relative inline-flex h-6 w-11 items-center rounded-full',
                          'bg-gray-200 dark:bg-gray-700',
                          'data-[state=checked]:bg-purple-500',
                          'transition-colors duration-200',
                        )}
                      >
                        <span className="sr-only">Toggle developer mode</span>
                        <span
                          className={classNames(
                            'inline-block h-4 w-4 transform rounded-full bg-white',
                            'transition duration-200',
                            'translate-x-1 data-[state=checked]:translate-x-6',
                          )}
                        />
                      </Switch>
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor="developer-mode"
                          className="text-sm text-gray-500 dark:text-gray-400 select-none cursor-pointer whitespace-nowrap w-[88px]"
                        >
                          {developerMode ? 'Developer Mode' : 'User Mode'}
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Avatar and Dropdown */}
                  <div className="border-l border-gray-200 dark:border-gray-800 pl-6">
                    <AvatarDropdown onSelectTab={handleTabClick} />
                  </div>

                  {/* Close Button */}
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-all duration-200"
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
                <motion.div
                  key={activeTab || 'home'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="p-6"
                >
                  {showTabManagement ? (
                    <TabManagement />
                  ) : activeTab ? (
                    getTabComponent(activeTab)
                  ) : (
                    <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
                      <AnimatePresence mode="popLayout">
                        {(visibleTabs as TabWithDevType[]).map((tab: TabWithDevType) => (
                          <motion.div
                            key={tab.id}
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{
                              type: 'spring',
                              stiffness: 400,
                              damping: 30,
                              mass: 0.8,
                              duration: 0.3,
                            }}
                            className="aspect-[1.5/1]"
                          >
                            <TabTile
                              tab={tab}
                              onClick={() => handleTabClick(tab.id as TabType)}
                              isActive={activeTab === tab.id}
                              hasUpdate={getTabUpdateStatus(tab.id)}
                              statusMessage={getStatusMessage(tab.id)}
                              description={TAB_DESCRIPTIONS[tab.id]}
                              isLoading={loadingTab === tab.id}
                              className="h-full"
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </motion.div>
              </div>
            </motion.div>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
