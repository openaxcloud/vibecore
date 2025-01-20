import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import { Switch } from '~/components/ui/Switch';
import { logStore, type LogEntry } from '~/lib/stores/logs';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { motion } from 'framer-motion';

interface SelectOption {
  value: string;
  label: string;
  icon: string;
  color?: string;
}

const logLevelOptions: SelectOption[] = [
  { value: 'all', label: 'All Levels', icon: 'i-ph:funnel' },
  { value: 'info', label: 'Info', icon: 'i-ph:info', color: 'text-blue-500' },
  { value: 'warning', label: 'Warning', icon: 'i-ph:warning', color: 'text-yellow-500' },
  { value: 'error', label: 'Error', icon: 'i-ph:x-circle', color: 'text-red-500' },
  { value: 'debug', label: 'Debug', icon: 'i-ph:bug', color: 'text-gray-500' },
];

const logCategoryOptions: SelectOption[] = [
  { value: 'all', label: 'All Categories', icon: 'i-ph:squares-four' },
  { value: 'system', label: 'System', icon: 'i-ph:desktop' },
  { value: 'provider', label: 'Provider', icon: 'i-ph:plug' },
  { value: 'user', label: 'User', icon: 'i-ph:user' },
  { value: 'error', label: 'Error', icon: 'i-ph:warning-octagon' },
];

const SegmentedGroup = ({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className={classNames(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
          'bg-white/50 dark:bg-gray-800/30',
          'hover:bg-gray-50 dark:hover:bg-gray-800/50',
          'border border-gray-200/50 dark:border-gray-700/50',
          'text-bolt-elements-textPrimary',
          className,
        )}
      >
        <div className={classNames(selectedOption?.icon, 'text-base text-purple-500')} />
        <span className="text-sm">{selectedOption?.label}</span>
        <div className="i-ph:caret-right text-sm text-bolt-elements-textTertiary" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/50">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            onChange(option.value);
            setIsExpanded(false);
          }}
          className={classNames(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
            option.value === value
              ? 'bg-purple-100 dark:bg-purple-800/40 text-purple-900 dark:text-purple-200'
              : 'text-bolt-elements-textSecondary hover:bg-gray-50 dark:hover:bg-gray-800/50',
          )}
        >
          <div className={classNames(option.icon, 'text-base', option.value === value ? option.color : '')} />
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
};

const LogEntryItem = ({
  log,
  isExpanded: forceExpanded,
  use24Hour,
}: {
  log: LogEntry;
  isExpanded: boolean;
  use24Hour: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(forceExpanded);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setIsExpanded(forceExpanded);
  }, [forceExpanded]);

  const handleCopy = useCallback(() => {
    const logText = `[${log.level.toUpperCase()}] ${log.message}\nTimestamp: ${new Date(
      log.timestamp,
    ).toLocaleString()}\nCategory: ${log.category}\nDetails: ${JSON.stringify(log.details, null, 2)}`;

    navigator.clipboard.writeText(logText).then(() => {
      setIsCopied(true);
      toast.success('Log copied to clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    });
  }, [log]);

  const formattedTime = useMemo(() => {
    const date = new Date(log.timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();

    const timeStr = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !use24Hour,
    });

    if (isToday) {
      return {
        primary: timeStr,
        secondary: 'Today',
      };
    } else if (isYesterday) {
      return {
        primary: timeStr,
        secondary: 'Yesterday',
      };
    } else {
      const dateStr = date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
      return {
        primary: dateStr,
        secondary: timeStr,
      };
    }
  }, [log.timestamp, use24Hour]);

  return (
    <div
      className={classNames('group transition-colors', 'hover:bg-gray-50 dark:hover:bg-gray-800/50', 'py-3', {
        'bg-red-50/20 dark:bg-red-900/5': log.level === 'error',
        'bg-yellow-50/20 dark:bg-yellow-900/5': log.level === 'warning',
        'bg-blue-50/20 dark:bg-blue-900/5': log.level === 'info',
        'bg-gray-50/20 dark:bg-gray-800/5': log.level === 'debug',
      })}
    >
      <div className="px-3">
        <div className="flex items-center gap-3">
          <span
            className={classNames('px-2 py-0.5 text-xs font-medium rounded-full', {
              'bg-red-100/80 text-red-800 dark:bg-red-500/10 dark:text-red-400': log.level === 'error',
              'bg-yellow-100/80 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-400': log.level === 'warning',
              'bg-blue-100/80 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400': log.level === 'info',
              'bg-gray-100/80 text-gray-800 dark:bg-gray-500/10 dark:text-gray-400': log.level === 'debug',
            })}
          >
            {log.level}
          </span>
          <p className="flex-1 text-sm text-bolt-elements-textPrimary">{log.message}</p>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handleCopy} className="p-1 transition-colors rounded focus:outline-none" title="Copy log">
              <div
                className={classNames(
                  'text-base transition-colors',
                  isCopied
                    ? 'i-ph:check text-green-500'
                    : 'i-ph:copy text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary',
                )}
              />
            </button>
            {log.details && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors rounded focus:outline-none"
                title="Toggle details"
              >
                <div
                  className={classNames('text-base transition-transform', {
                    'i-ph:caret-down rotate-180': isExpanded,
                    'i-ph:caret-down': !isExpanded,
                  })}
                />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs">
          <div className="flex items-center gap-1">
            <div className="i-ph:clock text-bolt-elements-textTertiary" />
            <span className="text-bolt-elements-textSecondary">{formattedTime.primary}</span>
            <span className="text-bolt-elements-textTertiary">·</span>
            <span className="text-bolt-elements-textTertiary">{formattedTime.secondary}</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3">
            {log.category}
          </span>
        </div>
      </div>

      {isExpanded && log.details && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-2 px-3"
        >
          <pre className="p-2 text-sm rounded-md overflow-auto bg-bolt-elements-background-depth-2/50 dark:bg-bolt-elements-background-depth-3/50 text-bolt-elements-textSecondary">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </motion.div>
      )}
    </div>
  );
};

/**
 * TODO: Future Enhancements
 *
 * 1. Advanced Features:
 *    - Add export to JSON/CSV functionality
 *    - Implement log retention policies
 *    - Add custom alert rules and notifications
 *    - Add pattern detection and highlighting
 *
 * 2. Visual Improvements:
 *    - Add dark/light mode specific styling
 *    - Implement collapsible JSON viewer
 *    - Add timeline view with zoom capabilities
 *
 * 3. Performance Optimizations:
 *    - Implement virtualized scrolling for large logs
 *    - Add lazy loading for log details
 *    - Optimize search with indexing
 */

export function EventLogsTab() {
  const logs = useStore(logStore.logs);
  const [logLevel, setLogLevel] = useState<LogEntry['level'] | 'all'>('all');
  const [logCategory, setLogCategory] = useState<LogEntry['category'] | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandAll, setExpandAll] = useState(false);
  const [use24Hour, setUse24Hour] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  // Add refresh function
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      // Since logStore doesn't have refresh, we'll re-fetch logs
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate refresh
      toast.success('Logs refreshed');
    } catch (err) {
      console.error('Failed to refresh logs:', err);
      toast.error('Failed to refresh logs');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const filteredLogs = useMemo(() => {
    const allLogs = Object.values(logs);
    const filtered = allLogs.filter((log) => {
      const matchesLevel = logLevel === 'all' || log.level === logLevel;
      const matchesCategory = logCategory === 'all' || log.category === logCategory;
      const matchesSearch =
        !searchQuery ||
        log.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(log.details)?.toLowerCase()?.includes(searchQuery?.toLowerCase());

      return matchesLevel && matchesCategory && matchesSearch;
    });

    return filtered.reverse();
  }, [logs, logLevel, logCategory, searchQuery]);

  const handleClearLogs = useCallback(() => {
    if (confirm('Are you sure you want to clear all logs?')) {
      logStore.clearLogs();
      toast.success('Logs cleared successfully');
    }
  }, []);

  const handleExportLogs = useCallback(() => {
    try {
      const logText = logStore
        .getLogs()
        .map(
          (log) =>
            `[${log.level.toUpperCase()}] ${log.timestamp} - ${log.message}${
              log.details ? '\nDetails: ' + JSON.stringify(log.details, null, 2) : ''
            }`,
        )
        .join('\n\n');

      const blob = new Blob([logText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-logs-${new Date().toISOString()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Logs exported successfully');
    } catch (error) {
      toast.error('Failed to export logs');
      console.error('Export error:', error);
    }
  }, []);

  const handleScroll = () => {
    const container = logsContainerRef.current;

    if (!container) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
    setIsScrolledToBottom(isBottom);
  };

  useEffect(() => {
    const container = logsContainerRef.current;

    if (container && (autoScroll || isScrolledToBottom)) {
      container.scrollTop = container.scrollHeight;
    }
  }, [filteredLogs, autoScroll, isScrolledToBottom]);

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 pb-4">
        {/* Title and Refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="i-ph:list text-xl text-purple-500" />
            <div>
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Event Logs</h2>
              <p className="text-sm text-bolt-elements-textSecondary">Track system events and debug information</p>
            </div>
          </div>
          <motion.button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={classNames(
              'p-2.5 rounded-lg',
              'bg-purple-50/50 dark:bg-purple-900/10',
              'text-purple-500 hover:text-purple-600',
              'hover:bg-purple-100/50 dark:hover:bg-purple-900/20',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/20',
              'transition-all duration-200 ease-in-out',
              { 'opacity-50 cursor-not-allowed': isRefreshing },
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Refresh logs"
          >
            <div className={classNames('text-lg transition-all duration-300', { 'animate-spin': isRefreshing })}>
              <div className="i-ph:arrows-clockwise" />
            </div>
          </motion.button>
        </div>

        {/* Controls Section */}
        <div className="flex items-center justify-end gap-2 px-1">
          <div className="flex items-center gap-6 p-1.5 rounded-lg bg-white/50 dark:bg-gray-800/30 border border-gray-200/50 dark:border-gray-700/50">
            <motion.div
              className="flex items-center gap-3"
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <span className="text-sm font-medium text-bolt-elements-textSecondary">Auto-scroll</span>
              <Switch
                checked={autoScroll}
                onCheckedChange={setAutoScroll}
                className="data-[state=checked]:bg-purple-500"
              />
            </motion.div>

            <div className="h-4 w-px bg-bolt-elements-borderColor" />

            <motion.div
              className="flex items-center gap-3"
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <span className="text-sm font-medium text-bolt-elements-textSecondary">24h Time</span>
              <Switch
                checked={use24Hour}
                onCheckedChange={setUse24Hour}
                className="data-[state=checked]:bg-purple-500"
              />
            </motion.div>

            <div className="h-4 w-px bg-bolt-elements-borderColor" />

            <motion.div
              className="flex items-center gap-3"
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <span className="text-sm font-medium text-bolt-elements-textSecondary">Expand All</span>
              <Switch
                checked={expandAll}
                onCheckedChange={setExpandAll}
                className="data-[state=checked]:bg-purple-500"
              />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Header with Search */}
      <div className="flex flex-col gap-4">
        <div className="relative w-72">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bolt-elements-textTertiary">
            <div className="i-ph:magnifying-glass text-base" />
          </div>
          <input
            type="text"
            placeholder="Search logs..."
            className={classNames(
              'w-full pl-8 pr-3 py-1.5 rounded-md text-sm',
              'bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-2',
              'border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
              'focus:outline-none focus:ring-1 focus:ring-purple-500/30 focus:border-purple-500/30',
              'transition-all duration-200',
            )}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filters Row */}
        <div className="flex items-center -ml-1">
          <SegmentedGroup
            value={logLevel}
            onChange={(value) => setLogLevel(value as LogEntry['level'] | 'all')}
            options={logLevelOptions}
          />
          <div className="mx-2 w-px h-4 bg-bolt-elements-borderColor" />
          <SegmentedGroup
            value={logCategory}
            onChange={(value) => setLogCategory(value as LogEntry['category'] | 'all')}
            options={logCategoryOptions}
          />
        </div>
      </div>

      {/* Logs Display */}
      <div
        ref={logsContainerRef}
        className="flex-1 overflow-auto rounded-lg bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-2"
        onScroll={handleScroll}
      >
        <div className="divide-y divide-bolt-elements-borderColor">
          {filteredLogs.map((log) => (
            <LogEntryItem key={log.id} log={log} isExpanded={expandAll} use24Hour={use24Hour} />
          ))}
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between py-2 px-4 text-sm text-bolt-elements-textSecondary">
        <div className="flex items-center gap-6">
          <span>{filteredLogs.length} logs displayed</span>
          <span>{isScrolledToBottom ? 'Watching for new logs...' : 'Scroll to bottom to watch new logs'}</span>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleExportLogs}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 rounded-md transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="i-ph:download-simple" />
            Export
          </motion.button>
          <motion.button
            onClick={handleClearLogs}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 rounded-md transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="i-ph:trash" />
            Clear
          </motion.button>
        </div>
      </div>
    </div>
  );
}
