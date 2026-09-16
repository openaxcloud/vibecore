import Cookies from 'js-cookie';
import { atom, map } from 'nanostores';
import {
  clientStoresServicesText,
  resolveClientStoresServicesLanguage,
  type ClientStoresServicesKey,
} from '~/lib/i18n/catalogs/client-stores-services';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('LogStore');

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  details?: Record<string, any>;
  category:
    | 'system'
    | 'provider'
    | 'user'
    | 'error'
    | 'api'
    | 'auth'
    | 'database'
    | 'network'
    | 'performance'
    | 'settings'
    | 'task'
    | 'update'
    | 'feature';
  subCategory?: string;
  duration?: number;
  statusCode?: number;
  source?: string;
  stack?: string;
  metadata?: {
    component?: string;
    action?: string;
    userId?: string;
    sessionId?: string;
    previousValue?: any;
    newValue?: any;
  };
}

interface LogDetails extends Record<string, any> {
  type: string;
  message: string;
}

const MAX_LOGS = 1000; // Maximum number of logs to keep in memory
const LOG_STORAGE_KEY = 'eventLogs';

/*
 * BUG-B (live 23/08) — the persisted `eventLogs` key grew to ~0.4 MB (entries
 * embed full API request/response payloads; MAX_LOGS only bounds the COUNT, not
 * the bytes) and, on a browser whose localStorage was already crowded, threw
 * `QuotaExceededError: setItem 'eventLogs' exceeded the quota` on every write.
 * Cap the SERIALIZED size before writing, and treat storage as best-effort:
 * when the browser still refuses, purge our own key and retry once with a
 * minimal tail — never let diagnostics break the IDE.
 */
export const MAX_LOGS_STORAGE_CHARS = 128 * 1024; // ~256 KB in UTF-16 storage

const EMERGENCY_LOGS_STORAGE_CHARS = 16 * 1024; // retry size once the quota already blew

/**
 * Serialize the newest logs so the payload stays under `maxChars`, dropping the
 * oldest entries first. Pure and exported so the cap is unit-testable.
 */
export function serializeLogsWithinBudget(
  logs: Record<string, LogEntry>,
  maxChars: number = MAX_LOGS_STORAGE_CHARS,
): { serialized: string; dropped: number } {
  let entries = Object.entries(logs).sort(
    ([, a], [, b]) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  ); // oldest first

  let serialized = JSON.stringify(Object.fromEntries(entries));
  let dropped = 0;

  while (serialized.length > maxChars && entries.length > 0) {
    // Drop the oldest half each round: converges in O(log n) serializations.
    const dropCount = Math.max(1, Math.ceil(entries.length / 2));
    entries = entries.slice(dropCount);
    dropped += dropCount;
    serialized = JSON.stringify(Object.fromEntries(entries));
  }

  return { serialized, dropped };
}

export type AuthLogAction = 'login' | 'logout' | 'token_refresh' | 'key_validation';
export type NetworkLogStatus = 'online' | 'offline' | 'reconnecting' | 'connected';

const AUTH_ACTION_KEYS: Readonly<Record<AuthLogAction, ClientStoresServicesKey>> = {
  login: 'clientStores.logs.auth.action.login',
  logout: 'clientStores.logs.auth.action.logout',
  token_refresh: 'clientStores.logs.auth.action.tokenRefresh',
  key_validation: 'clientStores.logs.auth.action.keyValidation',
};

const NETWORK_STATUS_KEYS: Readonly<Record<NetworkLogStatus, ClientStoresServicesKey>> = {
  online: 'clientStores.logs.network.status.online',
  offline: 'clientStores.logs.network.status.offline',
  reconnecting: 'clientStores.logs.network.status.reconnecting',
  connected: 'clientStores.logs.network.status.connected',
};

function formatLogResult(success: boolean, language?: string | null): string {
  return clientStoresServicesText(
    success ? 'clientStores.logs.result.success' : 'clientStores.logs.result.failed',
    {},
    language,
  );
}

export function formatAuthLogMessage(action: AuthLogAction, success: boolean, language?: string | null): string {
  return clientStoresServicesText(
    'clientStores.logs.auth.message',
    {
      action: clientStoresServicesText(AUTH_ACTION_KEYS[action], {}, language),
      result: formatLogResult(success, language),
    },
    language,
  );
}

export function formatNetworkLogMessage(status: NetworkLogStatus, language?: string | null): string {
  return clientStoresServicesText(
    'clientStores.logs.network.message',
    { status: clientStoresServicesText(NETWORK_STATUS_KEYS[status], {}, language) },
    language,
  );
}

export function formatDatabaseLogMessage(
  operation: string,
  success: boolean,
  duration: number,
  language?: string | null,
): string {
  const resolvedLanguage = resolveClientStoresServicesLanguage(language);
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;

  const formattedDuration =
    resolvedLanguage === 'fr'
      ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(safeDuration)
      : String(safeDuration);

  return clientStoresServicesText(
    'clientStores.logs.database.message',
    { operation, result: formatLogResult(success, resolvedLanguage), duration: formattedDuration },
    resolvedLanguage,
  );
}

export function formatPerformanceLogMessage(
  component: string,
  operation: string,
  duration: number,
  language?: string | null,
): string {
  const resolvedLanguage = resolveClientStoresServicesLanguage(language);

  const formattedDuration = new Intl.NumberFormat(resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(duration) ? Math.max(0, duration) : 0);

  return clientStoresServicesText(
    'clientStores.logs.performanceMetric',
    { component, operation, duration: formattedDuration },
    resolvedLanguage,
  );
}

class LogStore {
  private _logs = map<Record<string, LogEntry>>({});
  showLogs = atom(true);
  private _readLogs = new Set<string>();

  constructor() {
    // Load saved logs from cookies on initialization
    this._loadLogs();

    // Only load read logs in browser environment
    if (typeof window !== 'undefined') {
      this._loadReadLogs();
    }
  }

  // Expose the logs store for subscription
  get logs() {
    return this._logs;
  }

  private _loadLogs() {
    if (typeof window === 'undefined') {
      return;
    }

    /*
     * Migrate off the legacy cookie: it was sent on every same-origin request
     * (see _saveLogs) and could blow past the ~4KB cookie limit / trigger 431s.
     */
    const legacyCookie = Cookies.get(LOG_STORAGE_KEY);

    if (legacyCookie) {
      Cookies.remove(LOG_STORAGE_KEY);
    }

    const savedLogs = localStorage.getItem(LOG_STORAGE_KEY) ?? legacyCookie;

    if (savedLogs) {
      try {
        const parsedLogs = JSON.parse(savedLogs);
        this._logs.set(parsedLogs);
      } catch (error) {
        logger.error('Failed to parse logs from storage:', error);
      }
    }
  }

  private _loadReadLogs() {
    if (typeof window === 'undefined') {
      return;
    }

    const savedReadLogs = localStorage.getItem('bolt_read_logs');

    if (savedReadLogs) {
      try {
        const parsedReadLogs = JSON.parse(savedReadLogs);
        this._readLogs = new Set(parsedReadLogs);
      } catch (error) {
        logger.error('Failed to parse read logs:', error);
      }
    }
  }

  private _saveLogs() {
    if (typeof window === 'undefined') {
      return;
    }

    /*
     * Persist to localStorage, NOT a cookie: these client-only diagnostic logs
     * (up to MAX_LOGS entries embedding full API request/response payloads) must
     * never be attached to outgoing HTTP requests. The payload is capped in
     * bytes BEFORE the write (see serializeLogsWithinBudget).
     */
    try {
      const { serialized } = serializeLogsWithinBudget(this._logs.get());
      localStorage.setItem(LOG_STORAGE_KEY, serialized);
    } catch (error) {
      /*
       * QuotaExceeded etc. — logging must never throw into the caller. And the
       * storage is FULL: leaving the old oversized value in place would make
       * every future write fail too (live 23/08). Auto-purge our own key and
       * retry once with a minimal tail; if even that fails, give up persisting.
       */
      try {
        localStorage.removeItem(LOG_STORAGE_KEY);

        const { serialized: tail } = serializeLogsWithinBudget(this._logs.get(), EMERGENCY_LOGS_STORAGE_CHARS);
        localStorage.setItem(LOG_STORAGE_KEY, tail);
      } catch {
        // Storage is unusable; in-memory logs keep working.
      }

      logger.error('Failed to persist logs to storage:', error);
    }
  }

  private _saveReadLogs() {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem('bolt_read_logs', JSON.stringify(Array.from(this._readLogs)));
    } catch (error) {
      /*
       * This setItem was UNPROTECTED: `_addLog` → `_trimLogs` → `_saveReadLogs`,
       * so on a saturated browser a QuotaExceededError here propagated into
       * whatever component merely tried to LOG something (BUG-B, live 23/08).
       */
      logger.error('Failed to persist read-marker logs to storage:', error);
    }
  }

  private _generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private _trimLogs() {
    const currentLogs = Object.entries(this._logs.get());

    if (currentLogs.length > MAX_LOGS) {
      const sortedLogs = currentLogs.sort(
        ([, a], [, b]) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      const newLogs = Object.fromEntries(sortedLogs.slice(0, MAX_LOGS));
      this._logs.set(newLogs);

      // Prune read-marker ids for logs that no longer exist so _readLogs can't grow unbounded.
      if (this._readLogs.size > 0) {
        const retainedIds = new Set(Object.keys(newLogs));

        let prunedAny = false;

        for (const readId of this._readLogs) {
          if (!retainedIds.has(readId)) {
            this._readLogs.delete(readId);
            prunedAny = true;
          }
        }

        if (prunedAny) {
          this._saveReadLogs();
        }
      }
    }
  }

  // Base log method for general logging
  private _addLog(
    message: string,
    level: LogEntry['level'],
    category: LogEntry['category'],
    details?: Record<string, any>,
    metadata?: LogEntry['metadata'],
  ) {
    const id = this._generateId();

    const entry: LogEntry = {
      id,
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
      category,
      metadata,
    };

    this._logs.setKey(id, entry);
    this._trimLogs();
    this._saveLogs();

    return id;
  }

  // Specialized method for API logging
  private _addApiLog(
    message: string,
    method: string,
    url: string,
    details: {
      method: string;
      url: string;
      statusCode: number;
      duration: number;
      request: any;
      response: any;
    },
  ) {
    const statusCode = details.statusCode;
    return this._addLog(message, statusCode >= 400 ? 'error' : 'info', 'api', details, {
      component: 'api',
      action: method,
    });
  }

  // System events
  logSystem(message: string, details?: Record<string, any>) {
    return this._addLog(message, 'info', 'system', details);
  }

  // Provider events
  logProvider(message: string, details?: Record<string, any>) {
    return this._addLog(message, 'info', 'provider', details);
  }

  // User actions
  logUserAction(message: string, details?: Record<string, any>) {
    return this._addLog(message, 'info', 'user', details);
  }

  // API Connection Logging
  logAPIRequest(endpoint: string, method: string, duration: number, statusCode: number, details?: Record<string, any>) {
    const message = `${method} ${endpoint} - ${statusCode} (${duration}ms)`;
    const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warning' : 'info';

    return this._addLog(message, level, 'api', {
      ...details,
      endpoint,
      method,
      duration,
      statusCode,
      timestamp: new Date().toISOString(),
    });
  }

  // Authentication Logging
  logAuth(action: AuthLogAction, success: boolean, details?: Record<string, any>, language?: string | null) {
    const message = formatAuthLogMessage(action, success, language);
    const level = success ? 'info' : 'error';

    return this._addLog(message, level, 'auth', {
      ...details,
      action,
      success,
      timestamp: new Date().toISOString(),
    });
  }

  // Network Status Logging
  logNetworkStatus(status: NetworkLogStatus, details?: Record<string, any>, language?: string | null) {
    const message = formatNetworkLogMessage(status, language);
    const level = status === 'offline' ? 'error' : status === 'reconnecting' ? 'warning' : 'info';

    return this._addLog(message, level, 'network', {
      ...details,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  // Database Operations Logging
  logDatabase(
    operation: string,
    success: boolean,
    duration: number,
    details?: Record<string, any>,
    language?: string | null,
  ) {
    const message = formatDatabaseLogMessage(operation, success, duration, language);
    const level = success ? 'info' : 'error';

    return this._addLog(message, level, 'database', {
      ...details,
      operation,
      success,
      duration,
      timestamp: new Date().toISOString(),
    });
  }

  // Error events
  logError(message: string, error?: Error | unknown, details?: Record<string, any>) {
    const errorDetails =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...details,
          }
        : { error, ...details };

    return this._addLog(message, 'error', 'error', errorDetails);
  }

  // Warning events
  logWarning(message: string, details?: Record<string, any>) {
    return this._addLog(message, 'warning', 'system', details);
  }

  // Debug events
  logDebug(message: string, details?: Record<string, any>) {
    return this._addLog(message, 'debug', 'system', details);
  }

  clearLogs() {
    this._logs.set({});
    this._saveLogs();
  }

  getLogs() {
    return Object.values(this._logs.get()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  getFilteredLogs(level?: LogEntry['level'], category?: LogEntry['category'], searchQuery?: string) {
    return this.getLogs().filter((log) => {
      const matchesLevel = !level || level === 'debug' || log.level === level;
      const matchesCategory = !category || log.category === category;

      const matchesSearch =
        !searchQuery ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        JSON.stringify(log.details ?? {})
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      return matchesLevel && matchesCategory && matchesSearch;
    });
  }

  markAsRead(logId: string) {
    this._readLogs.add(logId);
    this._saveReadLogs();
  }

  isRead(logId: string): boolean {
    return this._readLogs.has(logId);
  }

  clearReadLogs() {
    this._readLogs.clear();
    this._saveReadLogs();
  }

  // API interactions
  logApiCall(
    method: string,
    endpoint: string,
    statusCode: number,
    duration: number,
    requestData?: any,
    responseData?: any,
  ) {
    return this._addLog(
      `API ${method} ${endpoint}`,
      statusCode >= 400 ? 'error' : 'info',
      'api',
      {
        method,
        endpoint,
        statusCode,
        duration,
        request: requestData,
        response: responseData,
      },
      {
        component: 'api',
        action: method,
      },
    );
  }

  // Network operations
  logNetworkRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    requestData?: any,
    responseData?: any,
  ) {
    return this._addLog(
      `${method} ${url}`,
      statusCode >= 400 ? 'error' : 'info',
      'network',
      {
        method,
        url,
        statusCode,
        duration,
        request: requestData,
        response: responseData,
      },
      {
        component: 'network',
        action: method,
      },
    );
  }

  // Authentication events
  logAuthEvent(event: string, success: boolean, details?: Record<string, any>) {
    return this._addLog(
      `Auth ${event} ${success ? 'succeeded' : 'failed'}`,
      success ? 'info' : 'error',
      'auth',
      details,
      {
        component: 'auth',
        action: event,
      },
    );
  }

  // Performance tracking
  logPerformance(operation: string, duration: number, details?: Record<string, any>) {
    return this._addLog(
      `Performance: ${operation}`,
      duration > 1000 ? 'warning' : 'info',
      'performance',
      {
        operation,
        duration,
        ...details,
      },
      {
        component: 'performance',
        action: 'metric',
      },
    );
  }

  // Error handling
  logErrorWithStack(error: Error, category: LogEntry['category'] = 'error', details?: Record<string, any>) {
    return this._addLog(
      error.message,
      'error',
      category,
      {
        ...details,
        name: error.name,
        stack: error.stack,
      },
      {
        component: category,
        action: 'error',
      },
    );
  }

  // Refresh logs (useful for real-time updates)
  refreshLogs() {
    const currentLogs = this._logs.get();
    this._logs.set({ ...currentLogs });
  }

  // Enhanced logging methods
  logInfo(message: string, details: LogDetails) {
    return this._addLog(message, 'info', 'system', details);
  }

  logSuccess(message: string, details: LogDetails) {
    return this._addLog(message, 'info', 'system', { ...details, success: true });
  }

  logApiRequest(
    method: string,
    url: string,
    details: {
      method: string;
      url: string;
      statusCode: number;
      duration: number;
      request: any;
      response: any;
    },
  ) {
    return this._addApiLog(`API ${method} ${url}`, method, url, details);
  }

  logSettingsChange(component: string, setting: string, oldValue: any, newValue: any) {
    return this._addLog(
      `Settings changed in ${component}: ${setting}`,
      'info',
      'settings',
      {
        setting,
        previousValue: oldValue,
        newValue,
      },
      {
        component,
        action: 'settings_change',
        previousValue: oldValue,
        newValue,
      },
    );
  }

  logFeatureToggle(featureId: string, enabled: boolean) {
    return this._addLog(
      `Feature ${featureId} ${enabled ? 'enabled' : 'disabled'}`,
      'info',
      'feature',
      { featureId, enabled },
      {
        component: 'features',
        action: 'feature_toggle',
      },
    );
  }

  logTaskOperation(taskId: string, operation: string, status: string, details?: any) {
    return this._addLog(
      `Task ${taskId}: ${operation} - ${status}`,
      'info',
      'task',
      { taskId, operation, status, ...details },
      {
        component: 'task-manager',
        action: 'task_operation',
      },
    );
  }

  logProviderAction(provider: string, action: string, success: boolean, details?: any) {
    return this._addLog(
      `Provider ${provider}: ${action} - ${success ? 'Success' : 'Failed'}`,
      success ? 'info' : 'error',
      'provider',
      { provider, action, success, ...details },
      {
        component: 'providers',
        action: 'provider_action',
      },
    );
  }

  logPerformanceMetric(
    component: string,
    operation: string,
    duration: number,
    details?: any,
    language?: string | null,
  ) {
    return this._addLog(
      formatPerformanceLogMessage(component, operation, duration, language),
      duration > 1000 ? 'warning' : 'info',
      'performance',
      { component, operation, duration, ...details },
      {
        component,
        action: 'performance_metric',
      },
    );
  }
}

export const logStore = new LogStore();
