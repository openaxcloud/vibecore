import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { formatUpdateTabCopy, formatUpdateTabPlural, getUpdateTabCopy } from '~/lib/i18n/catalogs/update-tab';

interface UpdateDetails {
  changedFiles?: string[];
  additions?: number;
  deletions?: number;
  commitMessages?: string[];
  currentCommit?: string;
  remoteCommit?: string;
  updateReady?: boolean;
  compareUrl?: string;
  changelog?: string;
}

interface UpdateProgress {
  stage: string;
  progress: number;
  failed: boolean;
  details?: UpdateDetails;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string') ? value : undefined;
}

function safeCompareUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeUpdateProgress(value: unknown): UpdateProgress | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;

  const detailsSource =
    source.details && typeof source.details === 'object' ? (source.details as Record<string, unknown>) : null;

  const details: UpdateDetails | undefined = detailsSource
    ? {
        changedFiles: stringArray(detailsSource.changedFiles),
        additions: nonNegativeNumber(detailsSource.additions),
        deletions: nonNegativeNumber(detailsSource.deletions),
        commitMessages: stringArray(detailsSource.commitMessages),
        currentCommit: typeof detailsSource.currentCommit === 'string' ? detailsSource.currentCommit : undefined,
        remoteCommit: typeof detailsSource.remoteCommit === 'string' ? detailsSource.remoteCommit : undefined,
        updateReady: detailsSource.updateReady === true,
        compareUrl: safeCompareUrl(detailsSource.compareUrl),
        changelog: typeof detailsSource.changelog === 'string' ? detailsSource.changelog : undefined,
      }
    : undefined;

  const progress = nonNegativeNumber(source.progress) ?? 0;

  return {
    stage: typeof source.stage === 'string' ? source.stage : 'unknown',
    progress: Math.min(100, progress),
    failed: Boolean(source.error),
    ...(details ? { details } : {}),
  };
}

/**
 * The server only sets `updateReady` when it successfully diffs against
 * upstream. Treat a missing flag as "up to date" so an error/partial payload
 * never renders a misleading "+0 / -0 over an empty file list" diff panel.
 */
export function isUpdateAvailable(details: UpdateDetails | undefined): boolean {
  return Boolean(details?.updateReady);
}

export default function UpdateTab() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getUpdateTabCopy(language);
  const locale = language.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US';
  const numberFormatter = new Intl.NumberFormat(locale);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateProgress | null>(null);

  const checkUpdates = async () => {
    setChecking(true);
    setResult(null);

    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'main', autoUpdate: false }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok || !response.body) {
        throw new Error(String(response.status));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      const lastProgress: { current: UpdateProgress | null } = { current: null };

      const parseProgressLine = (line: string) => {
        if (!line.trim()) {
          return;
        }

        try {
          const progress = normalizeUpdateProgress(JSON.parse(line));

          if (progress) {
            lastProgress.current = progress;
            setResult(progress);
          }
        } catch (error) {
          console.warn(error);
        }
      };

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          parseProgressLine(line);
        }
      }

      parseProgressLine(buffer);

      const completionCopy = getUpdateTabCopy(i18n.resolvedLanguage ?? i18n.language);

      if (lastProgress.current?.failed) {
        toast.error(completionCopy['updateTab.status.failed']);
      } else {
        const completed: UpdateProgress = lastProgress.current ?? {
          stage: 'complete',
          progress: 100,
          failed: false,
        };

        setResult(completed);
        toast.success(
          isUpdateAvailable(completed.details)
            ? completionCopy['updateTab.status.available']
            : completionCopy['updateTab.status.complete'],
        );
      }
    } catch {
      const failureCopy = getUpdateTabCopy(i18n.resolvedLanguage ?? i18n.language);

      setResult({ stage: 'complete', progress: 100, failed: true });
      toast.error(failureCopy['updateTab.status.failed']);
    } finally {
      setChecking(false);
    }
  };

  const details = result?.failed ? undefined : result?.details;

  const statusMessage = result?.failed
    ? copy['updateTab.status.failed']
    : checking && !result
      ? copy['updateTab.status.checking']
      : details && isUpdateAvailable(details)
        ? copy['updateTab.status.available']
        : result?.progress === 100
          ? copy['updateTab.status.complete']
          : result
            ? formatUpdateTabCopy(copy['updateTab.status.progress'], {
                progress: numberFormatter.format(Math.round(result.progress)),
              })
            : copy['updateTab.status.idle'];

  const commitMessages = details?.commitMessages ?? [];
  const changedFiles = details?.changedFiles ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h3 className="break-words text-sm font-medium text-bolt-elements-textPrimary">
              {copy['updateTab.title']}
            </h3>
            <p className="break-words text-sm text-bolt-elements-textSecondary" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={checkUpdates}
            disabled={checking}
            aria-busy={checking}
            className="min-h-11 whitespace-normal rounded-lg bg-[var(--vc-ide-accent-action)] px-3 py-2 text-center text-sm font-medium text-[var(--vc-ide-on-accent-action)] disabled:opacity-60"
          >
            {checking ? copy['updateTab.action.checking'] : copy['updateTab.action.check']}
          </button>
        </div>
      </div>

      {details && (
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-bolt-elements-background-depth-1 p-3">
              <div className="text-bolt-elements-textSecondary">{copy['updateTab.current']}</div>
              <div className="break-all font-medium text-bolt-elements-textPrimary">{details.currentCommit ?? '—'}</div>
            </div>
            <div className="rounded-lg bg-bolt-elements-background-depth-1 p-3">
              <div className="text-bolt-elements-textSecondary">{copy['updateTab.upstream']}</div>
              <div className="break-all font-medium text-bolt-elements-textPrimary">{details.remoteCommit ?? '—'}</div>
            </div>
            <div className="rounded-lg bg-bolt-elements-background-depth-1 p-3">
              <div className="text-bolt-elements-textSecondary">{copy['updateTab.diff']}</div>
              <div className="font-medium text-bolt-elements-textPrimary">
                +{numberFormatter.format(details.additions ?? 0)} / −{numberFormatter.format(details.deletions ?? 0)}
              </div>
            </div>
          </div>

          {details.changelog && <p className="text-sm text-bolt-elements-textSecondary">{details.changelog}</p>}

          {isUpdateAvailable(details) ? (
            <>
              {details.compareUrl && (
                <a
                  href={details.compareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 max-w-full items-center gap-1 whitespace-normal break-words text-sm font-medium text-[var(--vc-ide-accent-action)] hover:underline"
                >
                  {copy['updateTab.compare']}
                  <span aria-hidden="true">↗</span>
                </a>
              )}

              <div className="space-y-1">
                <div className="text-sm font-medium text-bolt-elements-textPrimary">
                  {formatUpdateTabPlural(language, commitMessages.length, {
                    one: copy['updateTab.commits_one'],
                    other: copy['updateTab.commits_other'],
                  })}
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-bolt-elements-background-depth-1 p-3">
                  {commitMessages.length > 0 ? (
                    commitMessages.map((message) => (
                      <div key={message} className="break-words text-xs text-bolt-elements-textSecondary">
                        {message}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-bolt-elements-textSecondary">{copy['updateTab.noCommits']}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium text-bolt-elements-textPrimary">
                  {formatUpdateTabPlural(language, changedFiles.length, {
                    one: copy['updateTab.changedFiles_one'],
                    other: copy['updateTab.changedFiles_other'],
                  })}
                </div>
                <div className="max-h-80 overflow-y-auto rounded-lg bg-bolt-elements-background-depth-1 p-3">
                  {changedFiles.length > 0 ? (
                    changedFiles.map((file) => (
                      <code key={file} className="block break-all text-xs text-bolt-elements-textSecondary">
                        {file}
                      </code>
                    ))
                  ) : (
                    <p className="text-xs text-bolt-elements-textSecondary">{copy['updateTab.noChangedFiles']}</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-bolt-elements-background-depth-1 p-3 text-sm text-bolt-elements-textSecondary">
              {copy['updateTab.upToDate']}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
