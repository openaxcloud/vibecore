import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { classNames } from '~/utils/classNames';
import { tabConfigurationStore, resetTabConfiguration } from '~/lib/stores/settings';
import {
  TAB_LABELS,
  DEFAULT_TAB_CONFIG,
  type TabType,
  type TabVisibilityConfig,
} from '~/components/settings/settings.types';
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
  'task-manager': 'i-ph:activity-fill',
  'service-status': 'i-ph:heartbeat-fill',
};

interface DraggableTabProps {
  tab: TabVisibilityConfig;
  index: number;
  moveTab: (dragIndex: number, hoverIndex: number) => void;
  onVisibilityChange: (enabled: boolean) => void;
}

const DraggableTab = ({ tab, index, moveTab, onVisibilityChange }: DraggableTabProps) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'tab-management',
    item: { index, id: tab.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: 'tab-management',
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

      moveTab(item.index, index);
      item.index = index;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  });

  return (
    <motion.div
      ref={(node) => drag(drop(node))}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: 'move',
      }}
      className={classNames(
        'group relative flex items-center justify-between rounded-lg border px-4 py-3 transition-all',
        isOver
          ? 'border-purple-500 bg-purple-50/50 dark:border-purple-500/50 dark:bg-purple-500/10'
          : 'border-gray-200 bg-white hover:border-purple-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-purple-500/30',
      )}
    >
      <div className="flex items-center space-x-3">
        <div className={classNames(TAB_ICONS[tab.id], 'h-5 w-5 text-purple-500 dark:text-purple-400')} />
        <span className="text-sm font-medium text-gray-900 dark:text-white">{TAB_LABELS[tab.id]}</span>
      </div>
      <div className="flex items-center space-x-4">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={tab.visible}
            onChange={(e) => onVisibilityChange(e.target.checked)}
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
      </div>
    </motion.div>
  );
};

export const TabManagement = () => {
  const config = useStore(tabConfigurationStore);
  const [searchQuery, setSearchQuery] = useState('');

  // Get ALL possible tabs for developer mode
  const allTabs = useMemo(() => {
    const uniqueTabs = new Set([
      ...DEFAULT_TAB_CONFIG.map((tab) => tab.id),
      ...(config.userTabs || []).map((tab) => tab.id),
      ...(config.developerTabs || []).map((tab) => tab.id),
      'event-logs', // Ensure these are always included
      'task-manager',
    ]);

    return Array.from(uniqueTabs).map((tabId) => {
      const existingTab =
        config.developerTabs?.find((t) => t.id === tabId) ||
        config.userTabs?.find((t) => t.id === tabId) ||
        DEFAULT_TAB_CONFIG.find((t) => t.id === tabId);

      return {
        id: tabId as TabType,
        visible: true,
        window: 'developer' as const,
        order: existingTab?.order || DEFAULT_TAB_CONFIG.findIndex((t) => t.id === tabId),
      };
    });
  }, [config]);

  const handleVisibilityChange = (tabId: TabType, enabled: boolean) => {
    const updatedDevTabs = allTabs.map((tab) => {
      if (tab.id === tabId) {
        return { ...tab, visible: enabled };
      }

      return tab;
    });

    tabConfigurationStore.set({
      ...config,
      developerTabs: updatedDevTabs,
    });

    toast.success(`${TAB_LABELS[tabId]} ${enabled ? 'enabled' : 'disabled'}`);
  };

  const moveTab = (dragIndex: number, hoverIndex: number) => {
    const newTabs = [...allTabs];
    const dragTab = newTabs[dragIndex];

    newTabs.splice(dragIndex, 1);
    newTabs.splice(hoverIndex, 0, dragTab);

    const updatedTabs = newTabs.map((tab, index) => ({
      ...tab,
      order: index,
    }));

    tabConfigurationStore.set({
      ...config,
      developerTabs: updatedTabs,
    });
  };

  const handleResetToDefaults = () => {
    resetTabConfiguration();
    toast.success('Tab settings reset to defaults');
  };

  const filteredTabs = allTabs
    .filter((tab) => tab && TAB_LABELS[tab.id]?.toLowerCase().includes((searchQuery || '').toLowerCase()))
    .sort((a, b) => a.order - b.order);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
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
          <button
            onClick={handleResetToDefaults}
            className="ml-4 inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-100 focus:outline-none focus:ring-4 focus:ring-purple-500/20 dark:bg-purple-500/10 dark:text-purple-400 dark:hover:bg-purple-500/20"
          >
            <span className="i-ph:arrow-counter-clockwise-fill h-4 w-4" />
            Reset to Defaults
          </button>
        </div>

        <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-6 dark:border-purple-500/10 dark:bg-purple-500/5">
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {filteredTabs.map((tab, index) => (
                <DraggableTab
                  key={tab.id}
                  tab={tab}
                  index={index}
                  moveTab={moveTab}
                  onVisibilityChange={(enabled) => handleVisibilityChange(tab.id, enabled)}
                />
              ))}
            </div>
          </AnimatePresence>
        </div>
      </div>
    </DndProvider>
  );
};
