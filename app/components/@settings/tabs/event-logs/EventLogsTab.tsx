import { useStore } from '@nanostores/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { buildExportFilename } from './export-filename';
import { countMatchingLogs } from './log-search';
import { Dialog, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Switch } from '~/components/ui/Switch';
import { logStore, type LogEntry } from '~/lib/stores/logs';
import { classNames } from '~/utils/classNames';

interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}

const logLevelOptionMetadata: Array<Omit<SelectOption, 'label'> & { labelKey: string }> = [
  {
    value: 'all',
    labelKey: 'settings.copy.allTypes_bc013254',
    icon: 'i-ph:funnel',
    color: 'var(--vc-ide-accent-action)',
  },
  {
    value: 'provider',
    labelKey: 'settings.copy.llm_674900a7',
    icon: 'i-ph:robot',
    color: 'var(--vc-status-ok)',
  },
  {
    value: 'api',
    labelKey: 'settings.copy.api_c8e5998f',
    icon: 'i-ph:cloud',
    color: 'var(--vc-ide-accent-action)',
  },
  {
    value: 'error',
    labelKey: 'settings.copy.errors_cb702378',
    icon: 'i-ph:warning-circle',
    color: 'var(--vc-status-error)',
  },
  {
    value: 'warning',
    labelKey: 'settings.copy.warnings_0e04cd10',
    icon: 'i-ph:warning',
    color: 'var(--vc-status-warn)',
  },
  {
    value: 'info',
    labelKey: 'settings.copy.info_170322a3',
    icon: 'i-ph:info',
    color: 'var(--vc-ide-accent-action)',
  },
  {
    value: 'debug',
    labelKey: 'settings.copy.debug_1a03bd2f',
    icon: 'i-ph:bug',
    color: 'var(--vc-status-muted)',
  },
];

interface LogEntryItemProps {
  log: LogEntry;
  isExpanded: boolean;
  use24Hour: boolean;
  showTimestamp: boolean;
}

const LogEntryItem = ({ log, isExpanded: forceExpanded, use24Hour, showTimestamp }: LogEntryItemProps) => {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const [localExpanded, setLocalExpanded] = useState(forceExpanded);

  useEffect(() => {
    setLocalExpanded(forceExpanded);
  }, [forceExpanded]);

  const timestamp = useMemo(() => {
    const date = new Date(log.timestamp);
    return date.toLocaleTimeString(language, { hour12: !use24Hour });
  }, [language, log.timestamp, use24Hour]);

  const formatLogLevel = (level: string) => {
    switch (level) {
      case 'error':
        return t('settings.copy.errors_cb702378');
      case 'warning':
        return t('settings.copy.warnings_0e04cd10');
      case 'debug':
        return t('settings.copy.debug_1a03bd2f');
      default:
        return t('settings.copy.info_170322a3');
    }
  };

  const formatLogCategory = (category: string) =>
    category === 'provider' ? t('settings.copy.llm_674900a7') : t('settings.copy.api_c8e5998f');

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
          color: 'text-bolt-elements-textTertiary',
          bg: 'hover:bg-bolt-elements-background-depth-3',
          badge: 'text-bolt-elements-textTertiary bg-bolt-elements-background-depth-3',
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
          <div className="flex items-center gap-2 text-xs text-bolt-elements-textTertiary">
            <span>
              {t('settings.copy.model_11a93106')} {details.model}
            </span>
            <span>•</span>
            <span>
              {t('settings.copy.tokens_e1c97fd1')} {details.totalTokens}
            </span>
            <span>•</span>
            <span>
              {t('settings.copy.duration_298d6c75')} {details.duration}
              {t('settings.copy.ms_f785c3ce')}
            </span>
          </div>
          {details.prompt && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-bolt-elements-textSecondary">
                {t('settings.copy.prompt_35261535')}
              </div>
              <pre className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3 rounded p-2 whitespace-pre-wrap">
                {details.prompt}
              </pre>
            </div>
          )}
          {details.response && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-bolt-elements-textSecondary">
                {t('settings.copy.response_e8209287')}
              </div>
              <pre className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3 rounded p-2 whitespace-pre-wrap">
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
          <div className="flex items-center gap-2 text-xs text-bolt-elements-textTertiary">
            <span className={details.method === 'GET' ? 'text-green-500' : 'text-blue-500'}>{details.method}</span>
            <span>•</span>
            <span>
              {t('settings.copy.status_755c8b2a')} {details.statusCode}
            </span>
            <span>•</span>
            <span>
              {t('settings.copy.duration_298d6c75')} {details.duration}
              {t('settings.copy.ms_f785c3ce')}
            </span>
          </div>
          <div className="text-xs text-bolt-elements-textSecondary break-all">{details.url}</div>
          {details.request && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-bolt-elements-textSecondary">
                {t('settings.copy.request_3921a1e9')}
              </div>
              <pre className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3 rounded p-2 whitespace-pre-wrap">
                {JSON.stringify(details.request, null, 2)}
              </pre>
            </div>
          )}
          {details.response && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-bolt-elements-textSecondary">
                {t('settings.copy.response_e8209287')}
              </div>
              <pre className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3 rounded p-2 whitespace-pre-wrap">
                {JSON.stringify(details.response, null, 2)}
              </pre>
            </div>
          )}
          {details.error && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-medium text-red-500">{t('settings.copy.error_61706290')}</div>
              <pre className="text-xs text-red-400 bg-red-50 dark:bg-red-500/10 rounded p-2 whitespace-pre-wrap">
                {JSON.stringify(details.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      );
    }

    return (
      <pre className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3 rounded whitespace-pre-wrap">
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
        'bg-bolt-elements-background-depth-2',
        'border border-bolt-elements-borderColor',
        style.bg,
        'transition-all duration-200',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={classNames('text-lg', style.icon, style.color)} />
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-bolt-elements-textPrimary">{log.message}</div>
            {log.details && (
              <>
                <button
                  onClick={() => setLocalExpanded(!localExpanded)}
                  className="text-xs text-bolt-elements-textTertiary hover:text-[var(--vc-ide-accent-action)] transition-colors"
                >
                  {localExpanded ? t('settings.eventLogs.hideDetails') : t('settings.eventLogs.showDetails')}
                </button>
                {localExpanded && renderDetails(log.details)}
              </>
            )}
            <div className="flex items-center gap-2">
              <div className={classNames('px-2 py-0.5 rounded text-xs font-medium uppercase', style.badge)}>
                {formatLogLevel(log.level)}
              </div>
              {log.category && (
                <div className="px-2 py-0.5 rounded-full text-xs bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary">
                  {formatLogCategory(log.category)}
                </div>
              )}
            </div>
          </div>
        </div>
        {showTimestamp && <time className="shrink-0 text-xs text-bolt-elements-textTertiary">{timestamp}</time>}
      </div>
    </motion.div>
  );
};

interface ExportFormat {
  id: string;
  label: string;
  icon: string;
  handler: () => void;
}

export function EventLogsTab() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const languageRef = useRef(language);
  languageRef.current = language;

  const numberFormatter = useMemo(() => new Intl.NumberFormat(language), [language]);

  const logLevelOptions = useMemo<SelectOption[]>(
    () => logLevelOptionMetadata.map(({ labelKey, ...option }) => ({ ...option, label: t(labelKey) })),
    [t],
  );
  const localizedLogLevel = useCallback(
    (level: string) => logLevelOptions.find((option) => option.value === level)?.label ?? level,
    [logLevelOptions],
  );
  const localizedLogCategory = useCallback(
    (category: string | undefined) =>
      category ? (logLevelOptions.find((option) => option.value === category)?.label ?? category) : '',
    [logLevelOptions],
  );

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

    logStore.logInfo(t('settings.eventLogs.mounted'), {
      type: 'component_mount',
      message: t('settings.copy.eventLogsTabComponentMounted_74809440'),
      component: 'EventLogsTab',
    });

    return () => {
      const duration = performance.now() - startTime;
      logStore.logPerformanceMetric('EventLogsTab', 'mount-duration', duration, undefined, languageRef.current);
    };
  }, [t]);

  // Log filter changes
  const handleLevelFilterChange = useCallback(
    (newLevel: string) => {
      logStore.logInfo(t('settings.eventLogs.filterChanged'), {
        type: 'filter_change',
        message: t('settings.eventLogs.filterChangedFromTo', {
          from: selectedLevel,
          to: newLevel,
        }),
        component: 'EventLogsTab',
        previousLevel: selectedLevel,
        newLevel,
      });
      setSelectedLevel(newLevel as string);
      setShowLevelFilter(false);
    },
    [selectedLevel, t],
  );

  /*
   * Keep the latest logs/level in a ref so the debounced search-logging effect
   * can compute the result count WITHOUT depending on `filteredLogs.length`.
   * The effect below writes a log entry whose message embeds `searchQuery`; that
   * entry matches the active query and would bump `filteredLogs.length`, which —
   * if it were an effect dependency — re-fires the effect and produces an
   * indefinite once-per-second log/localStorage storm.
   */
  const searchCountInputsRef = useRef({ logs: Object.values(logs), selectedLevel });
  searchCountInputsRef.current = { logs: Object.values(logs), selectedLevel };

  // Log search changes with debounce (depends only on searchQuery — see ref note above)
  useEffect(() => {
    if (!searchQuery) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      const { logs: currentLogs, selectedLevel: currentLevel } = searchCountInputsRef.current;
      const resultsCount = countMatchingLogs(currentLogs, currentLevel, searchQuery);

      logStore.logInfo(t('settings.eventLogs.searchPerformed'), {
        type: 'search',
        message: t('settings.eventLogs.searchResults', { query: searchQuery, count: resultsCount }),
        component: 'EventLogsTab',
        query: searchQuery,
        resultsCount,
      });
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, t]);

  // Enhanced refresh handler
  const handleRefresh = useCallback(async () => {
    const startTime = performance.now();
    setIsRefreshing(true);

    try {
      await logStore.refreshLogs();

      const duration = performance.now() - startTime;

      logStore.logSuccess(t('settings.eventLogs.refreshSucceeded'), {
        type: 'refresh',
        message: t('settings.eventLogs.refreshedCount', { count: Object.keys(logs).length }),
        component: 'EventLogsTab',
        duration,
        logsCount: Object.keys(logs).length,
      });
    } catch (error) {
      logStore.logError(t('settings.copy.failedToRefreshLogs_79d8216b'), error, {
        type: 'refresh_error',
        message: t('settings.copy.failedToRefreshLogs_79d8216b'),
        component: 'EventLogsTab',
      });
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [logs, t]);

  // Log preference changes
  const handlePreferenceChange = useCallback(
    (type: string, value: boolean) => {
      logStore.logInfo(t('settings.eventLogs.preferenceChanged'), {
        type: 'preference_change',
        message: t('settings.eventLogs.preferenceChangedValue', {
          preference: type,
          value: value ? t('settings.eventLogs.enabled') : t('settings.eventLogs.disabled'),
        }),
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
    },
    [t],
  );

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

  // Export functions
  const exportAsJSON = () => {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        logs: filteredLogs,
        filters: {
          level: selectedLevel,
          searchQuery,
        },
        preferences: {
          use24Hour,
          showTimestamps,
          autoExpand,
        },
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename('json');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(t('settings.copy.eventLogsExportedSuccessfullyAsJson_579caf28'));
    } catch (error) {
      console.error('Failed to export JSON:', error);
      toast.error(t('settings.copy.failedToExportEventLogsAsJson_688cb79e'));
    }
  };

  const exportAsCSV = () => {
    try {
      // Convert logs to CSV format
      const headers = [
        t('settings.eventLogs.export.timestamp'),
        t('settings.eventLogs.export.level'),
        t('settings.eventLogs.export.category'),
        t('settings.eventLogs.export.message'),
        t('settings.copy.details_45989de4'),
      ];

      const csvData = [
        headers,
        ...filteredLogs.map((log) => [
          new Date(log.timestamp).toISOString(),
          localizedLogLevel(log.level),
          localizedLogCategory(log.category),
          log.message,
          log.details ? JSON.stringify(log.details) : '',
        ]),
      ];

      /*
       * Neutralise CSV formula injection: a cell starting with = + - @ (or a
       * tab/CR) is executed as a formula by Excel/Sheets, and log fields can carry
       * attacker-influenced text (provider errors, captured URLs). Prefix such
       * cells with a single quote before the usual quote-escaping.
       */
      const sanitizeCsvCell = (value: unknown) => {
        const str = String(value);
        const escaped = (/^[=+\-@\t\r]/.test(str) ? `'${str}` : str).replace(/"/g, '""');

        return `"${escaped}"`;
      };

      const csvContent = csvData.map((row) => row.map(sanitizeCsvCell).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename('csv');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(t('settings.copy.eventLogsExportedSuccessfullyAsCsv_30c55a12'));
    } catch (error) {
      console.error('Failed to export CSV:', error);
      toast.error(t('settings.copy.failedToExportEventLogsAsCsv_5cf55eb1'));
    }
  };

  const exportAsPDF = () => {
    try {
      // Create new PDF document
      const doc = new jsPDF();
      const lineHeight = 7;

      let yPos = 20;

      const margin = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const maxLineWidth = pageWidth - 2 * margin;

      // Helper function to add section header
      const addSectionHeader = (title: string) => {
        // Check if we need a new page
        if (yPos > doc.internal.pageSize.getHeight() - 30) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFillColor('#F3F4F6');
        doc.rect(margin - 2, yPos - 5, pageWidth - 2 * (margin - 2), lineHeight + 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#111827');
        doc.setFontSize(12);
        doc.text(title.toUpperCase(), margin, yPos);
        yPos += lineHeight * 2;
      };

      // Add title and header
      doc.setFillColor('#0099FF');
      doc.rect(0, 0, pageWidth, 50, 'F');
      doc.setTextColor('#FFFFFF');
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text(t('settings.eventLogs.report.title'), margin, 35);

      // Add subtitle with the E-Code brand
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(t('settings.eventLogs.report.subtitle'), margin, 45);
      yPos = 70;

      // Add report summary section
      addSectionHeader(t('settings.eventLogs.report.summary'));

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#374151');

      const summaryItems = [
        {
          label: t('settings.copy.generated_827ec8d9'),
          value: new Date().toLocaleString(language),
        },
        { label: t('settings.copy.totalLogs_f86b077f'), value: numberFormatter.format(filteredLogs.length) },
        {
          label: t('settings.copy.filterApplied_d16fe413'),
          value: selectedLevelOption?.label ?? t('settings.copy.allTypes_bc013254'),
        },
        { label: t('settings.copy.searchQuery_3ad6e0f4'), value: searchQuery || t('settings.eventLogs.none') },
        {
          label: t('settings.copy.timeFormat_c93f7ba4'),
          value: use24Hour ? t('settings.eventLogs.time24Hour') : t('settings.eventLogs.time12Hour'),
        },
      ];

      summaryItems.forEach((item) => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${item.label}:`, margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(item.value, margin + 60, yPos);
        yPos += lineHeight;
      });

      yPos += lineHeight * 2;

      // Add statistics section
      addSectionHeader(t('settings.eventLogs.report.statistics'));

      // Calculate statistics
      const stats = {
        error: filteredLogs.filter((log) => log.level === 'error').length,
        warning: filteredLogs.filter((log) => log.level === 'warning').length,
        info: filteredLogs.filter((log) => log.level === 'info').length,
        debug: filteredLogs.filter((log) => log.level === 'debug').length,
        provider: filteredLogs.filter((log) => log.category === 'provider').length,
        api: filteredLogs.filter((log) => log.category === 'api').length,
      };

      // Create two columns for statistics
      const leftStats = [
        { label: t('settings.copy.errorLogs_37fc7c24'), value: stats.error, color: '#DC2626' },
        { label: t('settings.copy.warningLogs_62688b9a'), value: stats.warning, color: '#F59E0B' },
        { label: t('settings.copy.infoLogs_01608239'), value: stats.info, color: '#3B82F6' },
      ];

      const rightStats = [
        { label: t('settings.copy.debugLogs_c16db1ad'), value: stats.debug, color: '#6B7280' },
        { label: t('settings.copy.llmLogs_32aba768'), value: stats.provider, color: '#10B981' },
        { label: t('settings.copy.apiLogs_9d1c6cd5'), value: stats.api, color: '#3B82F6' },
      ];

      const colWidth = (pageWidth - 2 * margin) / 2;

      // Draw statistics in two columns
      leftStats.forEach((stat, index) => {
        doc.setTextColor(stat.color);
        doc.setFont('helvetica', 'bold');
        doc.text(numberFormatter.format(stat.value), margin, yPos);
        doc.setTextColor('#374151');
        doc.setFont('helvetica', 'normal');
        doc.text(stat.label, margin + 20, yPos);

        if (rightStats[index]) {
          doc.setTextColor(rightStats[index].color);
          doc.setFont('helvetica', 'bold');
          doc.text(numberFormatter.format(rightStats[index].value), margin + colWidth, yPos);
          doc.setTextColor('#374151');
          doc.setFont('helvetica', 'normal');
          doc.text(rightStats[index].label, margin + colWidth + 20, yPos);
        }

        yPos += lineHeight;
      });

      yPos += lineHeight * 2;

      // Add logs section
      addSectionHeader(t('settings.eventLogs.report.logs'));

      // Helper function to add a log entry with improved formatting
      const addLogEntry = (log: LogEntry) => {
        const entryHeight = 20 + (log.details ? 40 : 0); // Estimate entry height

        // Check if we need a new page
        if (yPos + entryHeight > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          yPos = margin;
        }

        // Add timestamp and level
        const timestamp = new Date(log.timestamp).toLocaleString(language, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: !use24Hour,
        });

        // Draw log level badge background
        const levelColors: Record<string, string> = {
          error: '#FEE2E2',
          warning: '#FEF3C7',
          info: '#DBEAFE',
          debug: '#F3F4F6',
        };

        const textColors: Record<string, string> = {
          error: '#DC2626',
          warning: '#F59E0B',
          info: '#3B82F6',
          debug: '#6B7280',
        };

        const levelWidth = doc.getTextWidth(log.level.toUpperCase()) + 10;
        doc.setFillColor(levelColors[log.level] || '#F3F4F6');
        doc.roundedRect(margin, yPos - 4, levelWidth, lineHeight + 4, 1, 1, 'F');

        // Add log level text
        doc.setTextColor(textColors[log.level] || '#6B7280');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(localizedLogLevel(log.level).toUpperCase(), margin + 5, yPos);

        // Add timestamp
        doc.setTextColor('#6B7280');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(timestamp, margin + levelWidth + 10, yPos);

        // Add category if present
        if (log.category) {
          const categoryX = margin + levelWidth + doc.getTextWidth(timestamp) + 20;
          doc.setFillColor('#F3F4F6');

          const categoryWidth = doc.getTextWidth(log.category) + 10;
          doc.roundedRect(categoryX, yPos - 4, categoryWidth, lineHeight + 4, 2, 2, 'F');
          doc.setTextColor('#6B7280');
          doc.text(localizedLogCategory(log.category), categoryX + 5, yPos);
        }

        yPos += lineHeight * 1.5;

        // Add message
        doc.setTextColor('#111827');
        doc.setFontSize(10);

        const messageLines = doc.splitTextToSize(log.message, maxLineWidth - 10);
        doc.text(messageLines, margin + 5, yPos);
        yPos += messageLines.length * lineHeight;

        // Add details if present
        if (log.details) {
          doc.setTextColor('#6B7280');
          doc.setFontSize(8);

          const detailsStr = JSON.stringify(log.details, null, 2);
          const detailsLines = doc.splitTextToSize(detailsStr, maxLineWidth - 15);

          // Add details background
          doc.setFillColor('#F9FAFB');
          doc.roundedRect(margin + 5, yPos - 2, maxLineWidth - 10, detailsLines.length * lineHeight + 8, 1, 1, 'F');

          doc.text(detailsLines, margin + 10, yPos + 4);
          yPos += detailsLines.length * lineHeight + 10;
        }

        // Add separator line
        doc.setDrawColor('#E5E7EB');
        doc.setLineWidth(0.1);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += lineHeight * 1.5;
      };

      // Add all logs
      filteredLogs.forEach((log) => {
        addLogEntry(log);
      });

      // Add footer to all pages
      const totalPages = doc.internal.pages.length - 1;

      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor('#9CA3AF');

        // Add page numbers
        doc.text(
          t('settings.eventLogs.report.page', {
            page: numberFormatter.format(i),
            total: numberFormatter.format(totalPages),
          }),
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          {
            align: 'center',
          },
        );

        // Add footer text
        doc.text(t('settings.eventLogs.report.generatedBy'), margin, doc.internal.pageSize.getHeight() - 10);

        const dateStr = new Date().toLocaleDateString(language);
        doc.text(dateStr, pageWidth - margin, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
      }

      // Save the PDF
      doc.save(buildExportFilename('pdf'));
      toast.success(t('settings.copy.eventLogsExportedSuccessfullyAsPdf_9ad55a8c'));
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error(t('settings.copy.failedToExportEventLogsAsPdf_df552b5e'));
    }
  };

  const exportAsText = () => {
    try {
      const textContent = filteredLogs
        .map((log) => {
          const timestamp = new Date(log.timestamp).toLocaleString(language);

          let content = `[${timestamp}] ${localizedLogLevel(log.level).toUpperCase()}: ${log.message}\n`;

          if (log.category) {
            content += `${t('settings.eventLogs.export.category')}: ${localizedLogCategory(log.category)}\n`;
          }

          if (log.details) {
            content += `${t('settings.copy.details_45989de4')}:\n${JSON.stringify(log.details, null, 2)}\n`;
          }

          return content + '-'.repeat(80) + '\n';
        })
        .join('\n');

      const blob = new Blob([textContent], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename('txt');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(t('settings.copy.eventLogsExportedSuccessfullyAsTextFile_242b23e1'));
    } catch (error) {
      console.error('Failed to export text file:', error);
      toast.error(t('settings.copy.failedToExportEventLogsAsTextFile_d5289ad5'));
    }
  };

  const exportFormats: ExportFormat[] = [
    {
      id: 'json',
      label: t('settings.copy.exportAsJson_b72e8628'),
      icon: 'i-ph:file-js',
      handler: exportAsJSON,
    },
    {
      id: 'csv',
      label: t('settings.copy.exportAsCsv_868da409'),
      icon: 'i-ph:file-csv',
      handler: exportAsCSV,
    },
    {
      id: 'pdf',
      label: t('settings.copy.exportAsPdf_1bf78687'),
      icon: 'i-ph:file-pdf',
      handler: exportAsPDF,
    },
    {
      id: 'txt',
      label: t('settings.copy.exportAsText_515f8e2c'),
      icon: 'i-ph:file-text',
      handler: exportAsText,
    },
  ];

  const ExportButton = () => {
    const [isOpen, setIsOpen] = useState(false);

    const handleOpenChange = useCallback((open: boolean) => {
      setIsOpen(open);
    }, []);

    const handleFormatClick = useCallback((handler: () => void) => {
      handler();
      setIsOpen(false);
    }, []);

    return (
      <DialogRoot open={isOpen} onOpenChange={handleOpenChange}>
        <button
          onClick={() => setIsOpen(true)}
          className={classNames(
            'group flex items-center gap-2',
            'rounded-lg px-3 py-1.5',
            'text-sm text-bolt-elements-textPrimary',
            'bg-bolt-elements-background-depth-2',
            'border border-bolt-elements-borderColor',
            'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
            'transition-all duration-200',
          )}
        >
          <span className="i-ph:download text-lg text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors" />
          {t('settings.copy.export_36648955')}
        </button>

        <Dialog showCloseButton>
          <div className="p-6">
            <DialogTitle className="flex items-center gap-2">
              <div className="i-ph:download w-5 h-5" />
              {t('settings.copy.exportEventLogs_8902a9a9')}
            </DialogTitle>

            <div className="mt-4 flex flex-col gap-2">
              {exportFormats.map((format) => (
                <button
                  key={format.id}
                  onClick={() => handleFormatClick(format.handler)}
                  className={classNames(
                    'flex items-center gap-3 px-4 py-3 text-sm rounded-lg transition-colors w-full text-left',
                    'bg-bolt-elements-background-depth-2',
                    'border border-bolt-elements-borderColor',
                    'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_8%,transparent)]',
                    'hover:border-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)]',
                    'text-bolt-elements-textPrimary',
                  )}
                >
                  <div className={classNames(format.icon, 'w-5 h-5')} />
                  <div>
                    <div className="font-medium">{format.label}</div>
                    <div className="text-xs text-bolt-elements-textSecondary mt-0.5">
                      {format.id === 'json' && t('settings.eventLogs.export.description.json')}
                      {format.id === 'csv' && t('settings.eventLogs.export.description.csv')}
                      {format.id === 'pdf' && t('settings.eventLogs.export.description.pdf')}
                      {format.id === 'txt' && t('settings.eventLogs.export.description.text')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </Dialog>
      </DialogRoot>
    );
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DropdownMenu.Root open={showLevelFilter} onOpenChange={setShowLevelFilter}>
          <DropdownMenu.Trigger asChild>
            <button
              className={classNames(
                'flex items-center gap-2',
                'rounded-lg px-3 py-1.5',
                'text-sm text-bolt-elements-textPrimary',
                'bg-bolt-elements-background-depth-2',
                'border border-bolt-elements-borderColor',
                'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
                'transition-all duration-200',
              )}
            >
              <span
                className={classNames('text-lg', selectedLevelOption?.icon || 'i-ph:funnel')}
                style={{ color: selectedLevelOption?.color }}
              />
              {selectedLevelOption?.label || t('settings.copy.allTypes_bc013254')}
              <span className="i-ph:caret-down text-lg text-bolt-elements-textTertiary" />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[min(200px,calc(100vw-24px))] max-w-[calc(100vw-24px)] max-h-[min(420px,calc(100dvh-24px))] overflow-auto bg-bolt-elements-background-depth-2 rounded-lg shadow-lg py-1 z-[250] animate-in fade-in-0 zoom-in-95 border border-bolt-elements-borderColor"
              sideOffset={5}
              align="start"
              side="bottom"
              collisionPadding={12}
              hideWhenDetached
            >
              {logLevelOptions.map((option) => (
                <DropdownMenu.Item
                  key={option.value}
                  className="group flex items-center px-4 py-2.5 text-sm text-bolt-elements-textSecondary hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] cursor-pointer transition-colors"
                  onClick={() => handleLevelFilterChange(option.value)}
                >
                  <div className="mr-3 flex h-5 w-5 items-center justify-center">
                    <div
                      className={classNames(
                        option.icon,
                        'text-lg group-hover:text-[var(--vc-ide-accent-action)] transition-colors',
                      )}
                      style={{ color: option.color }}
                    />
                  </div>
                  <span className="group-hover:text-[var(--vc-ide-accent-action)] transition-colors">
                    {option.label}
                  </span>
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
              className="data-[state=checked]:bg-[var(--vc-ide-accent-action)]"
            />
            <span className="text-sm text-bolt-elements-textTertiary">
              {t('settings.copy.showTimestamps_9c3d1eec')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={use24Hour}
              onCheckedChange={(value) => handlePreferenceChange('24hour', value)}
              className="data-[state=checked]:bg-[var(--vc-ide-accent-action)]"
            />
            <span className="text-sm text-bolt-elements-textTertiary">{t('settings.copy.24hTime_470f9d70')}</span>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={autoExpand}
              onCheckedChange={(value) => handlePreferenceChange('autoExpand', value)}
              className="data-[state=checked]:bg-[var(--vc-ide-accent-action)]"
            />
            <span className="text-sm text-bolt-elements-textTertiary">{t('settings.copy.autoExpand_59e4afa4')}</span>
          </div>

          <div className="w-px h-4 bg-bolt-elements-borderColor" />

          <button
            onClick={handleRefresh}
            className={classNames(
              'group flex items-center gap-2',
              'rounded-lg px-3 py-1.5',
              'text-sm text-bolt-elements-textPrimary',
              'bg-bolt-elements-background-depth-2',
              'border border-bolt-elements-borderColor',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)]',
              'transition-all duration-200',
            )}
          >
            <span
              className={classNames(
                'i-ph:arrows-clockwise text-lg text-bolt-elements-textTertiary group-hover:text-[var(--vc-ide-accent-action)] transition-colors',
                { 'animate-spin': isRefreshing },
              )}
            />
            {t('settings.copy.refresh_0e916101')}
          </button>

          <ExportButton />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative">
          <input
            type="text"
            aria-label={t('settings.copy.searchEventLogs_412aa8ae')}
            placeholder={t('settings.copy.searchLogs_7dd1b345')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={classNames(
              'w-full px-4 py-2 pl-10 rounded-lg',
              'bg-bolt-elements-background-depth-2',
              'border border-bolt-elements-borderColor',
              'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
              'focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-focus-ring)] focus:border-[var(--vc-ide-accent-action)]',
              'transition-all duration-200',
            )}
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <div className="i-ph:magnifying-glass text-lg text-bolt-elements-textTertiary" />
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={classNames(
              'flex flex-col items-center justify-center gap-4',
              'rounded-lg p-8 text-center',
              'bg-bolt-elements-background-depth-2',
              'border border-bolt-elements-borderColor',
            )}
          >
            <span className="i-ph:clipboard-text text-4xl text-bolt-elements-textTertiary" />
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary">
                {t('settings.copy.noLogsFound_28a52bc6')}
              </h3>
              <p className="text-sm text-bolt-elements-textTertiary">
                {t('settings.copy.tryAdjustingYourSearchOrFilters_54f7b4c2')}
              </p>
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
