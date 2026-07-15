/**
 * Replit-parity deployment-type model for the Publish panel.
 *
 * E-Code's managed deploy backend is static-only TODAY: `provider=static` runs a
 * real in-process build and serves the result at `/static-deployments/<id>/`
 * (see services/api/src/deployments.ts). The three compute tiers below mirror
 * Replit's Autoscale / Reserved VM / Scheduled offerings — they exist as billing
 * rates (metering-service.ts) but have NO provisioning runtime yet, so they are
 * surfaced as "coming soon" rather than faked. Keeping the taxonomy here (one
 * source of truth) lets the Publish UI show the full Replit-style menu while only
 * enabling what the backend can actually fulfil.
 */
export type DeploymentTypeId = 'static' | 'autoscale' | 'reserved-vm' | 'scheduled';

export type DeploymentTypeStatus = 'available' | 'coming-soon';

export interface DeploymentType {
  id: DeploymentTypeId;

  /** Short product name shown on the selector card. */
  name: string;

  /** One-line value proposition. */
  tagline: string;

  /** What it does, for the detail panel. */
  description: string;
  status: DeploymentTypeStatus;

  /** Best-fit app shape, e.g. "Static sites & SPAs". */
  bestFor: string;

  /**
   * For coming-soon tiers: what is still required to ship it, split into work
   * that is code-only vs work that needs cluster/infra provisioning (operator).
   */
  requires?: { code: string[]; infra: string[] };
}

export const DEPLOYMENT_TYPES: readonly DeploymentType[] = [
  {
    id: 'static',
    name: 'Static',
    tagline: 'Build once, serve the output as a fast static site.',
    description:
      'Runs your build command and publishes the output directory to a public URL. Best for SPAs, generated sites and front-end apps that do not need a running server.',
    status: 'available',
    bestFor: 'Static sites & SPAs (React, Vue, Astro, plain HTML)',
  },
  {
    id: 'autoscale',
    name: 'Autoscale',
    tagline: 'Run a server that scales with traffic and to zero when idle.',
    description:
      'Runs your app as a managed HTTP service that scales up under load and down to zero when idle, so you only pay for what you use. Best for full-stack apps with a backend (Next.js SSR, Express, Remix server).',
    status: 'coming-soon',
    bestFor: 'Full-stack apps with a server (SSR, APIs)',
    requires: {
      code: [
        'Deploy provider + route for a long-running workspace service',
        'Build → container image → service revision pipeline (job queue, not in-request)',
        'Status/logs streaming from the running revision',
      ],
      infra: [
        'Cluster autoscaling for request-driven service pods (scale-to-zero)',
        'Host-based ingress + wildcard TLS for per-deployment subdomains',
        'Container registry + build executor (Cloud Run / Knative-style runtime)',
      ],
    },
  },
  {
    id: 'reserved-vm',
    name: 'Reserved VM',
    tagline: 'A dedicated always-on machine for predictable workloads.',
    description:
      'Runs your app on a dedicated, always-on instance with reserved CPU/RAM. Best for stateful servers, WebSocket apps, bots and workloads that must never cold-start.',
    status: 'coming-soon',
    bestFor: 'Always-on servers, bots, WebSocket apps',
    requires: {
      code: ['Reserved-tier selection + provisioning route', 'Lifecycle controls (start/stop/restart) + logs'],
      infra: ['Dedicated node pool / reserved compute', 'Host-based ingress + TLS', 'Persistent attached storage'],
    },
  },
  {
    id: 'scheduled',
    name: 'Scheduled',
    tagline: 'Run a job on a cron schedule.',
    description:
      'Runs your build/command on a recurring schedule (cron). Best for batch jobs, data syncs, report generation and periodic maintenance tasks.',
    status: 'coming-soon',
    bestFor: 'Cron jobs, batch tasks, periodic syncs',
    requires: {
      code: ['Cron expression input + validation', 'Scheduled-run trigger route + run history'],
      infra: ['Cluster CronJob scheduler wired to the build executor'],
    },
  },
] as const;

export function getDeploymentType(id: string): DeploymentType | undefined {
  return DEPLOYMENT_TYPES.find((type) => type.id === id);
}

export function isDeploymentTypeAvailable(id: string): boolean {
  return getDeploymentType(id)?.status === 'available';
}

/** The default selection — the only tier that is actually deployable today. */
export const DEFAULT_DEPLOYMENT_TYPE: DeploymentTypeId = 'static';
