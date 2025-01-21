import * as RadixDialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { TabManagement } from './TabManagement';
import { TabTile } from '~/components/settings/shared/TabTile';
import { DialogTitle } from '~/components/ui/Dialog';
import type { TabType, TabVisibilityConfig } from '~/components/settings/settings.types';
import { tabConfigurationStore, updateTabConfiguration } from '~/lib/stores/settings';
import { useStore } from '@nanostores/react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import DebugTab from '~/components/settings/debug/DebugTab';
import { EventLogsTab } from '~/components/settings/event-logs/EventLogsTab';
import UpdateTab from '~/components/settings/update/UpdateTab';
import { ProvidersTab } from '~/components/settings/providers/ProvidersTab';
import DataTab from '~/components/settings/data/DataTab';
import FeaturesTab from '~/components/settings/features/FeaturesTab';
import NotificationsTab from '~/components/settings/notifications/NotificationsTab';
import SettingsTab from '~/components/settings/settings/SettingsTab';
import ProfileTab from '~/components/settings/profile/ProfileTab';
import ConnectionsTab from '~/components/settings/connections/ConnectionsTab';
import { useUpdateCheck, useFeatures, useNotifications, useConnectionStatus, useDebugStatus } from '~/lib/hooks';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

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
  providers: 'Configure AI providers and models',
  connection: 'Check connection status and settings',
  debug: 'Debug tools and system information',
  'event-logs': 'View system events and logs',
  update: 'Check for updates and release notes',
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

  return (
    <div ref={(node) => drag(drop(node))} style={{ opacity: isDragging ? 0.5 : 1 }}>
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

interface DeveloperWindowProps {
  open: boolean;
  onClose: () => void;
}

export const DeveloperWindow = ({ open, onClose }: DeveloperWindowProps) => {
  const tabConfiguration = useStore(tabConfigurationStore);
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [showTabManagement, setShowTabManagement] = useState(false);
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);
  const [profile, setProfile] = useState(() => {
    const saved = localStorage.getItem('bolt_user_profile');
    return saved ? JSON.parse(saved) : { avatar: null, notifications: true };
  });

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

  // Status hooks
  const { hasUpdate, currentVersion, acknowledgeUpdate } = useUpdateCheck();
  const { hasNewFeatures, unviewedFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, unreadNotifications, markAllAsRead } = useNotifications();
  const { hasConnectionIssues, currentIssue, acknowledgeIssue } = useConnectionStatus();
  const { hasActiveWarnings, activeIssues, acknowledgeAllIssues } = useDebugStatus();

  const handleBack = () => {
    if (showTabManagement) {
      setShowTabManagement(false);
    } else if (activeTab) {
      setActiveTab(null);
    }
  };

  // Only show tabs that are assigned to the developer window AND are visible
  const visibleDeveloperTabs = tabConfiguration.developerTabs
    .filter((tab) => {
      // Hide notifications tab if notifications are disabled
      if (tab.id === 'notifications' && !profile.notifications) {
        return false;
      }

      return tab.visible;
    })
    .sort((a: TabVisibilityConfig, b: TabVisibilityConfig) => (a.order || 0) - (b.order || 0));

  const moveTab = (dragIndex: number, hoverIndex: number) => {
    const draggedTab = visibleDeveloperTabs[dragIndex];
    const targetTab = visibleDeveloperTabs[hoverIndex];

    // Update the order of the dragged and target tabs
    const updatedDraggedTab = { ...draggedTab, order: targetTab.order };
    const updatedTargetTab = { ...targetTab, order: draggedTab.order };

    // Update both tabs in the store
    updateTabConfiguration(updatedDraggedTab);
    updateTabConfiguration(updatedTargetTab);
  };

  const handleTabClick = (tabId: TabType) => {
    // Don't allow clicking notifications tab if disabled
    if (tabId === 'notifications' && !profile.notifications) {
      return;
    }

    setLoadingTab(tabId);
    setActiveTab(tabId);

    // Acknowledge the status based on tab type
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

    // Clear loading state after a short delay
    setTimeout(() => {
      setLoadingTab(null);
    }, 500);
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
      case 'providers':
        return <ProvidersTab />;
      case 'connection':
        return <ConnectionsTab />;
      case 'debug':
        return <DebugTab />;
      case 'event-logs':
        return <EventLogsTab />;
      case 'update':
        return <UpdateTab />;
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

  return (
    <DndProvider backend={HTML5Backend}>
      <RadixDialog.Root open={open}>
        <RadixDialog.Portal>
          <div className="fixed inset-0 flex items-center justify-center z-[60]">
            <RadixDialog.Overlay className="fixed inset-0">
              <motion.div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </RadixDialog.Overlay>

            <RadixDialog.Content aria-describedby={undefined} className="relative z-[61]">
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
                      {showTabManagement ? 'Tab Management' : activeTab ? 'Developer Tools' : 'Developer Settings'}
                    </DialogTitle>
                  </div>

                  <div className="flex items-center space-x-4">
                    {!activeTab && !showTabManagement && (
                      <motion.button
                        onClick={() => setShowTabManagement(true)}
                        className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-all duration-200"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <div className="i-ph:sliders-horizontal w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
                        <span className="text-sm text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors">
                          Manage Tabs
                        </span>
                      </motion.button>
                    )}

                    <div className="relative">
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
                            className="min-w-[220px] bg-white dark:bg-gray-800 rounded-lg shadow-lg py-1 z-[200]"
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
                    </div>

                    <button
                      onClick={onClose}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 group transition-all duration-200"
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
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6">
                    {showTabManagement ? (
                      <TabManagement />
                    ) : activeTab ? (
                      getTabComponent()
                    ) : (
                      <div className="grid grid-cols-4 gap-4">
                        {visibleDeveloperTabs.map((tab: TabVisibilityConfig, index: number) => (
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
  );
};
