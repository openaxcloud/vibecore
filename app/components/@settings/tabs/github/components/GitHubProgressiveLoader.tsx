import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronDown, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import React, { useState, useCallback, useEffect, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import {
  formatSettingsStatusNumber,
  formatSettingsStatusSurfacesCopy,
  getSettingsStatusSurfacesCopy,
} from '~/lib/i18n/catalogs/settings-status-surfaces';
import { classNames } from '~/utils/classNames';

interface ProgressiveLoaderProps {
  isLoading: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void;
  children: React.ReactNode;
  className?: string;
  loadingMessage?: string;
  refreshingMessage?: string;
  showProgress?: boolean;
  progressSteps?: Array<{
    key: string;
    label: string;
    completed: boolean;
    loading?: boolean;
    error?: boolean;
  }>;
}

export function GitHubProgressiveLoader({
  isLoading,
  isRefreshing = false,
  error,
  onRetry,
  onRefresh,
  children,
  className = '',
  loadingMessage,
  refreshingMessage,
  showProgress = false,
  progressSteps = [],
}: ProgressiveLoaderProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getSettingsStatusSurfacesCopy(language);
  const [isExpanded, setIsExpanded] = useState(false);
  const progressStepsId = useId();
  const resolvedLoadingMessage = loadingMessage ?? copy['settingsStatus.github.loading'];
  const resolvedRefreshingMessage = refreshingMessage ?? copy['settingsStatus.github.refreshing'];

  // Calculate progress percentage
  const progress = useMemo(() => {
    if (!showProgress || progressSteps.length === 0) {
      return 0;
    }

    const completed = progressSteps.filter((step) => step.completed).length;

    return Math.round((completed / progressSteps.length) * 100);
  }, [showProgress, progressSteps]);

  const handleToggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    if (error) {
      console.error('githubProgressiveLoader.error', error);
    }
  }, [error]);

  // Loading state with progressive steps
  if (isLoading) {
    return (
      <div
        className={classNames('flex flex-col items-center justify-center px-4 py-8', className)}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="relative mb-4">
          <Loader2
            className="h-8 w-8 animate-spin text-bolt-elements-item-contentAccent motion-reduce:animate-none"
            aria-hidden="true"
          />
          {showProgress && progress > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-medium text-bolt-elements-item-contentAccent">
                {formatSettingsStatusNumber(progress, language)}%
              </span>
            </div>
          )}
        </div>

        <div className="w-full space-y-2 text-center">
          <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">{resolvedLoadingMessage}</p>

          {showProgress && progressSteps.length > 0 && (
            <div className="w-full max-w-sm">
              {/* Progress bar */}
              <div
                className="mb-3 h-2 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={formatSettingsStatusSurfacesCopy(copy['settingsStatus.github.progress'], {
                  progress: formatSettingsStatusNumber(progress, language),
                })}
              >
                <motion.div
                  className="h-2 rounded-full bg-bolt-elements-item-contentAccent motion-reduce:transition-none"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>

              {/* Steps toggle */}
              <button
                type="button"
                onClick={handleToggleExpanded}
                className="mx-auto flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
                aria-expanded={isExpanded}
                aria-controls={progressStepsId}
              >
                <span className="break-words">
                  {copy[isExpanded ? 'settingsStatus.github.hideDetails' : 'settingsStatus.github.showDetails']}
                </span>
                <ChevronDown
                  className={classNames(
                    'h-3 w-3 shrink-0 transform transition-transform duration-200 motion-reduce:transition-none',
                    isExpanded ? 'rotate-180' : '',
                  )}
                  aria-hidden="true"
                />
              </button>

              {/* Progress steps */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 space-y-2 overflow-hidden text-left motion-reduce:transition-none"
                    id={progressStepsId}
                    role="list"
                    aria-label={copy['settingsStatus.github.steps']}
                  >
                    {progressSteps.map((step) => {
                      const stateKey = step.error
                        ? 'settingsStatus.github.stepFailed'
                        : step.completed
                          ? 'settingsStatus.github.stepCompleted'
                          : step.loading
                            ? 'settingsStatus.github.stepLoading'
                            : 'settingsStatus.github.stepPending';

                      return (
                        <div key={step.key} className="flex min-w-0 items-center gap-2 text-xs" role="listitem">
                          {step.error ? (
                            <AlertCircle className="h-3 w-3 flex-shrink-0 text-red-500" aria-hidden="true" />
                          ) : step.completed ? (
                            <CheckCircle className="h-3 w-3 flex-shrink-0 text-green-500" aria-hidden="true" />
                          ) : step.loading ? (
                            <Loader2
                              className="h-3 w-3 flex-shrink-0 animate-spin text-bolt-elements-item-contentAccent motion-reduce:animate-none"
                              aria-hidden="true"
                            />
                          ) : (
                            <div
                              className="h-3 w-3 flex-shrink-0 rounded-full border border-bolt-elements-borderColor"
                              aria-hidden="true"
                            />
                          )}
                          <span className="sr-only">{copy[stateKey]}: </span>
                          <span
                            className={classNames(
                              'min-w-0 break-words',
                              step.error
                                ? 'text-red-500'
                                : step.completed
                                  ? 'text-green-600 dark:text-green-400'
                                  : step.loading
                                    ? 'text-bolt-elements-textPrimary'
                                    : 'text-bolt-elements-textSecondary',
                            )}
                          >
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={classNames('flex flex-col items-center justify-center space-y-4 px-4 py-8 text-center', className)}
        role="alert"
      >
        <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
          <AlertCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
        </div>

        <div className="min-w-0">
          <h3 className="mb-1 break-words text-sm font-medium text-bolt-elements-textPrimary">
            {copy['settingsStatus.github.loadFailed']}
          </h3>
          <p className="mb-4 max-w-sm break-words text-xs text-bolt-elements-textSecondary">
            {copy['settingsStatus.github.safeError']}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="min-h-11 text-xs whitespace-normal">
              <RefreshCw className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
              {copy['settingsStatus.github.retry']}
            </Button>
          )}
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} className="min-h-11 text-xs whitespace-normal">
              <RefreshCw className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
              {copy['settingsStatus.github.refresh']}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Success state - render children with optional refresh indicator
  return (
    <div className={classNames('relative', className)}>
      {isRefreshing && (
        <div className="absolute top-0 right-0 z-10" role="status" aria-live="polite">
          <div className="flex items-center gap-2 px-2 py-1 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-sm">
            <Loader2
              className="h-3 w-3 animate-spin text-bolt-elements-item-contentAccent motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="break-words text-xs text-bolt-elements-textSecondary">{resolvedRefreshingMessage}</span>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

// Hook for managing progressive loading steps
export function useProgressiveLoader() {
  const [steps, setSteps] = useState<
    Array<{
      key: string;
      label: string;
      completed: boolean;
      loading?: boolean;
      error?: boolean;
    }>
  >([]);

  const addStep = useCallback((key: string, label: string) => {
    setSteps((prev) => [
      ...prev.filter((step) => step.key !== key),
      { key, label, completed: false, loading: false, error: false },
    ]);
  }, []);

  const updateStep = useCallback(
    (
      key: string,
      updates: {
        completed?: boolean;
        loading?: boolean;
        error?: boolean;
        label?: string;
      },
    ) => {
      setSteps((prev) => prev.map((step) => (step.key === key ? { ...step, ...updates } : step)));
    },
    [],
  );

  const removeStep = useCallback((key: string) => {
    setSteps((prev) => prev.filter((step) => step.key !== key));
  }, []);

  const clearSteps = useCallback(() => {
    setSteps([]);
  }, []);

  const startStep = useCallback(
    (key: string) => {
      updateStep(key, { loading: true, error: false });
    },
    [updateStep],
  );

  const completeStep = useCallback(
    (key: string) => {
      updateStep(key, { completed: true, loading: false, error: false });
    },
    [updateStep],
  );

  const errorStep = useCallback(
    (key: string) => {
      updateStep(key, { error: true, loading: false });
    },
    [updateStep],
  );

  return {
    steps,
    addStep,
    updateStep,
    removeStep,
    clearSteps,
    startStep,
    completeStep,
    errorStep,
  };
}
