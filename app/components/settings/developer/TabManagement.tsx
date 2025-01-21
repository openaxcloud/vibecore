import { motion } from 'framer-motion';
import { useState } from 'react';
import { classNames } from '~/utils/classNames';
import { tabConfigurationStore, updateTabConfiguration, resetTabConfiguration } from '~/lib/stores/settings';
import { useStore } from '@nanostores/react';
import { TAB_LABELS, type TabType, type TabVisibilityConfig } from '~/components/settings/settings.types';
import { toast } from 'react-toastify';

// Define icons for each tab type
const TAB_ICONS: Record<TabType, string> = {
  profile: 'i-ph:user-circle-fill',
  settings: 'i-ph:gear-six-fill',
  notifications: 'i-ph:bell-fill',
  features: 'i-ph:sparkle-fill',
  data: 'i-ph:database-fill',
  'cloud-providers': 'i-ph:cloud-fill',
  'local-providers': 'i-ph:desktop-fill',
  connection: 'i-ph:plug-fill',
  debug: 'i-ph:bug-fill',
  'event-logs': 'i-ph:list-bullets-fill',
  update: 'i-ph:arrow-clockwise-fill',
  'task-manager': 'i-ph:gauge-fill',
};

interface TabGroupProps {
  title: string;
  description?: string;
  tabs: TabVisibilityConfig[];
  onVisibilityChange: (tabId: TabType, enabled: boolean) => void;
  targetWindow: 'user' | 'developer';
  standardTabs: TabType[];
}

const TabGroup = ({ title, description, tabs, onVisibilityChange, targetWindow }: TabGroupProps) => {
  // Split tabs into visible and hidden
  const visibleTabs = tabs.filter((tab) => tab.visible).sort((a, b) => (a.order || 0) - (b.order || 0));
  const hiddenTabs = tabs.filter((tab) => !tab.visible).sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="mb-8 rounded-xl bg-white/5 p-6 backdrop-blur-sm dark:bg-gray-800/30">
      <div className="mb-6">
        <h3 className="flex items-center gap-2 text-lg font-medium text-gray-900 dark:text-white">
          <span className="i-ph:layout-fill h-5 w-5 text-purple-500" />
          {title}
        </h3>
        {description && <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{description}</p>}
      </div>

      <div className="space-y-6">
        <motion.div layout className="space-y-2">
          {visibleTabs.map((tab) => (
            <motion.div
              key={tab.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="group relative flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all hover:border-purple-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-purple-500/30"
            >
              <div className="flex items-center space-x-3">
                <div
                  className={classNames(
                    TAB_ICONS[tab.id],
                    'h-5 w-5 transition-colors',
                    tab.id === 'profile'
                      ? 'text-purple-500 dark:text-purple-400'
                      : 'text-gray-500 group-hover:text-purple-500 dark:text-gray-400 dark:group-hover:text-purple-400',
                  )}
                />
                <span
                  className={classNames(
                    'text-sm font-medium transition-colors',
                    tab.id === 'profile'
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white',
                  )}
                >
                  {TAB_LABELS[tab.id]}
                </span>
                {tab.id === 'profile' && targetWindow === 'user' && (
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
                    Standard
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-4">
                {targetWindow === 'user' ? (
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={tab.visible}
                      onChange={(e) => onVisibilityChange(tab.id, e.target.checked)}
                      className="peer sr-only"
                    />
                    <div
                      className={classNames(
                        'h-6 w-11 rounded-full bg-gray-200 transition-colors dark:bg-gray-700',
                        'after:absolute after:left-[2px] after:top-[2px]',
                        'after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm',
                        'after:transition-all after:content-[""]',
                        'peer-checked:bg-purple-500 peer-checked:after:translate-x-full',
                        'peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-500/20',
                      )}
                    />
                  </label>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400">Always visible</div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {hiddenTabs.length > 0 && (
          <motion.div layout className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
              <span className="i-ph:eye-slash-fill h-4 w-4" />
              Hidden Tabs
            </div>
            {hiddenTabs.map((tab) => (
              <motion.div
                key={tab.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="group relative flex items-center justify-between rounded-lg border border-gray-200 bg-white/50 px-4 py-3 transition-all hover:border-purple-200 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-purple-500/30"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={classNames(
                      TAB_ICONS[tab.id],
                      'h-5 w-5 transition-colors',
                      'text-gray-400 group-hover:text-purple-500 dark:text-gray-500 dark:group-hover:text-purple-400',
                    )}
                  />
                  <span className="text-sm font-medium text-gray-500 transition-colors group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-white">
                    {TAB_LABELS[tab.id]}
                  </span>
                </div>
                <div className="flex items-center space-x-4">
                  {targetWindow === 'user' && (
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={tab.visible}
                        onChange={(e) => onVisibilityChange(tab.id, e.target.checked)}
                        className="peer sr-only"
                      />
                      <div
                        className={classNames(
                          'h-6 w-11 rounded-full bg-gray-200 transition-colors dark:bg-gray-700',
                          'after:absolute after:left-[2px] after:top-[2px]',
                          'after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm',
                          'after:transition-all after:content-[""]',
                          'peer-checked:bg-purple-500 peer-checked:after:translate-x-full',
                          'peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-500/20',
                        )}
                      />
                    </label>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export const TabManagement = () => {
  const config = useStore(tabConfigurationStore);
  const [searchQuery, setSearchQuery] = useState('');

  // Define standard (visible by default) tabs for each window
  const standardUserTabs: TabType[] = ['features', 'data', 'local-providers', 'cloud-providers', 'connection', 'debug'];
  const standardDeveloperTabs: TabType[] = [
    'profile',
    'settings',
    'notifications',
    'features',
    'data',
    'local-providers',
    'cloud-providers',
    'connection',
    'debug',
    'event-logs',
    'update',
  ];

  const handleVisibilityChange = (tabId: TabType, enabled: boolean, targetWindow: 'user' | 'developer') => {
    const tabs = targetWindow === 'user' ? config.userTabs : config.developerTabs;
    const existingTab = tabs.find((tab) => tab.id === tabId);

    const updatedTab: TabVisibilityConfig = existingTab
      ? {
          ...existingTab,
          visible: enabled,
        }
      : {
          id: tabId,
          visible: enabled,
          window: targetWindow,
          order: tabs.length,
        };

    // Update the store
    updateTabConfiguration(updatedTab);

    // Show toast notification
    toast.success(`${TAB_LABELS[tabId]} ${enabled ? 'enabled' : 'disabled'} in ${targetWindow} window`);
  };

  const handleResetToDefaults = () => {
    resetTabConfiguration();
    toast.success('Tab settings reset to defaults');
  };

  // Filter tabs based on search and window
  const userTabs = (config.userTabs || []).filter(
    (tab) => tab && TAB_LABELS[tab.id]?.toLowerCase().includes((searchQuery || '').toLowerCase()),
  );

  const developerTabs = (config.developerTabs || []).filter(
    (tab) => tab && TAB_LABELS[tab.id]?.toLowerCase().includes((searchQuery || '').toLowerCase()),
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
              <span className="i-ph:squares-four-fill h-6 w-6 text-purple-500" />
              Tab Management
            </h2>
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
              Configure which tabs are visible in the user and developer windows
            </p>
          </div>
          <button
            onClick={handleResetToDefaults}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-100 focus:outline-none focus:ring-4 focus:ring-purple-500/20 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20"
          >
            <span className="i-ph:arrow-counter-clockwise-fill h-4 w-4" />
            Reset to Defaults
          </button>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <span className="i-ph:magnifying-glass h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tabs..."
              className="block w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-500 focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400 dark:focus:border-purple-400"
            />
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* User Window Section */}
        <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-1 dark:border-purple-500/10 dark:bg-purple-500/5">
          <div className="rounded-lg bg-white p-6 dark:bg-gray-800">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-500/10">
                <span className="i-ph:user-circle-fill h-5 w-5 text-purple-500 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-base font-medium text-gray-900 dark:text-white">User Window</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Configure tabs visible to regular users</p>
              </div>
            </div>
            <TabGroup
              title="User Interface"
              description="Manage which tabs are visible in the user window"
              tabs={userTabs}
              onVisibilityChange={(tabId, enabled) => handleVisibilityChange(tabId, enabled, 'user')}
              targetWindow="user"
              standardTabs={standardUserTabs}
            />
          </div>
        </div>

        {/* Developer Window Section */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-1 dark:border-blue-500/10 dark:bg-blue-500/5">
          <div className="rounded-lg bg-white p-6 dark:bg-gray-800">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-500/10">
                <span className="i-ph:code-fill h-5 w-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-medium text-gray-900 dark:text-white">Developer Window</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Configure tabs visible to developers</p>
              </div>
            </div>
            <TabGroup
              title="Developer Interface"
              description="Manage which tabs are visible in the developer window"
              tabs={developerTabs}
              onVisibilityChange={(tabId, enabled) => handleVisibilityChange(tabId, enabled, 'developer')}
              targetWindow="developer"
              standardTabs={standardDeveloperTabs}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
