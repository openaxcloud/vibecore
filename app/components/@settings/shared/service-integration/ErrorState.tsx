import { motion, useReducedMotion } from 'framer-motion';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import {
  formatSettingsConnectorsResidualCopy,
  getSettingsConnectorsResidualCopy,
} from '~/lib/i18n/catalogs/settings-connectors-residual';
import type { ServiceError } from '~/lib/utils/serviceErrorHandler';
import { classNames } from '~/utils/classNames';

interface ErrorStateProps {
  error?: ServiceError | string;
  title?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabel?: string;
  className?: string;
  showDetails?: boolean;
}

export function ErrorState({
  error,
  title,
  onRetry,
  onDismiss,
  retryLabel,
  className,
  showDetails = false,
}: ErrorStateProps) {
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);
  const reduceMotion = useReducedMotion();
  const isServiceError = typeof error === 'object' && error !== null;
  const hasSafeDetails = isServiceError && Boolean(error.code || error.service || error.operation);

  return (
    <motion.div
      className={classNames(
        'min-w-0 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20 sm:p-6',
        className,
      )}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : undefined}
      role="alert"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3">
        <div
          className="i-ph:warning-circle mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="mb-1 break-words text-sm font-medium text-red-800 dark:text-red-200">
            {title ?? copy['settingsResidual.serviceError.title']}
          </h3>
          <p className="break-words text-sm text-red-700 dark:text-red-300">
            {copy['settingsResidual.serviceError.message']}
          </p>

          {showDetails && hasSafeDetails && (
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer rounded py-3 text-xs text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400">
                {copy['settingsResidual.serviceError.details']}
              </summary>
              <dl className="mt-2 grid min-w-0 gap-2 rounded bg-red-100 p-3 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300 sm:grid-cols-[max-content_minmax(0,1fr)]">
                {error.code ? (
                  <>
                    <dt className="font-medium">{copy['settingsResidual.serviceError.code']}</dt>
                    <dd className="min-w-0 break-all font-mono">{error.code}</dd>
                  </>
                ) : null}
                {error.service ? (
                  <>
                    <dt className="font-medium">{copy['settingsResidual.serviceError.service']}</dt>
                    <dd className="min-w-0 break-all font-mono">{error.service}</dd>
                  </>
                ) : null}
                {error.operation ? (
                  <>
                    <dt className="font-medium">{copy['settingsResidual.serviceError.operation']}</dt>
                    <dd className="min-w-0 break-all font-mono">{error.operation}</dd>
                  </>
                ) : null}
              </dl>
            </details>
          )}

          <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {onRetry && (
              <Button
                onClick={onRetry}
                variant="outline"
                size="sm"
                className="min-h-11 whitespace-normal border-red-300 text-red-700 hover:bg-red-100 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/30"
              >
                <span className="i-ph:arrows-clockwise mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
                {retryLabel ?? copy['settingsResidual.serviceError.retry']}
              </Button>
            )}
            {onDismiss && (
              <Button
                onClick={onDismiss}
                variant="outline"
                size="sm"
                className="min-h-11 whitespace-normal border-red-300 text-red-700 hover:bg-red-100 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/30"
              >
                {copy['settingsResidual.serviceError.dismiss']}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface ConnectionErrorProps {
  service: string;
  error: ServiceError | string;
  onRetryConnection: () => void;
  onClearError?: () => void;
}

export function ConnectionError({ service, error, onRetryConnection, onClearError }: ConnectionErrorProps) {
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <ErrorState
      error={error}
      title={formatSettingsConnectorsResidualCopy(copy['settingsResidual.serviceError.connectionTitle'], { service })}
      onRetry={onRetryConnection}
      onDismiss={onClearError}
      retryLabel={copy['settingsResidual.serviceError.connectionRetry']}
      showDetails={true}
    />
  );
}
