import { useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';

const endpoints = ['/api/health', '/api/models', '/api/configured-providers', '/api/system/diagnostics'];

interface EndpointStatus {
  endpoint: string;
  ok: boolean;
  status: number;
  latency: number;
}

export default function ServiceStatusTab() {
  const [statuses, setStatuses] = useState<EndpointStatus[]>([]);

  useEffect(() => {
    let cancelled = false;

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
    ).then((results) => {
      if (!cancelled) {
        setStatuses(results);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      {statuses.map((item) => (
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
