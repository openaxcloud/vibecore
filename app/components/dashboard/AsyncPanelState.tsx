import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { classNames } from '~/utils/classNames';

type AsyncPanelStateProps = {
  className?: string;
  compact?: boolean;
};

type AsyncPanelSkeletonProps = AsyncPanelStateProps & {
  label: string;
  rows?: number;
};

export function AsyncPanelSkeleton({ label, rows = 3, compact = false, className }: AsyncPanelSkeletonProps) {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      className={classNames(
        'overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
        compact ? 'p-4' : 'p-5 sm:p-6',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <div className="animate-pulse space-y-4 motion-reduce:animate-none" aria-hidden>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-md bg-bolt-elements-background-depth-3" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-2/5 max-w-48 rounded bg-bolt-elements-background-depth-3" />
            <div className="h-3 w-3/5 max-w-80 rounded bg-bolt-elements-background-depth-3" />
          </div>
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: rows }, (_, index) => (
            <div
              key={index}
              className="h-11 rounded-md bg-bolt-elements-background-depth-3"
              style={{ width: `${Math.max(64, 100 - index * 8)}%` }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type AsyncPanelErrorProps = AsyncPanelStateProps & {
  title: string;
  description: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  tone?: 'error' | 'warning';
};

export function AsyncPanelError({
  title,
  description,
  onRetry,
  retrying = false,
  retryLabel,
  tone = 'error',
  compact = false,
  className,
}: AsyncPanelErrorProps) {
  const { t } = useTranslation();
  const Icon = tone === 'warning' ? AlertTriangle : AlertCircle;

  return (
    <section
      role="alert"
      aria-live="assertive"
      className={classNames(
        'flex flex-col gap-4 rounded-lg border',
        tone === 'warning'
          ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
          : 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]',

        /*
         * Même padding compact que `AsyncPanelSkeleton` : les deux états se
         * remplacent au même emplacement, le panneau ne doit pas sauter.
         */
        compact ? 'p-4' : 'p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={classNames(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
            tone === 'warning' ? 'border-[var(--status-warning-border)]' : 'border-[var(--status-error-border)]',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-bolt-elements-textSecondary">{description}</p>
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
          className={classNames(
            'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-md border bg-bolt-elements-background-depth-1 px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-wait disabled:opacity-60',
            tone === 'warning' ? 'border-[var(--status-warning-border)]' : 'border-[var(--status-error-border)]',
          )}
        >
          <RefreshCw
            className={classNames('h-4 w-4', retrying && 'animate-spin motion-reduce:animate-none')}
            aria-hidden
          />
          {retrying ? t('userArea.async.retrying') : (retryLabel ?? t('userArea.async.retry'))}
        </button>
      ) : null}
    </section>
  );
}
