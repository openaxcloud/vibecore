import * as RadixDialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';
import React, { useState, useEffect, useMemo } from 'react';
import { classNames } from '~/utils/classNames';
import { DialogTitle } from '~/components/ui/Dialog';
import { Switch } from '~/components/ui/Switch';
import type { TabType, TabVisibilityConfig } from '~/components/settings/settings.types';
import { TAB_LABELS } from '~/components/settings/settings.types';
import { DeveloperWindow } from '~/components/settings/developer/DeveloperWindow';
import { TabTile } from '~/components/settings/shared/TabTile';
import { useStore } from '@nanostores/react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ProfileTab from '~/components/settings/profile/ProfileTab';
import SettingsTab from '~/components/settings/settings/SettingsTab';
import NotificationsTab from '~/components/settings/notifications/NotificationsTab';
import FeaturesTab from '~/components/settings/features/FeaturesTab';
import DataTab from '~/components/settings/data/DataTab';
import DebugTab from '~/components/settings/debug/DebugTab';
import { EventLogsTab } from '~/components/settings/event-logs/EventLogsTab';
import UpdateTab from '~/components/settings/update/UpdateTab';
import ConnectionsTab from '~/components/settings/connections/ConnectionsTab';
import { useUpdateCheck } from '~/lib/hooks/useUpdateCheck';
import { useFeatures } from '~/lib/hooks/useFeatures';
import { useNotifications } from '~/lib/hooks/useNotifications';
import { useConnectionStatus } from '~/lib/hooks/useConnectionStatus';
import { useDebugStatus } from '~/lib/hooks/useDebugStatus';
import CloudProvidersTab from '~/components/settings/providers/CloudProvidersTab';
import LocalProvidersTab from '~/components/settings/providers/LocalProvidersTab';
import TaskManagerTab from '~/components/settings/task-manager/TaskManagerTab';
import {
  tabConfigurationStore,
  resetTabConfiguration,
  updateTabConfiguration,
  developerModeStore,
  setDeveloperMode,
} from '~/lib/stores/settings';

interface DraggableTabTileProps {
  tab: TabVisibilityConfig;
  index: number;
  moveTab: (dragIndex: number, hoverIndex: number) => void;
  onClick: () => void;
  isActive: boolean;
  hasUpdate: boolean;
  statusMessage: string;
  description: string;
  isLoading?: boolean;
}

const TAB_DESCRIPTIONS: Record<TabType, string> = {
  profile: 'Manage your profile and account settings',
  settings: 'Configure application preferences',
  notifications: 'View and manage your notifications',
  features: 'Explore new and upcoming features',
  data: 'Manage your data and storage',
  'cloud-providers': 'Configure cloud AI providers and models',
  'local-providers': 'Configure local AI providers and models',
  connection: 'Check connection status and settings',
  debug: 'Debug tools and system information',
  'event-logs': 'View system events and logs',
  update: 'Check for updates and release notes',
  'task-manager': 'Monitor system resources and processes',
};

const DraggableTabTile = ({
  tab,
  index,
  moveTab,
  onClick,
  isActive,
  hasUpdate,
  statusMessage,
  description,
  isLoading,
}: DraggableTabTileProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'tab',
    item: { index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'tab',
    hover: (item: { index: number }) => {
      if (item.index === index) {
        return;
      }

      moveTab(item.index, index);
      item.index = index;
    },
  });

  const dragDropRef = (node: HTMLDivElement | null) => {
    if (node) {
      drag(drop(node));
    }
  };

  return (
    <div ref={dragDropRef} style={{ opacity: isDragging ? 0.5 : 1 }}>
      <TabTile
        tab={tab}
        onClick={onClick}
        isActive={isActive}
        hasUpdate={hasUpdate}
        statusMessage={statusMessage}
        description={description}
        isLoading={isLoading}
      />
    </div>
  );
};

interface UsersWindowProps {
  open: boolean;
  onClose: () => void;
}

export const UsersWindow = ({ open, onClose }: UsersWindowProps) => {
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);
  const tabConfiguration = useStore(tabConfigurationStore);
  const developerMode = useStore(developerModeStore);
  const [showDeveloperWindow, setShowDeveloperWindow] = useState(false);
  const [profile, setProfile] = useState(() => {
    const saved = localStorage.getItem('bolt_user_profile');
    return saved ? JSON.parse(saved) : { avatar: null, notifications: true };
  });

  // Status hooks
  const { hasUpdate, currentVersion, acknowledgeUpdate } = useUpdateCheck();
  const { hasNewFeatures, unviewedFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, unreadNotifications, markAllAsRead } = useNotifications();
  const { hasConnectionIssues, currentIssue, acknowledgeIssue } = useConnectionStatus();
  const { hasActiveWarnings, activeIssues, acknowledgeAllIssues } = useDebugStatus();

  // Listen for profile changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'bolt_user_profile') {
        const newProfile = e.newValue ? JSON.parse(e.newValue) : { avatar: null, notifications: true };
        setProfile(newProfile);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Listen for settings toggle event
  useEffect(() => {
    const handleToggleSettings = () => {
      if (!open) {
        // Open settings panel
        setActiveTab('settings');
        onClose(); // Close any other open panels
      }
    };

    document.addEventListener('toggle-settings', handleToggleSettings);

    return () => document.removeEventListener('toggle-settings', handleToggleSettings);
  }, [open, onClose]);

  // Ensure tab configuration is properly initialized
  useEffect(() => {
    if (!tabConfiguration || !tabConfiguration.userTabs || !tabConfiguration.developerTabs) {
      console.warn('Tab configuration is invalid, resetting to defaults');
      resetTabConfiguration();
    } else {
      // Validate tab configuration structure
      const isValid =
        tabConfiguration.userTabs.every(
          (tab) =>
            tab &&
            typeof tab.id === 'string' &&
            typeof tab.visible === 'boolean' &&
            typeof tab.window === 'string' &&
            typeof tab.order === 'number',
        ) &&
        tabConfiguration.developerTabs.every(
          (tab) =>
            tab &&
            typeof tab.id === 'string' &&
            typeof tab.visible === 'boolean' &&
            typeof tab.window === 'string' &&
            typeof tab.order === 'number',
        );

      if (!isValid) {
        console.warn('Tab configuration is malformed, resetting to defaults');
        resetTabConfiguration();
      }
    }
  }, [tabConfiguration]);

  // Handle developer mode changes
  const handleDeveloperModeChange = (checked: boolean) => {
    setDeveloperMode(checked);

    if (checked) {
      setShowDeveloperWindow(true);
    }
  };

  // Handle developer window close
  const handleDeveloperWindowClose = () => {
    setShowDeveloperWindow(false);
    setDeveloperMode(false);
  };

  const handleBack = () => {
    setActiveTab(null);
  };

  // Only show tabs that are assigned to the user window AND are visible
  const visibleUserTabs = useMemo(() => {
    console.log('Filtering user tabs with configuration:', tabConfiguration);

    if (!tabConfiguration?.userTabs || !Array.isArray(tabConfiguration.userTabs)) {
      console.warn('Invalid tab configuration, using empty array');
      return [];
    }

    return tabConfiguration.userTabs
      .filter((tab) => {
        if (!tab || typeof tab.id !== 'string') {
          console.warn('Invalid tab entry:', tab);
          return false;
        }

        // Hide notifications tab if notifications are disabled
        if (tab.id === 'notifications' && !profile.notifications) {
          console.log('Hiding notifications tab due to disabled notifications');
          return false;
        }

        // Ensure the tab has the required properties
        if (typeof tab.visible !== 'boolean' || typeof tab.window !== 'string' || typeof tab.order !== 'number') {
          console.warn('Tab missing required properties:', tab);
          return false;
        }

        // Only show tabs that are explicitly visible and assigned to the user window
        const isVisible = tab.visible && tab.window === 'user';
        console.log(`Tab ${tab.id} visibility:`, isVisible);

        return isVisible;
      })
      .sort((a: TabVisibilityConfig, b: TabVisibilityConfig) => {
        const orderA = typeof a.order === 'number' ? a.order : 0;
        const orderB = typeof b.order === 'number' ? b.order : 0;

        return orderA - orderB;
      });
  }, [tabConfiguration, profile.notifications]);

  console.log('Filtered visible user tabs:', visibleUserTabs);

  const moveTab = (dragIndex: number, hoverIndex: number) => {
    const draggedTab = visibleUserTabs[dragIndex];
    const targetTab = visibleUserTabs[hoverIndex];

    console.log('Moving tab:', { draggedTab, targetTab });

    // Update the order of the dragged and target tabs
    const updatedDraggedTab = { ...draggedTab, order: targetTab.order };
    const updatedTargetTab = { ...targetTab, order: draggedTab.order };

    // Update both tabs in the store
    updateTabConfiguration(updatedDraggedTab);
    updateTabConfiguration(updatedTargetTab);
  };

  const handleTabClick = async (tabId: TabType) => {
    setLoadingTab(tabId);
    setActiveTab(tabId);

    // Acknowledge the status based on tab type
    switch (tabId) {
      case 'update':
        await acknowledgeUpdate();
        break;
      case 'features':
        await acknowledgeAllFeatures();
        break;
      case 'notifications':
        await markAllAsRead();
        break;
      case 'connection':
        acknowledgeIssue();
        break;
      case 'debug':
        await acknowledgeAllIssues();
        break;
    }

    // Simulate loading time (remove this in production)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setLoadingTab(null);
  };

  const getTabComponent = () => {
    switch (activeTab) {
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

  const renderHeader = () => (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center space-x-4">
        {activeTab ? (
          <button
            onClick={handleBack}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-all duration-200"
          >
            <div className="i-ph:arrow-left w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
          </button>
        ) : (
          <motion.div
            className="i-ph:lightning-fill w-5 h-5 text-purple-500"
            initial={{ rotate: -10 }}
            animate={{ rotate: 10 }}
            transition={{
              repeat: Infinity,
              repeatType: 'reverse',
              duration: 2,
              ease: 'easeInOut',
            }}
          />
        )}
        <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
          {activeTab ? TAB_LABELS[activeTab] : 'Bolt Control Panel'}
        </DialogTitle>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={developerMode}
            onCheckedChange={handleDeveloperModeChange}
            className="data-[state=checked]:bg-purple-500"
            aria-label="Toggle developer mode"
          />
          <label className="text-sm text-gray-500 dark:text-gray-400">Switch to Developer Mode</label>
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden hover:ring-2 ring-gray-300 dark:ring-gray-600 transition-all">
              {profile.avatar ? (
                <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-gray-500 dark:text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
              )}
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[220px] bg-white dark:bg-gray-800 rounded-lg shadow-lg py-1 z-50 animate-in fade-in-0 zoom-in-95"
              sideOffset={5}
              align="end"
            >
              <DropdownMenu.Item
                className="group flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 cursor-pointer transition-colors"
                onSelect={() => handleTabClick('profile')}
              >
                <div className="mr-3 flex h-5 w-5 items-center justify-center">
                  <div className="i-ph:user-circle w-[18px] h-[18px] text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
                </div>
                <span className="group-hover:text-purple-500 transition-colors">Profile</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="group flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 cursor-pointer transition-colors"
                onSelect={() => handleTabClick('settings')}
              >
                <div className="mr-3 flex h-5 w-5 items-center justify-center">
                  <div className="i-ph:gear w-[18px] h-[18px] text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
                </div>
                <span className="group-hover:text-purple-500 transition-colors">Settings</span>
              </DropdownMenu.Item>

              {profile.notifications && (
                <>
                  <DropdownMenu.Item
                    className="group flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 cursor-pointer transition-colors"
                    onSelect={() => handleTabClick('notifications')}
                  >
                    <div className="mr-3 flex h-5 w-5 items-center justify-center">
                      <div className="i-ph:bell w-[18px] h-[18px] text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
                    </div>
                    <span className="group-hover:text-purple-500 transition-colors">
                      Notifications
                      {hasUnreadNotifications && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-500 text-white rounded-full">
                          {unreadNotifications.length}
                        </span>
                      )}
                    </span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                </>
              )}

              <DropdownMenu.Item
                className="group flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 cursor-pointer transition-colors"
                onSelect={onClose}
              >
                <div className="mr-3 flex h-5 w-5 items-center justify-center">
                  <div className="i-ph:sign-out w-[18px] h-[18px] text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
                </div>
                <span className="group-hover:text-purple-500 transition-colors">Close</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          onClick={onClose}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-all duration-200"
        >
          <div className="i-ph:x w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
        </button>
      </div>
    </div>
  );

  // Trap focus when window is open
  useEffect(() => {
    if (open) {
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  return (
    <>
      <DeveloperWindow open={showDeveloperWindow} onClose={handleDeveloperWindowClose} />
      <DndProvider backend={HTML5Backend}>
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
                    'relative',
                    'w-[1200px] h-[90vh]',
                    'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
                    'rounded-2xl shadow-2xl',
                    'border border-[#E5E5E5] dark:border-[#1A1A1A]',
                    'flex flex-col overflow-hidden',
                    'z-[51]',
                  )}
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Header */}
                  {renderHeader()}

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
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6"
                    >
                      {activeTab ? (
                        getTabComponent()
                      ) : (
                        <div className="grid grid-cols-4 gap-4">
                          {visibleUserTabs.map((tab: TabVisibilityConfig, index: number) => (
                            <DraggableTabTile
                              key={tab.id}
                              tab={tab}
                              index={index}
                              moveTab={moveTab}
                              onClick={() => handleTabClick(tab.id)}
                              isActive={activeTab === tab.id}
                              hasUpdate={getTabUpdateStatus(tab.id)}
                              statusMessage={getStatusMessage(tab.id)}
                              description={TAB_DESCRIPTIONS[tab.id]}
                              isLoading={loadingTab === tab.id}
                            />
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </div>
                </motion.div>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      </DndProvider>
    </>
  );
};
