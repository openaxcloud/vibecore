import { Loader2, AlertCircle, CheckCircle, Info, Github } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatSettingsConnectorsResidualDateTime,
  getSettingsConnectorsResidualCopy,
} from '~/lib/i18n/catalogs/settings-connectors-residual';
import { classNames } from '~/utils/classNames';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingState({ message, size = 'md', className = '' }: LoadingStateProps) {
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={classNames(
        'flex min-w-0 flex-col items-center justify-center py-8 text-bolt-elements-textSecondary',
        className,
      )}
    >
      <Loader2 className={classNames('mb-2 animate-spin', sizeClasses[size])} aria-hidden="true" />
      <p className={classNames('break-words text-center text-bolt-elements-textSecondary', textSizeClasses[size])}>
        {message ?? copy['settingsResidual.state.loading']}
      </p>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ErrorState({ title, message, onRetry, retryLabel, size = 'md', className = '' }: ErrorStateProps) {
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div
      className={classNames('flex min-w-0 flex-col items-center justify-center py-8 text-center', className)}
      role="alert"
    >
      <AlertCircle className={classNames('mb-2 text-red-500', sizeClasses[size])} aria-hidden="true" />
      <h3 className={classNames('mb-1 break-words font-medium text-bolt-elements-textPrimary', textSizeClasses[size])}>
        {title ?? copy['settingsResidual.state.error.title']}
      </h3>
      <p className={classNames('mb-4 break-words text-bolt-elements-textSecondary', textSizeClasses[size])}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-lg bg-bolt-elements-item-contentAccent px-4 py-2 text-white transition-colors hover:bg-bolt-elements-item-contentAccent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-item-contentAccent focus-visible:ring-offset-2"
        >
          {retryLabel ?? copy['settingsResidual.state.error.retry']}
        </button>
      )}
    </div>
  );
}

interface SuccessStateProps {
  title?: string;
  message: string;
  onAction?: () => void;
  actionLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SuccessState({
  title,
  message,
  onAction,
  actionLabel,
  size = 'md',
  className = '',
}: SuccessStateProps) {
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div
      className={classNames('flex min-w-0 flex-col items-center justify-center py-8 text-center', className)}
      role="status"
      aria-live="polite"
    >
      <CheckCircle className={classNames('mb-2 text-green-500', sizeClasses[size])} aria-hidden="true" />
      <h3 className={classNames('mb-1 break-words font-medium text-bolt-elements-textPrimary', textSizeClasses[size])}>
        {title ?? copy['settingsResidual.state.success.title']}
      </h3>
      <p className={classNames('mb-4 break-words text-bolt-elements-textSecondary', textSizeClasses[size])}>
        {message}
      </p>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 rounded-lg bg-bolt-elements-item-contentAccent px-4 py-2 text-white transition-colors hover:bg-bolt-elements-item-contentAccent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-item-contentAccent focus-visible:ring-offset-2"
        >
          {actionLabel ?? copy['settingsResidual.state.success.continue']}
        </button>
      )}
    </div>
  );
}

interface GitHubConnectionRequiredProps {
  onConnect?: () => void;
  className?: string;
}

export function GitHubConnectionRequired({ onConnect, className = '' }: GitHubConnectionRequiredProps) {
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className={classNames('flex min-w-0 flex-col items-center justify-center py-12 text-center', className)}>
      <Github className="mb-4 h-12 w-12 text-bolt-elements-textTertiary" aria-hidden="true" />
      <h3 className="mb-2 break-words text-lg font-medium text-bolt-elements-textPrimary">
        {copy['settingsResidual.state.githubRequired.title']}
      </h3>
      <p className="mb-6 max-w-md break-words text-sm text-bolt-elements-textSecondary">
        {copy['settingsResidual.state.githubRequired.description']}
      </p>
      {onConnect && (
        <button
          type="button"
          onClick={onConnect}
          className="flex min-h-11 items-center gap-2 rounded-lg bg-bolt-elements-item-contentAccent px-6 py-3 text-white transition-colors hover:bg-bolt-elements-item-contentAccent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-item-contentAccent focus-visible:ring-offset-2"
        >
          <Github className="h-4 w-4 shrink-0" aria-hidden="true" />
          {copy['settingsResidual.state.githubRequired.action']}
        </button>
      )}
    </div>
  );
}

interface InformationStateProps {
  title: string;
  message: string;
  icon?: React.ComponentType<{ className?: string }>;
  onAction?: () => void;
  actionLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function InformationState({
  title,
  message,
  icon = Info,
  onAction,
  actionLabel,
  size = 'md',
  className = '',
}: InformationStateProps) {
  const { i18n } = useTranslation();
  const copy = getSettingsConnectorsResidualCopy(i18n.resolvedLanguage ?? i18n.language);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className={classNames('flex min-w-0 flex-col items-center justify-center py-8 text-center', className)}>
      {React.createElement(icon, { className: classNames('mb-2 text-blue-500', sizeClasses[size]) })}
      <h3 className={classNames('mb-1 break-words font-medium text-bolt-elements-textPrimary', textSizeClasses[size])}>
        {title}
      </h3>
      <p className={classNames('mb-4 break-words text-bolt-elements-textSecondary', textSizeClasses[size])}>
        {message}
      </p>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 rounded-lg bg-bolt-elements-item-contentAccent px-4 py-2 text-white transition-colors hover:bg-bolt-elements-item-contentAccent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-item-contentAccent focus-visible:ring-offset-2"
        >
          {actionLabel ?? copy['settingsResidual.state.information.dismiss']}
        </button>
      )}
    </div>
  );
}

interface ConnectionTestIndicatorProps {
  status: 'success' | 'error' | 'testing' | null;
  message?: string;
  timestamp?: number;
  className?: string;
}

export function ConnectionTestIndicator({ status, message, timestamp, className = '' }: ConnectionTestIndicatorProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getSettingsConnectorsResidualCopy(language);

  if (!status) {
    return null;
  }

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700';
      case 'testing':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700';
      default:
        return 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
      case 'testing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />;
      default:
        return <Info className="w-5 h-5 text-bolt-elements-textSecondary" />;
    }
  };

  const getStatusTextColor = () => {
    switch (status) {
      case 'success':
        return 'text-green-800 dark:text-green-200';
      case 'error':
        return 'text-red-800 dark:text-red-200';
      case 'testing':
        return 'text-blue-800 dark:text-blue-200';
      default:
        return 'text-bolt-elements-textPrimary';
    }
  };

  const statusMessage = message ?? copy[`settingsResidual.state.connection.${status}`];
  const formattedTimestamp = timestamp ? formatSettingsConnectorsResidualDateTime(timestamp, language) : null;

  return (
    <div
      className={classNames(`min-w-0 rounded-lg border p-4 ${getStatusColor()}`, className)}
      role={status === 'error' ? 'alert' : 'status'}
      aria-live={status === 'error' ? 'assertive' : 'polite'}
    >
      <div className="flex min-w-0 items-center gap-2">
        {getStatusIcon()}
        <span className={classNames('min-w-0 break-words text-sm font-medium', getStatusTextColor())}>
          {statusMessage}
        </span>
      </div>
      {timestamp && (
        <p className="mt-1 break-words text-xs text-bolt-elements-textTertiary">
          {formattedTimestamp ?? copy['settingsResidual.debug.timestampUnavailable']}
        </p>
      )}
    </div>
  );
}
