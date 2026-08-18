import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
  formatSettingsStatusBytes,
  formatSettingsStatusEntryCount,
  formatSettingsStatusSurfacesCopy,
  getSettingsStatusSurfacesCopy,
} from '~/lib/i18n/catalogs/settings-status-surfaces';

export default function TaskManagerTab() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getSettingsStatusSurfacesCopy(language);
  const [refreshKey, setRefreshKey] = useState(0);
  const [clearFailed, setClearFailed] = useState(false);

  const storageView = useMemo(() => {
    try {
      const items = Object.keys(localStorage)
        .sort()
        .map((key) => {
          const value = localStorage.getItem(key) || '';

          return { key, size: new Blob([value]).size };
        });

      return { items, failed: false } as const;
    } catch (error) {
      console.error('taskManager.storage.read', error);

      return { items: [], failed: true } as const;
    }
  }, [refreshKey]);

  const clearVolatileData = () => {
    try {
      ['error_logs', 'bolt_acknowledged_connection_issue'].forEach((key) => localStorage.removeItem(key));
      setClearFailed(false);
      setRefreshKey((value) => value + 1);
      toast.success(copy['settingsStatus.task.cleared']);
    } catch (error) {
      console.error('taskManager.storage.clear', error);
      setClearFailed(true);
      toast.error(copy['settingsStatus.task.clearFailed']);
    }
  };

  if (storageView.failed) {
    return (
      <div
        className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-bolt-elements-textPrimary"
        role="alert"
      >
        <h3 className="break-words font-medium text-red-500">{copy['settingsStatus.task.errorTitle']}</h3>
        <p className="mt-1 break-words text-bolt-elements-textSecondary">
          {copy['settingsStatus.task.errorDescription']}
        </p>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-lg border border-red-500/40 px-4 py-2 font-medium whitespace-normal text-red-500 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          {copy['settingsStatus.task.retry']}
        </button>
      </div>
    );
  }

  const { items } = storageView;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-medium text-bolt-elements-textPrimary">
            {copy['settingsStatus.task.title']}
          </h3>
          <p className="break-words text-sm text-bolt-elements-textSecondary">
            {formatSettingsStatusEntryCount(items.length, language)}
          </p>
        </div>
        <button
          type="button"
          onClick={clearVolatileData}
          className="min-h-11 rounded-lg bg-[var(--vc-action-primary)] px-4 py-2 text-sm font-medium whitespace-normal text-[var(--vc-action-primary-foreground)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={items.length === 0}
        >
          {copy['settingsStatus.task.clear']}
        </button>
      </div>

      {clearFailed && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500" role="alert">
          {copy['settingsStatus.task.clearFailed']}
        </div>
      )}

      {items.length === 0 ? (
        <div
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-center"
          role="status"
        >
          <h4 className="break-words text-sm font-medium text-bolt-elements-textPrimary">
            {copy['settingsStatus.task.emptyTitle']}
          </h4>
          <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
            {copy['settingsStatus.task.emptyDescription']}
          </p>
        </div>
      ) : (
        <div
          className="max-h-[60vh] overflow-y-auto rounded-lg border border-bolt-elements-borderColor"
          role="list"
          aria-label={copy['settingsStatus.task.list']}
        >
          {items.map((item) => {
            const size = formatSettingsStatusBytes(item.size, language);

            return (
              <div
                key={item.key}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-bolt-elements-borderColor px-4 py-2 last:border-b-0"
                role="listitem"
                aria-label={formatSettingsStatusSurfacesCopy(copy['settingsStatus.task.entrySize'], {
                  key: item.key,
                  size,
                })}
              >
                <span className="min-w-0 break-all text-sm text-bolt-elements-textPrimary">{item.key}</span>
                <span className="shrink-0 text-xs text-bolt-elements-textSecondary">{size}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
