import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { Switch } from '@radix-ui/react-switch';
import * as RadixDialog from '@radix-ui/react-dialog';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { classNames } from '~/utils/classNames';
import { TabManagement } from './developer/TabManagement';
import { TabTile } from './shared/TabTile';
import { useUpdateCheck } from '~/lib/hooks/useUpdateCheck';
import { useFeatures } from '~/lib/hooks/useFeatures';
import { useNotifications } from '~/lib/hooks/useNotifications';
import { useConnectionStatus } from '~/lib/hooks/useConnectionStatus';
import { useDebugStatus } from '~/lib/hooks/useDebugStatus';
import { tabConfigurationStore, developerModeStore, setDeveloperMode } from '~/lib/stores/settings';
import type { TabType, TabVisibilityConfig } from './settings.types';
import { TAB_LABELS, DEFAULT_TAB_CONFIG } from './settings.types';
import { resetTabConfiguration } from '~/lib/stores/settings';
import { DialogTitle } from '~/components/ui/Dialog';
import { useDrag, useDrop } from 'react-dnd';

// Import all tab components
import ProfileTab from './profile/ProfileTab';
import SettingsTab from './settings/SettingsTab';
import NotificationsTab from './notifications/NotificationsTab';
import FeaturesTab from './features/FeaturesTab';
import DataTab from './data/DataTab';
import DebugTab from './debug/DebugTab';
import { EventLogsTab } from './event-logs/EventLogsTab';
import UpdateTab from './update/UpdateTab';
import ConnectionsTab from './connections/ConnectionsTab';
import CloudProvidersTab from './providers/CloudProvidersTab';
import ServiceStatusTab from './providers/ServiceStatusTab';
import LocalProvidersTab from './providers/LocalProvidersTab';
import TaskManagerTab from './task-manager/TaskManagerTab';

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
};

// Add DraggableTabTile component before the ControlPanel component
const DraggableTabTile = ({
  tab,
  index,
  moveTab,
  ...props
}: {
  tab: TabWithDevType;
  index: number;
  moveTab: (dragIndex: number, hoverIndex: number) => void;
  onClick: () => void;
  isActive: boolean;
  hasUpdate: boolean;
  statusMessage: string;
  description: string;
  isLoading?: boolean;
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'tab',
    item: { index, id: tab.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: 'tab',
    hover: (item: { index: number; id: string }, monitor) => {
      if (!monitor.isOver({ shallow: true })) {
        return;
      }

      if (item.id === tab.id) {
        return;
      }

      if (item.index === index) {
        return;
      }

      // Only move when hovering over the middle section
      const hoverBoundingRect = monitor.getSourceClientOffset();
      const clientOffset = monitor.getClientOffset();

      if (!hoverBoundingRect || !clientOffset) {
        return;
      }

      const hoverMiddleX = hoverBoundingRect.x + 150; // Half of typical card width
      const hoverClientX = clientOffset.x;

      // Only perform the move when the mouse has crossed half of the items width
      if (item.index < index && hoverClientX < hoverMiddleX) {
        return;
      }

      if (item.index > index && hoverClientX > hoverMiddleX) {
        return;
      }

      moveTab(item.index, index);
      item.index = index;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });

  const dropIndicatorClasses = classNames('rounded-xl border-2 border-transparent transition-all duration-200', {
    'ring-2 ring-purple-500 ring-opacity-50 bg-purple-50 dark:bg-purple-900/20': isOver,
    'hover:ring-2 hover:ring-purple-500/30': canDrop && !isOver,
  });

  return (
    <motion.div
      ref={(node) => drag(drop(node))}
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: 'move',
        position: 'relative',
        zIndex: isDragging ? 100 : isOver ? 50 : 1,
      }}
      animate={{
        scale: isDragging ? 1.02 : isOver ? 1.05 : 1,
        boxShadow: isDragging
          ? '0 8px 24px rgba(0, 0, 0, 0.15)'
          : isOver
            ? '0 4px 12px rgba(147, 51, 234, 0.3)'
            : '0 0 0 rgba(0, 0, 0, 0)',
        borderColor: isOver ? 'rgb(147, 51, 234)' : isDragging ? 'rgba(147, 51, 234, 0.5)' : 'transparent',
        y: isOver ? -2 : 0,
      }}
      transition={{
        type: 'spring',
        stiffness: 500,
        damping: 30,
        mass: 0.8,
      }}
      className={dropIndicatorClasses}
    >
      <TabTile {...props} tab={tab} />
      {isOver && (
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-purple-500/20 rounded-xl" />
          <div className="absolute inset-0 border-2 border-purple-500/50 rounded-xl" />
        </motion.div>
      )}
    </motion.div>
  );
};

export const ControlPanel = ({ open, onClose }: ControlPanelProps) => {
  // State
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);
  const [showTabManagement, setShowTabManagement] = useState(false);
  const [profile, setProfile] = useState({ avatar: null, notifications: true });

  // Store values
  const tabConfiguration = useStore(tabConfigurationStore);
  const developerMode = useStore(developerModeStore);

  // Status hooks
  const { hasUpdate, currentVersion, acknowledgeUpdate } = useUpdateCheck();
  const { hasNewFeatures, unviewedFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, unreadNotifications, markAllAsRead } = useNotifications();
  const { hasConnectionIssues, currentIssue, acknowledgeIssue } = useConnectionStatus();
  const { hasActiveWarnings, activeIssues, acknowledgeAllIssues } = useDebugStatus();

  // Initialize profile from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const saved = localStorage.getItem('bolt_user_profile');

    if (saved) {
      try {
        const parsedProfile = JSON.parse(saved);
        setProfile(parsedProfile);
      } catch (error) {
        console.warn('Failed to parse profile from localStorage:', error);
      }
    }
  }, []);

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

      return devTabs.sort((a, b) => a.order - b.order);
    }

    // In user mode, only show visible user tabs
    return tabConfiguration.userTabs
      .filter((tab) => {
        if (!tab || typeof tab.id !== 'string') {
          console.warn('Invalid tab entry:', tab);
          return false;
        }

        // Hide notifications tab if notifications are disabled
        if (tab.id === 'notifications' && !profile.notifications) {
          return false;
        }

        // Only show tabs that are explicitly visible and assigned to the user window
        return tab.visible && tab.window === 'user';
      })
      .sort((a, b) => a.order - b.order);
  }, [tabConfiguration, profile.notifications, developerMode]);

  // Add moveTab handler
  const moveTab = (dragIndex: number, hoverIndex: number) => {
    const newTabs = [...visibleTabs];
    const dragTab = newTabs[dragIndex];
    newTabs.splice(dragIndex, 1);
    newTabs.splice(hoverIndex, 0, dragTab);

    // Update the order of the tabs
    const updatedTabs = newTabs.map((tab, index) => ({
      ...tab,
      order: index,
      window: 'developer' as const,
      visible: true,
    }));

    // Update the tab configuration store directly
    if (developerMode) {
      // In developer mode, update developerTabs while preserving configuration
      tabConfigurationStore.set({
        ...tabConfiguration,
        developerTabs: updatedTabs,
      });
    } else {
      // In user mode, update userTabs
      tabConfigurationStore.set({
        ...tabConfiguration,
        userTabs: updatedTabs.map((tab) => ({ ...tab, window: 'user' as const })),
      });
    }
  };

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
                      {showTabManagement ? 'Tab Management' : activeTab ? TAB_LABELS[activeTab] : 'Control Panel'}
                    </DialogTitle>
                  </div>

                  <div className="flex items-center space-x-4">
                    {/* Only show Manage Tabs button in developer mode */}
                    {!activeTab && !showTabManagement && developerMode && (
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

                    <div className="flex items-center gap-2">
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
                      <label
                        htmlFor="developer-mode"
                        className="text-sm text-gray-500 dark:text-gray-400 select-none cursor-pointer"
                      >
                        {developerMode ? 'Developer Mode' : 'User Mode'}
                      </label>
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
                      getTabComponent()
                    ) : (
                      <motion.div className="grid grid-cols-4 gap-4">
                        <AnimatePresence mode="popLayout">
                          {visibleTabs.map((tab: TabWithDevType, index: number) => (
                            <motion.div
                              key={tab.id}
                              layout
                              initial={{ opacity: 0, scale: 0.8, y: 20 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.8, y: -20 }}
                              transition={{
                                duration: 0.2,
                                delay: index * 0.05,
                              }}
                            >
                              <DraggableTabTile
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
    </DndProvider>
  );
};
