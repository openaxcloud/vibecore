export interface DebugWarning {
  id: string;
  message: string;
  timestamp: string;
  code: string;
}

export interface DebugError {
  id: string;
  message: string;
  timestamp: string;
  stack?: string;
}

export interface DebugStatus {
  warnings: DebugIssue[];
  errors: DebugIssue[];
}

export interface DebugIssue {
  id: string;
  message: string;
  type: 'warning' | 'error';
  timestamp: string;
  details?: Record<string, unknown>;
}

// Keep track of acknowledged issues
const acknowledgedIssues = new Set<string>();

export const getDebugStatus = async (): Promise<DebugStatus> => {
  const i18n = getI18nInstance();
  const copy = getClientRuntimeResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  const issues: DebugStatus = {
    warnings: [],
    errors: [],
  };

  try {
    // Check memory usage
    if (performance && 'memory' in performance) {
      const memory = (performance as any).memory;

      if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.8) {
        issues.warnings.push({
          id: 'high-memory-usage',
          message: copy['clientRuntime.debug.highMemory'],
          type: 'warning',
          timestamp: new Date().toISOString(),
          details: {
            used: memory.usedJSHeapSize,
            total: memory.jsHeapSizeLimit,
          },
        });
      }
    }

    // Check storage quota
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usageRatio = (estimate.usage || 0) / (estimate.quota || 1);

      if (usageRatio > 0.9) {
        issues.warnings.push({
          id: 'storage-quota-warning',
          message: copy['clientRuntime.debug.storageQuota'],
          type: 'warning',
          timestamp: new Date().toISOString(),
          details: {
            used: estimate.usage,
            quota: estimate.quota,
          },
        });
      }
    }

    // Check for console errors (if any)
    const errorLogs = localStorage.getItem('error_logs');

    if (errorLogs) {
      const errors: unknown = JSON.parse(errorLogs);

      if (Array.isArray(errors)) {
        for (const error of errors) {
          if (!error || typeof error !== 'object' || !('timestamp' in error) || typeof error.timestamp !== 'string') {
            continue;
          }

          issues.errors.push({
            id: `error-${error.timestamp}`,
            message: copy['clientRuntime.debug.recordedError'],
            type: 'error',
            timestamp: error.timestamp,
          });
        }
      }
    }

    // Filter out acknowledged issues
    issues.warnings = issues.warnings.filter((warning) => !acknowledgedIssues.has(warning.id));
    issues.errors = issues.errors.filter((error) => !acknowledgedIssues.has(error.id));

    return issues;
  } catch (error) {
    console.error('Error getting debug status:', error);
    return issues;
  }
};

export const acknowledgeWarning = async (id: string): Promise<void> => {
  acknowledgedIssues.add(id);
};

export const acknowledgeError = async (id: string): Promise<void> => {
  acknowledgedIssues.add(id);

  // Also remove from error logs if present
  try {
    const errorLogs = localStorage.getItem('error_logs');

    if (errorLogs) {
      const errors = JSON.parse(errorLogs);
      const updatedErrors = errors.filter((error: any) => `error-${error.timestamp}` !== id);
      localStorage.setItem('error_logs', JSON.stringify(updatedErrors));
    }
  } catch (error) {
    console.error('Error acknowledging error:', error);
  }
};
import { getClientRuntimeResidualCopy } from '~/lib/i18n/catalogs/client-runtime-residual';
import { getI18nInstance } from '~/lib/i18n/runtime';
