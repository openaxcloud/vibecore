import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deriveServiceStatusView, type EndpointStatus } from './service-status-view';
import {
  formatSettingsStatusNumber,
  formatSettingsStatusSurfacesCopy,
  getSettingsStatusSurfacesCopy,
} from '~/lib/i18n/catalogs/settings-status-surfaces';
import { classNames } from '~/utils/classNames';

const endpoints = ['/api/health', '/api/models', '/api/configured-providers', '/api/system/diagnostics'];
const PROBE_TIMEOUT_MS = 10_000;

export default function ServiceStatusTab() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getSettingsStatusSurfacesCopy(language);
  const [statuses, setStatuses] = useState<EndpointStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    setLoading(true);
    setFailed(false);

    Promise.all(
      endpoints.map(async (endpoint) => {
        const start = performance.now();

        try {
          const response = await fetch(endpoint, { signal: controller.signal });

          return {
            endpoint,
            ok: response.ok,
            status: response.status,
            latency: Math.round(performance.now() - start),
          };
        } catch {
          return {
            endpoint,
            ok: false,
            status: 0,
            latency: Math.round(performance.now() - start),
          };
        }
      }),
    )
      .then((results) => {
        window.clearTimeout(timeout);

        if (!cancelled) {
          setStatuses(results);
          setLoading(false);
        }
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        console.error('serviceStatus.probe', error);

        if (!cancelled) {
          setStatuses([]);
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [refreshKey]);

  const view = deriveServiceStatusView(loading, failed, statuses);

  if (view.kind === 'loading') {
    return (
      <div
        className="space-y-3 py-4 text-sm text-bolt-elements-textSecondary"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">{copy['settingsStatus.service.loading']}</span>
        {endpoints.map((endpoint) => (
          <div
            key={endpoint}
            className="flex animate-pulse items-center justify-between gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 motion-reduce:animate-none"
            aria-hidden="true"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-bolt-elements-background-depth-3" />
              <div className="h-3 w-1/4 rounded bg-bolt-elements-background-depth-3" />
            </div>
            <div className="h-6 w-20 rounded bg-bolt-elements-background-depth-3" />
          </div>
        ))}
      </div>
    );
  }

  if (view.kind === 'error') {
    return (
      <div
        className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-bolt-elements-textPrimary"
        role="alert"
      >
        <h3 className="break-words font-medium text-red-500">{copy['settingsStatus.service.errorTitle']}</h3>
        <p className="mt-1 break-words text-bolt-elements-textSecondary">
          {copy['settingsStatus.service.errorDescription']}
        </p>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-lg border border-red-500/40 px-4 py-2 font-medium whitespace-normal text-red-500 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          {copy['settingsStatus.service.retry']}
        </button>
      </div>
    );
  }

  if (view.kind === 'empty') {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-center">
        <h3 className="break-words text-sm font-medium text-bolt-elements-textPrimary">
          {copy['settingsStatus.service.emptyTitle']}
        </h3>
        <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
          {copy['settingsStatus.service.emptyDescription']}
        </p>
        <button
          type="button"
          className="mt-3 min-h-11 rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium whitespace-normal text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          {copy['settingsStatus.service.refresh']}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-bolt-elements-borderColor px-4 py-2 text-sm font-medium whitespace-normal text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          {copy['settingsStatus.service.refresh']}
        </button>
      </div>
      <div className="space-y-3" role="list" aria-label={copy['settingsStatus.service.list']}>
        {view.statuses.map((item) => {
          const state = copy[item.ok ? 'settingsStatus.service.available' : 'settingsStatus.service.unavailable'];

          const status = item.status
            ? formatSettingsStatusSurfacesCopy(copy['settingsStatus.service.httpStatus'], {
                status: formatSettingsStatusNumber(item.status, language),
              })
            : copy['settingsStatus.service.noResponse'];
          const latency = formatSettingsStatusSurfacesCopy(copy['settingsStatus.service.latency'], {
            value: formatSettingsStatusNumber(item.latency, language),
          });

          return (
            <div
              key={item.endpoint}
              className="flex flex-col gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              role="listitem"
              aria-label={formatSettingsStatusSurfacesCopy(copy['settingsStatus.service.result'], {
                endpoint: item.endpoint,
                state,
                status,
                latency,
              })}
            >
              <div className="min-w-0">
                <div className="break-all text-sm font-medium text-bolt-elements-textPrimary">{item.endpoint}</div>
                <div className="text-xs text-bolt-elements-textSecondary">{latency}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={classNames(
                    'rounded-full px-2 py-1 text-xs font-medium',
                    item.ok ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-500',
                  )}
                >
                  {state}
                </span>
                <span className="text-sm font-medium text-bolt-elements-textPrimary">{status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
