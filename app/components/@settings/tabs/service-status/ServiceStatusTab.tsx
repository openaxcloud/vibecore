import { useEffect, useState } from 'react';
import { deriveServiceStatusView, type EndpointStatus } from './service-status-view';
import { classNames } from '~/utils/classNames';

const endpoints = ['/api/health', '/api/models', '/api/configured-providers', '/api/system/diagnostics'];

export default function ServiceStatusTab() {
  const [statuses, setStatuses] = useState<EndpointStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setFailed(false);

    Promise.all(
      endpoints.map(async (endpoint) => {
        const start = performance.now();

        try {
          const response = await fetch(endpoint);

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
        if (!cancelled) {
          setStatuses(results);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('Failed to fetch service statuses:', error);

        if (!cancelled) {
          setStatuses([]);
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const view = deriveServiceStatusView(loading, failed, statuses);

  if (view.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-bolt-elements-textSecondary" role="status">
        <span className="i-svg-spinners:90-ring-with-bg text-lg" aria-hidden="true" />
        <span>Checking service status…</span>
      </div>
    );
  }

  if (view.kind === 'error') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500" role="alert">
        Unable to reach the diagnostics endpoints. The backend may be unavailable — try again shortly.
      </div>
    );
  }

  if (view.kind === 'empty') {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm text-bolt-elements-textSecondary">
        No service endpoints to report.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {view.statuses.map((item) => (
        <div
          key={item.endpoint}
          className="flex items-center justify-between rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
        >
          <div>
            <div className="text-sm font-medium text-bolt-elements-textPrimary">{item.endpoint}</div>
            <div className="text-xs text-bolt-elements-textSecondary">{item.latency}ms</div>
          </div>
          <span className={classNames('text-sm font-medium', item.ok ? 'text-green-500' : 'text-red-500')}>
            {item.status}
          </span>
        </div>
      ))}
    </div>
  );
}
