/**
 * Replit-parity deployment-type model for the Publish panel.
 *
 * E-Code's managed deploy backend fulfils three tiers: `static` builds served at
 * `/static-deployments/<id>/`, `autoscale` managed HTTP services routed through
 * the preview proxy, and `scheduled` commands executed on a cron schedule with
 * persisted run history. Reserved VM mirrors Replit's dedicated-compute offering
 * but has no provisioning runtime yet, so it remains "coming soon" rather than
 * being faked. Keeping the taxonomy here as one source of truth lets the Publish
 * UI show the full menu while enabling only what the backend can fulfil.
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
      'Runs your app as a managed HTTP service on a durable runtime. Best for full-stack apps with a backend (Next.js SSR, Express, Remix server). The runtime, build and start command are auto-detected from your project.',
    status: 'available',
    bestFor: 'Full-stack apps with a server (SSR, APIs)',
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
    tagline: 'Run a command on a cron schedule.',
    description:
      'Runs a command on a recurring schedule inside your project sandbox, then stops. Billed for the seconds it actually ran (duration x machine size), not 24/7. Every run is kept with its exit code, duration and full logs. Best for batch jobs, data syncs, report generation and periodic maintenance.',

    /*
     * Now real: the executor lives in the api (scheduled-tasks.ts) and is backed
     * by the ScheduledTask / ScheduledTaskRun tables. See the Scheduled tab for
     * the run history.
     */
    status: 'available',
    bestFor: 'Cron jobs, batch tasks, periodic syncs',
  },
] as const;

export function getDeploymentType(id: string): DeploymentType | undefined {
  return DEPLOYMENT_TYPES.find((type) => type.id === id);
}

export function isDeploymentTypeAvailable(id: string): boolean {
  return getDeploymentType(id)?.status === 'available';
}

/** The default selection shown when the Publish panel opens. */
export const DEFAULT_DEPLOYMENT_TYPE: DeploymentTypeId = 'static';
