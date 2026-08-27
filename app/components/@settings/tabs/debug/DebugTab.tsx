import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import { getDebugStatus, type DebugStatus } from '~/lib/api/debug';
import {
  formatDebugIssueSummary,
  formatSettingsConnectorsResidualDateTime,
  getSafeDebugIssueMessage,
  getSettingsConnectorsResidualCopy,
} from '~/lib/i18n/catalogs/settings-connectors-residual';

export default function DebugTab() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getSettingsConnectorsResidualCopy(language);
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [requestSequence, setRequestSequence] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoadFailed(false);

    getDebugStatus()
      .then((next) => {
        if (!cancelled) {
          setStatus(next);
        }
      })
      .catch((error) => {
        console.error('Failed to load debug status:', error);

        if (!cancelled) {
          setStatus(null);
          setLoadFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestSequence]);

  const issues = status ? [...status.errors, ...status.warnings] : [];

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <h3 className="break-words text-sm font-medium text-bolt-elements-textPrimary">
          {copy['settingsResidual.debug.title']}
        </h3>
        {status ? (
          <p className="break-words text-sm text-bolt-elements-textSecondary" aria-live="polite">
            {issues.length === 0
              ? copy['settingsResidual.debug.empty']
              : formatDebugIssueSummary(issues.length, language)}
          </p>
        ) : null}
      </div>

      {!status && !loadFailed ? (
        <div
          className="space-y-3 rounded-lg border border-bolt-elements-borderColor p-4"
          role="status"
          aria-live="polite"
          aria-label={copy['settingsResidual.debug.loading']}
        >
          <div className="h-4 w-2/3 animate-pulse rounded bg-bolt-elements-background-depth-2" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-bolt-elements-background-depth-2" />
          <span className="sr-only">{copy['settingsResidual.debug.loading']}</span>
        </div>
      ) : null}

      {loadFailed ? (
        <div
          className="flex min-w-0 flex-col items-start gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
          role="alert"
        >
          <p className="break-words text-sm text-bolt-elements-textSecondary">
            {copy['settingsResidual.debug.loadFailed']}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRequestSequence((current) => current + 1)}
            className="min-h-11 whitespace-normal"
          >
            {copy['settingsResidual.debug.retry']}
          </Button>
        </div>
      ) : null}

      {status && issues.length > 0 ? (
        <div className="space-y-3" role="list">
          {issues.map((issue) => {
            const formattedTimestamp = formatSettingsConnectorsResidualDateTime(issue.timestamp, language);

            return (
              <div
                key={issue.id}
                className="min-w-0 rounded-lg bg-bolt-elements-background-depth-2 p-4"
                role="listitem"
              >
                <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
                  <span
                    className={
                      issue.type === 'error'
                        ? 'rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400'
                        : 'rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300'
                    }
                  >
                    {copy[`settingsResidual.debug.${issue.type}`]}
                  </span>
                  <p className="min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary">
                    {getSafeDebugIssueMessage(issue, language)}
                  </p>
                </div>
                <time
                  dateTime={issue.timestamp}
                  className="mt-2 block break-words text-xs text-bolt-elements-textSecondary"
                >
                  {formattedTimestamp ?? copy['settingsResidual.debug.timestampUnavailable']}
                </time>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
