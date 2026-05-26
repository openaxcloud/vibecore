import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { Activity, CheckCircle2, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { PublicShell, StatGrid } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Status - E-Code' }];

type ComponentStatus = 'operational' | 'degraded' | 'down';

interface ComponentReport {
  key: string;
  label: string;
  url: string;
  status: ComponentStatus;
  responseTimeMs: number | null;
  message: string;
}

interface StatusPayload {
  generatedAt: string;
  overall: ComponentStatus;
  components: ComponentReport[];
}

interface ComponentTarget {
  key: string;
  label: string;
  envVar: string;
  defaultUrl: string;
}

const TARGETS: ComponentTarget[] = [
  {
    key: 'api',
    label: 'API',
    envVar: 'STATUS_PROBE_API_URL',
    defaultUrl: 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001/health',
  },
  {
    key: 'ai-gateway',
    label: 'AI gateway',
    envVar: 'STATUS_PROBE_AI_GATEWAY_URL',
    defaultUrl: 'http://vibecore-vibecore-platform-ai-gateway.vibecore.svc.cluster.local:3010/health',
  },
  {
    key: 'workspace-manager',
    label: 'Workspace runtime',
    envVar: 'STATUS_PROBE_WORKSPACE_MANAGER_URL',
    defaultUrl: 'http://vibecore-vibecore-platform-workspace-manager.vibecore.svc.cluster.local:3020/health',
  },
  {
    key: 'preview-proxy',
    label: 'Preview proxy',
    envVar: 'STATUS_PROBE_PREVIEW_PROXY_URL',
    defaultUrl: 'http://vibecore-vibecore-platform-preview-proxy.vibecore.svc.cluster.local:3030/health',
  },
];

const PROBE_TIMEOUT_MS = Number(process.env.STATUS_PROBE_TIMEOUT_MS ?? 1500);

async function probe(target: ComponentTarget): Promise<ComponentReport> {
  const url = process.env[target.envVar] ?? target.defaultUrl;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    const elapsed = Date.now() - start;

    if (response.status >= 200 && response.status < 300) {
      return {
        key: target.key,
        label: target.label,
        url,
        status: 'operational',
        responseTimeMs: elapsed,
        message: `Healthy in ${elapsed} ms`,
      };
    }

    return {
      key: target.key,
      label: target.label,
      url,
      status: 'degraded',
      responseTimeMs: elapsed,
      message: `HTTP ${response.status} after ${elapsed} ms`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return {
      key: target.key,
      label: target.label,
      url,
      status: 'down',
      responseTimeMs: null,
      message: reason.includes('aborted') ? `No response within ${PROBE_TIMEOUT_MS} ms` : reason.slice(0, 120),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const loader = async (_args: LoaderFunctionArgs) => {
  const results = await Promise.all(TARGETS.map(probe));

  // The web pod is by definition reachable when this loader runs.
  const self: ComponentReport = {
    key: 'web',
    label: 'Dashboard',
    url: 'self',
    status: 'operational',
    responseTimeMs: 0,
    message: 'Serving this status page',
  };

  const components = [self, ...results];
  const downCount = components.filter((c) => c.status === 'down').length;
  const degradedCount = components.filter((c) => c.status === 'degraded').length;
  const overall: ComponentStatus = downCount > 0 ? 'down' : degradedCount > 0 ? 'degraded' : 'operational';

  return json<StatusPayload>(
    { generatedAt: new Date().toISOString(), overall, components },
    {
      headers: {
        'cache-control': 'no-store, must-revalidate',
        'x-robots-tag': 'noindex',
      },
    },
  );
};

const STATUS_COPY: Record<ComponentStatus, { value: string; icon: LucideIcon }> = {
  operational: { value: 'Operational', icon: CheckCircle2 },
  degraded: { value: 'Degraded', icon: TriangleAlert },
  down: { value: 'Down', icon: OctagonAlert },
};

const OVERALL_COPY: Record<ComponentStatus, { title: string; subtitle: string }> = {
  operational: {
    title: 'All systems operational',
    subtitle: 'Every monitored component responded within the probe budget.',
  },
  degraded: {
    title: 'Partial degradation',
    subtitle: 'One or more components answered slowly or with a non-2xx status.',
  },
  down: {
    title: 'Service interruption',
    subtitle: 'One or more components did not respond. Incident response is engaged.',
  },
};

export default function StatusPage() {
  const data = useLoaderData<StatusPayload>();
  const overall = OVERALL_COPY[data.overall];

  const stats: Array<{ label: string; value: string; detail: string; icon: LucideIcon }> = data.components.map(
    (component) => {
      const copy = STATUS_COPY[component.status];

      return {
        label: component.label,
        value: copy.value,
        detail: component.message,
        icon: component.status === 'operational' ? Activity : copy.icon,
      };
    },
  );

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-normal">Platform status</h1>
        <p className="mt-3 text-sm text-bolt-elements-textSecondary">
          {overall.title}. {overall.subtitle}
        </p>
        <p className="mt-1 text-xs text-bolt-elements-textTertiary">
          Last checked {new Date(data.generatedAt).toLocaleString()} · probe budget {PROBE_TIMEOUT_MS} ms · live
          readout, not cached.
        </p>
        <div className="mt-8">
          <StatGrid stats={stats} />
        </div>
      </section>
    </PublicShell>
  );
}
