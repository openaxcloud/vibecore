import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Switch } from '~/components/ui/Switch';
import { logStore, type LogEntry } from '~/lib/stores/logs';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}

const logLevelOptions: SelectOption[] = [
  {
    value: 'all',
    label: 'All Types',
    icon: 'i-ph:funnel',
    color: '#9333ea',
  },
  {
    value: 'provider',
    label: 'LLM',
    icon: 'i-ph:robot',
    color: '#10b981',
  },
  {
    value: 'api',
    label: 'API',
    icon: 'i-ph:cloud',
    color: '#3b82f6',
  },
  {
    value: 'error',
    label: 'Errors',
    icon: 'i-ph:warning-circle',
    color: '#ef4444',
  },
  {
    value: 'warning',
    label: 'Warnings',
    icon: 'i-ph:warning',
    color: '#f59e0b',
  },
  {
    value: 'info',
    label: 'Info',
    icon: 'i-ph:info',
    color: '#3b82f6',
  },
  {
    value: 'debug',
    label: 'Debug',
    icon: 'i-ph:bug',
    color: '#6b7280',
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

  useEffect(() => {
    setLocalExpanded(forceExpanded);
  }, [forceExpanded]);

  const timestamp = useMemo(() => {
    const date = new Date(log.timestamp);
    return date.toLocaleTimeString('en-US', { hour12: !use24Hour });
  }, [log.timestamp, use24Hour]);

  const style = useMemo(() => {
    if (log.category === 'provider') {
      return {
        icon: 'i-ph:robot',
        color: 'text-emerald-500 dark:text-emerald-400',
        bg: 'hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20',
        badge: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
      };
    }

    if (log.category === 'api') {
      return {
        icon: 'i-ph:cloud',
        color: 'text-blue-500 dark:text-blue-400',
        bg: 'hover:bg-blue-500/10 dark:hover:bg-blue-500/20',
        badge: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10',
      };
    }

    switch (log.level) {
      case 'error':
        return {
          icon: 'i-ph:warning-circle',
          color: 'text-red-500 dark:text-red-400',
          bg: 'hover:bg-red-500/10 dark:hover:bg-red-500/20',
          badge: 'text-red-500 bg-red-50 dark:bg-red-500/10',
        };
      case 'warning':
        return {
          icon: 'i-ph:warning',
          color: 'text-yellow-500 dark:text-yellow-400',
          bg: 'hover:bg-yellow-500/10 dark:hover:bg-yellow-500/20',
          badge: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-500/10',
        };
      case 'debug':
        return {
          icon: 'i-ph:bug',
          color: 'text-gray-500 dark:text-gray-400',
          bg: 'hover:bg-gray-500/10 dark:hover:bg-gray-500/20',
          badge: 'text-gray-500 bg-gray-50 dark:bg-gray-500/10',
        };
      default:
        return {
          icon: 'i-ph:info',
          color: 'text-blue-500 dark:text-blue-400',
          bg: 'hover:bg-blue-500/10 dark:hover:bg-blue-500/20',
          badge: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10',
        };
    }
  }, [log.level, log.category]);

  const renderDetails = (details: any) => {
    if (log.category === 'provider') {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Model: {details.model}</span>
            <span>•</span>
            <span>Tokens: {details.totalTokens}</span>
            <span>•</span>
            <span>Duration: {details.duration}ms</span>
          </div>
          {details.prompt && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Prompt:</div>
              <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded p-2 whitespace-pre-wrap">
                {details.prompt}
              </pre>
            </div>
          )}
          {details.response && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Response:</div>
              <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded p-2 whitespace-pre-wrap">
                {details.response}
              </pre>
            </div>
          )}
        </div>
      );
    }

    if (log.category === 'api') {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className={details.method === 'GET' ? 'text-green-500' : 'text-blue-500'}>{details.method}</span>
            <span>•</span>
            <span>Status: {details.statusCode}</span>
            <span>•</span>
            <span>Duration: {details.duration}ms</span>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 break-all">{details.url}</div>
          {details.request && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Request:</div>
              <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded p-2 whitespace-pre-wrap">
                {JSON.stringify(details.request, null, 2)}
              </pre>
            </div>
          )}
          {details.response && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Response:</div>
              <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded p-2 whitespace-pre-wrap">
                {JSON.stringify(details.response, null, 2)}
              </pre>
            </div>
          )}
          {details.error && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-red-500">Error:</div>
              <pre className="text-xs text-red-400 bg-red-50 dark:bg-red-500/10 rounded p-2 whitespace-pre-wrap">
                {JSON.stringify(details.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return (
      <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded whitespace-pre-wrap">
        {JSON.stringify(details, null, 2)}
      </pre>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={classNames(
        'flex flex-col gap-2',
        'rounded-lg p-4',
        'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
        'border border-[#E5E5E5] dark:border-[#1A1A1A]',
        style.bg,
        'transition-all duration-200',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={classNames('text-lg', style.icon, style.color)} />
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{log.message}</div>
            {log.details && (
              <>
                <button
                  onClick={() => setLocalExpanded(!localExpanded)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
                >
                  {localExpanded ? 'Hide' : 'Show'} Details
                </button>
                {localExpanded && renderDetails(log.details)}
              </>
            )}
            <div className="flex items-center gap-2">
              <div className={classNames('px-2 py-0.5 rounded text-xs font-medium uppercase', style.badge)}>
                {log.level}
              </div>
              {log.category && (
                <div className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  {log.category}
                </div>
              )}
            </div>
          </div>
        </div>
        {showTimestamp && <time className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{timestamp}</time>}
      </div>
    </motion.div>
  );
};

export function EventLogsTab() {
  const logs = useStore(logStore.logs);
  const [selectedLevel, setSelectedLevel] = useState<'all' | string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [use24Hour, setUse24Hour] = useState(false);
  const [autoExpand, setAutoExpand] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showLevelFilter, setShowLevelFilter] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const levelFilterRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    const allLogs = Object.values(logs);

    if (selectedLevel === 'all') {
      return allLogs.filter((log) =>
        searchQuery ? log.message.toLowerCase().includes(searchQuery.toLowerCase()) : true,
      );
    }

    return allLogs.filter((log) => {
      const matchesType = log.category === selectedLevel || log.level === selectedLevel;
      const matchesSearch = searchQuery ? log.message.toLowerCase().includes(searchQuery.toLowerCase()) : true;

      return matchesType && matchesSearch;
    });
  }, [logs, selectedLevel, searchQuery]);

  // Add performance tracking on mount
  useEffect(() => {
    const startTime = performance.now();

    logStore.logInfo('Event Logs tab mounted', {
      type: 'component_mount',
      message: 'Event Logs tab component mounted',
      component: 'EventLogsTab',
    });

    return () => {
      const duration = performance.now() - startTime;
      logStore.logPerformanceMetric('EventLogsTab', 'mount-duration', duration);
    };
  }, []);

  // Log filter changes
  const handleLevelFilterChange = useCallback(
    (newLevel: string) => {
      logStore.logInfo('Log level filter changed', {
        type: 'filter_change',
        message: `Log level filter changed from ${selectedLevel} to ${newLevel}`,
        component: 'EventLogsTab',
        previousLevel: selectedLevel,
        newLevel,
      });
      setSelectedLevel(newLevel as string);
      setShowLevelFilter(false);
    },
    [selectedLevel],
  );

  // Log search changes with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        logStore.logInfo('Log search performed', {
          type: 'search',
          message: `Search performed with query "${searchQuery}" (${filteredLogs.length} results)`,
          component: 'EventLogsTab',
          query: searchQuery,
          resultsCount: filteredLogs.length,
        });
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, filteredLogs.length]);

  // Enhanced export logs handler
  const handleExportLogs = useCallback(() => {
    const startTime = performance.now();

    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        logs: filteredLogs,
        filters: {
          level: selectedLevel,
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

      const duration = performance.now() - startTime;
      logStore.logSuccess('Logs exported successfully', {
        type: 'export',
        message: `Successfully exported ${filteredLogs.length} logs`,
        component: 'EventLogsTab',
        exportedCount: filteredLogs.length,
        filters: {
          level: selectedLevel,
          searchQuery,
        },
        duration,
      });
    } catch (error) {
      logStore.logError('Failed to export logs', error, {
        type: 'export_error',
        message: 'Failed to export logs',
        component: 'EventLogsTab',
      });
    }
  }, [filteredLogs, selectedLevel, searchQuery]);

  // Enhanced refresh handler
  const handleRefresh = useCallback(async () => {
    const startTime = performance.now();
    setIsRefreshing(true);

    try {
      await logStore.refreshLogs();

      const duration = performance.now() - startTime;

      logStore.logSuccess('Logs refreshed successfully', {
        type: 'refresh',
        message: `Successfully refreshed ${Object.keys(logs).length} logs`,
        component: 'EventLogsTab',
        duration,
        logsCount: Object.keys(logs).length,
      });
    } catch (error) {
      logStore.logError('Failed to refresh logs', error, {
        type: 'refresh_error',
        message: 'Failed to refresh logs',
        component: 'EventLogsTab',
      });
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [logs]);

  // Log preference changes
  const handlePreferenceChange = useCallback((type: string, value: boolean) => {
    logStore.logInfo('Log preference changed', {
      type: 'preference_change',
      message: `Log preference "${type}" changed to ${value}`,
      component: 'EventLogsTab',
      preference: type,
      value,
    });

    switch (type) {
      case 'timestamps':
        setShowTimestamps(value);
        break;
      case '24hour':
        setUse24Hour(value);
        break;
      case 'autoExpand':
        setAutoExpand(value);
        break;
    }
  }, []);

  // Close filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (levelFilterRef.current && !levelFilterRef.current.contains(event.target as Node)) {
        setShowLevelFilter(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedLevelOption = logLevelOptions.find((opt) => opt.value === selectedLevel);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <DropdownMenu.Root open={showLevelFilter} onOpenChange={setShowLevelFilter}>
          <DropdownMenu.Trigger asChild>
            <button
              className={classNames(
                'flex items-center gap-2',
                'rounded-lg px-3 py-1.5',
                'text-sm text-gray-900 dark:text-white',
                'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
                'border border-[#E5E5E5] dark:border-[#1A1A1A]',
                'hover:bg-purple-500/10 dark:hover:bg-purple-500/20',
                'transition-all duration-200',
              )}
            >
              <span
                className={classNames('text-lg', selectedLevelOption?.icon || 'i-ph:funnel')}
                style={{ color: selectedLevelOption?.color }}
              />
              {selectedLevelOption?.label || 'All Types'}
              <span className="i-ph:caret-down text-lg text-gray-500 dark:text-gray-400" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[200px] bg-white dark:bg-[#0A0A0A] rounded-lg shadow-lg py-1 z-[250] animate-in fade-in-0 zoom-in-95 border border-[#E5E5E5] dark:border-[#1A1A1A]"
              sideOffset={5}
              align="start"
              side="bottom"
            >
              {logLevelOptions.map((option) => (
                <DropdownMenu.Item
                  key={option.value}
                  className="group flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-purple-500/10 dark:hover:bg-purple-500/20 cursor-pointer transition-colors"
                  onClick={() => handleLevelFilterChange(option.value)}
                >
                  <div className="mr-3 flex h-5 w-5 items-center justify-center">
                    <div
                      className={classNames(option.icon, 'text-lg group-hover:text-purple-500 transition-colors')}
                      style={{ color: option.color }}
                    />
                  </div>
                  <span className="group-hover:text-purple-500 transition-colors">{option.label}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={showTimestamps}
              onCheckedChange={(value) => handlePreferenceChange('timestamps', value)}
              className="data-[state=checked]:bg-purple-500"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">Show Timestamps</span>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={use24Hour}
              onCheckedChange={(value) => handlePreferenceChange('24hour', value)}
              className="data-[state=checked]:bg-purple-500"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">24h Time</span>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={autoExpand}
              onCheckedChange={(value) => handlePreferenceChange('autoExpand', value)}
              className="data-[state=checked]:bg-purple-500"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">Auto Expand</span>
          </div>

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />

          <button
            onClick={handleRefresh}
            className={classNames(
              'group flex items-center gap-2',
              'rounded-lg px-3 py-1.5',
              'text-sm text-gray-900 dark:text-white',
              'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
              'border border-[#E5E5E5] dark:border-[#1A1A1A]',
              'hover:bg-purple-500/10 dark:hover:bg-purple-500/20',
              'transition-all duration-200',
              { 'animate-spin': isRefreshing },
            )}
          >
            <span className="i-ph:arrows-clockwise text-lg text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
            Refresh
          </button>

          <button
            onClick={handleExportLogs}
            className={classNames(
              'group flex items-center gap-2',
              'rounded-lg px-3 py-1.5',
              'text-sm text-gray-900 dark:text-white',
              'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
              'border border-[#E5E5E5] dark:border-[#1A1A1A]',
              'hover:bg-purple-500/10 dark:hover:bg-purple-500/20',
              'transition-all duration-200',
            )}
          >
            <span className="i-ph:download text-lg text-gray-500 dark:text-gray-400 group-hover:text-purple-500 transition-colors" />
            Export
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={classNames(
              'w-full px-4 py-2 pl-10 rounded-lg',
              'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
              'border border-[#E5E5E5] dark:border-[#1A1A1A]',
              'text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500',
              'transition-all duration-200',
            )}
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <div className="i-ph:magnifying-glass text-lg text-gray-500 dark:text-gray-400" />
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={classNames(
              'flex flex-col items-center justify-center gap-4',
              'rounded-lg p-8 text-center',
              'bg-[#FAFAFA] dark:bg-[#0A0A0A]',
              'border border-[#E5E5E5] dark:border-[#1A1A1A]',
            )}
          >
            <span className="i-ph:clipboard-text text-4xl text-gray-400 dark:text-gray-600" />
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">No Logs Found</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your search or filters</p>
            </div>
          </motion.div>
        ) : (
          filteredLogs.map((log) => (
            <LogEntryItem
              key={log.id}
              log={log}
              isExpanded={autoExpand}
              use24Hour={use24Hour}
              showTimestamp={showTimestamps}
            />
          ))
        )}
      </div>
    </div>
  );
}
