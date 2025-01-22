import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '~/components/ui/Switch';
import { logStore, type LogEntry } from '~/lib/stores/logs';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';

interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}

const logLevelOptions: SelectOption[] = [
  {
    value: 'all',
    label: 'All Levels',
    icon: 'i-ph:funnel',
    color: '#9333ea',
  },
  {
    value: 'info',
    label: 'Info',
    icon: 'i-ph:info',
    color: '#3b82f6',
  },
  {
    value: 'warning',
    label: 'Warning',
    icon: 'i-ph:warning',
    color: '#f59e0b',
  },
  {
    value: 'error',
    label: 'Error',
    icon: 'i-ph:x-circle',
    color: '#ef4444',
  },
  {
    value: 'debug',
    label: 'Debug',
    icon: 'i-ph:bug',
    color: '#6b7280',
  },
];

const logCategoryOptions: SelectOption[] = [
  {
    value: 'all',
    label: 'All Categories',
    icon: 'i-ph:squares-four',
    color: '#9333ea',
  },
  {
    value: 'api',
    label: 'API',
    icon: 'i-ph:cloud',
    color: '#3b82f6',
  },
  {
    value: 'auth',
    label: 'Auth',
    icon: 'i-ph:key',
    color: '#f59e0b',
  },
  {
    value: 'database',
    label: 'Database',
    icon: 'i-ph:database',
    color: '#10b981',
  },
  {
    value: 'network',
    label: 'Network',
    icon: 'i-ph:wifi-high',
    color: '#6366f1',
  },
  {
    value: 'performance',
    label: 'Performance',
    icon: 'i-ph:chart-line-up',
    color: '#8b5cf6',
  },
];

interface LogEntryItemProps {
  log: LogEntry;
  isExpanded: boolean;
  use24Hour: boolean;
  showTimestamp: boolean;
}

const LogEntryItem = ({ log, isExpanded: forceExpanded, use24Hour, showTimestamp }: LogEntryItemProps) => {
  const [localExpanded, setLocalExpanded] = useState(forceExpanded);

  // Update local expanded state when forceExpanded changes
  useEffect(() => {
    setLocalExpanded(forceExpanded);
  }, [forceExpanded]);

  const timestamp = useMemo(() => {
    const date = new Date(log.timestamp);

    if (use24Hour) {
      return date.toLocaleTimeString('en-US', { hour12: false });
    }

    return date.toLocaleTimeString('en-US', { hour12: true });
  }, [log.timestamp, use24Hour]);

  const levelColor = useMemo(() => {
    switch (log.level) {
      case 'error':
        return 'text-red-500 bg-red-50 dark:bg-red-500/10';
      case 'warning':
        return 'text-yellow-500 bg-yellow-50 dark:bg-yellow-500/10';
      case 'debug':
        return 'text-gray-500 bg-gray-50 dark:bg-gray-500/10';
      default:
        return 'text-blue-500 bg-blue-50 dark:bg-blue-500/10';
    }
  }, [log.level]);

  return (
    <div className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className={classNames('px-2 py-0.5 rounded text-xs font-medium uppercase', levelColor)}>{log.level}</div>
        {showTimestamp && <div className="text-sm text-bolt-elements-textTertiary">{timestamp}</div>}
        <div className="flex-grow">
          <div className="text-sm text-bolt-elements-textPrimary">{log.message}</div>
          {log.details && (
            <button
              onClick={() => setLocalExpanded(!localExpanded)}
              className="mt-1 text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary"
            >
              {localExpanded ? 'Hide' : 'Show'} Details
            </button>
          )}
        </div>
        {log.category && (
          <div className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-bolt-elements-textSecondary">
            {log.category}
          </div>
        )}
      </div>
      {localExpanded && log.details && (
        <div className="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800/50">
          <pre className="text-xs text-bolt-elements-textSecondary whitespace-pre-wrap">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export function EventLogsTab() {
  const logs = useStore(logStore.logs);
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [use24Hour, setUse24Hour] = useState(false);
  const [autoExpand, setAutoExpand] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showLevelFilter, setShowLevelFilter] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const levelFilterRef = useRef<HTMLDivElement>(null);
  const categoryFilterRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    return logStore.getFilteredLogs(
      selectedLevel === 'all' ? undefined : (selectedLevel as LogEntry['level']),
      selectedCategory === 'all' ? undefined : (selectedCategory as LogEntry['category']),
      searchQuery,
    );
  }, [logs, selectedLevel, selectedCategory, searchQuery]);

  const handleExportLogs = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      logs: filteredLogs,
      filters: {
        level: selectedLevel,
        category: selectedCategory,
        searchQuery,
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bolt-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredLogs, selectedLevel, selectedCategory, searchQuery]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await logStore.refreshLogs();
    setTimeout(() => setIsRefreshing(false), 500); // Keep animation visible for at least 500ms
  }, []);

  // Close filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (levelFilterRef.current && !levelFilterRef.current.contains(event.target as Node)) {
        setShowLevelFilter(false);
      }

      if (categoryFilterRef.current && !categoryFilterRef.current.contains(event.target as Node)) {
        setShowCategoryFilter(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedLevelOption = logLevelOptions.find((opt) => opt.value === selectedLevel);
  const selectedCategoryOption = logCategoryOptions.find((opt) => opt.value === selectedCategory);

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="i-ph:list text-xl text-purple-500" />
          <div>
            <h2 className="text-lg font-semibold">Event Logs</h2>
            <p className="text-sm text-bolt-elements-textSecondary">Track system events and debug information</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <motion.button
            onClick={handleRefresh}
            className="p-2 rounded-lg text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all duration-200"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            animate={isRefreshing ? { rotate: 360 } : {}}
            transition={isRefreshing ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
          >
            <div className="i-ph:arrows-clockwise text-xl" />
          </motion.button>
        </div>
      </div>

      {/* Top Controls */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="flex-grow relative">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 pl-9 rounded-lg text-sm bg-white/50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/50"
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary">
            <div className="i-ph:magnifying-glass text-base" />
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={showTimestamps} onCheckedChange={setShowTimestamps} />
            <span className="text-sm text-bolt-elements-textSecondary whitespace-nowrap">Show Timestamps</span>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={use24Hour} onCheckedChange={setUse24Hour} />
            <span className="text-sm text-bolt-elements-textSecondary whitespace-nowrap">24h Time</span>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={autoExpand} onCheckedChange={setAutoExpand} />
            <span className="text-sm text-bolt-elements-textSecondary whitespace-nowrap">Auto Expand</span>
          </div>

          <motion.button
            onClick={handleExportLogs}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm bg-purple-500 hover:bg-purple-600 text-white transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="i-ph:download text-base" />
            Export Logs
          </motion.button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 -mt-2">
        {/* Level Filter */}
        <div ref={levelFilterRef} className="relative">
          <button
            onClick={() => {
              setShowLevelFilter(!showLevelFilter);
              setShowCategoryFilter(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-purple-500/10 dark:hover:bg-purple-500/20 hover:text-purple-500 dark:hover:text-purple-500 transition-colors"
          >
            <div
              className={classNames('text-sm', selectedLevelOption?.icon || 'i-ph:funnel')}
              style={{ color: selectedLevelOption?.color }}
            />
            <div className="text-sm text-bolt-elements-textSecondary">{selectedLevelOption?.label || 'All Levels'}</div>
            <div
              className={classNames(
                'i-ph:caret-down text-sm text-bolt-elements-textTertiary transition-transform',
                showLevelFilter ? 'rotate-180' : '',
              )}
            />
          </button>

          {showLevelFilter && (
            <div className="absolute left-0 top-full mt-1 z-20">
              <div className="p-1 rounded-lg shadow-lg bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333]">
                {logLevelOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSelectedLevel(option.value);
                      setShowLevelFilter(false);
                    }}
                    className={classNames(
                      'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors',
                      option.value === selectedLevel
                        ? 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 dark:text-purple-500'
                        : 'hover:bg-purple-500/10 dark:hover:bg-purple-500/20 hover:text-purple-500 dark:hover:text-purple-500',
                    )}
                  >
                    <div className={classNames(option.icon, 'text-base')} style={{ color: option.color }} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Category Filter */}
        <div ref={categoryFilterRef} className="relative">
          <button
            onClick={() => {
              setShowCategoryFilter(!showCategoryFilter);
              setShowLevelFilter(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-purple-500/10 dark:hover:bg-purple-500/20 hover:text-purple-500 dark:hover:text-purple-500 transition-colors"
          >
            <div
              className={classNames('text-sm', selectedCategoryOption?.icon || 'i-ph:squares-four')}
              style={{ color: selectedCategoryOption?.color }}
            />
            <div className="text-sm text-bolt-elements-textSecondary">
              {selectedCategoryOption?.label || 'All Categories'}
            </div>
            <div
              className={classNames(
                'i-ph:caret-down text-sm text-bolt-elements-textTertiary transition-transform',
                showCategoryFilter ? 'rotate-180' : '',
              )}
            />
          </button>

          {showCategoryFilter && (
            <div className="absolute left-0 top-full mt-1 z-20">
              <div className="p-1 rounded-lg shadow-lg bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333]">
                {logCategoryOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSelectedCategory(option.value);
                      setShowCategoryFilter(false);
                    }}
                    className={classNames(
                      'flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-sm transition-colors',
                      option.value === selectedCategory
                        ? 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 dark:text-purple-500'
                        : 'hover:bg-purple-500/10 dark:hover:bg-purple-500/20 hover:text-purple-500 dark:hover:text-purple-500',
                    )}
                  >
                    <div className={classNames(option.icon, 'text-base')} style={{ color: option.color }} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logs Container */}
      <div
        ref={logsContainerRef}
        className="flex-grow overflow-y-auto rounded-lg bg-white/50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/50"
      >
        <div className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
          {filteredLogs.map((log) => (
            <LogEntryItem
              key={log.id}
              log={log}
              isExpanded={autoExpand}
              use24Hour={use24Hour}
              showTimestamp={showTimestamps}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
