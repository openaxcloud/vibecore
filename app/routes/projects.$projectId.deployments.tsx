import {
  Ban,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  Globe2,
  Copy,
  History,
  Loader2,
  RotateCcw,
  Rocket,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { MetaFunction } from 'react-router';
import {
  Form,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from 'react-router';
import {
  DEPLOY_POLL_INTERVAL_MS,
  DEPLOY_REQUEST_TIMEOUT_MS,
  deploymentsRedirectQuery,
  formatDeploymentDuration,
  shouldPollDeployments,
} from './projects.$projectId.deployments.view';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { DeploySubNav, type DeployView } from '~/components/deploy/DeploySubNav';
import { DeploymentOverview } from '~/components/deploy/DeploymentOverview';
import { DEFAULT_DEPLOYMENT_TYPE, type DeploymentTypeId } from '~/components/deploy/deployment-types';
import { Button } from '~/components/ui/Button';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiErrorMessage,
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatUserAreaTime } from '~/lib/i18n/user-area-locale';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';
import { statusDisplayLabel } from '~/lib/user-facing-labels';
import { classNames } from '~/utils/classNames';

type DeploymentLog = { timestamp: string; level: 'info' | 'warn' | 'error'; message: string };
type Deployment = {
  id: string;
  provider: string;
  environment: 'preview' | 'staging' | 'production';
  status: string;
  url?: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  branch?: string;
  commitSha?: string;
  customDomain?: string;
  logs: DeploymentLog[];

  /** Set when this row was created by rolling back to a previous deployment. */
  rolledBackFromId?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
};
type DeploymentsData = { deployments: Deployment[] };

/**
 * True when `error` is a react-router redirect Response (3xx with a Location
 * header). apiRequest throws one of these when the session expired (401) or MFA
 * is required (403) on a page-navigation route, so the action must re-throw it
 * to let the browser follow the re-auth redirect instead of converting a
 * body-less redirect into a generic inline "Failed to …" banner.
 */
export const meta: MetaFunction = () => [{ title: 'Project deployments - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export type DeployDetect = {
  mode: 'server' | 'static' | 'unknown';
  framework: string;
  reason: string;
  error?: string;
  pending?: boolean;
};

/** The versioned rate card served by /projects/:id/deployments/rate-card. */
export type DeployRateCard = {
  version: number;
  currency: string;
  compute: { unitCents: number; requestCents: number };
  planKey: string;
  defaultMachineSize: string;
  machineSizes: Array<{
    key: string;
    label: string;
    vcpu: number;
    ramGb: number;
    computeUnitsPerSecond: number;
    available: boolean;
    reason?: 'plan' | 'capacity';
  }>;
};

/** ~$ per active hour for a size (compute units/s × 3600 × unit price). */
export function machineSizeHourlyDollars(card: DeployRateCard, size: { computeUnitsPerSecond: number }): string {
  const cents = size.computeUnitsPerSecond * 3600 * card.compute.unitCents;
  return `$${(cents / 100).toFixed(cents >= 100 ? 2 : 3)}`;
}

export const loader = async (args: EnterpriseLoaderArgs) => {
  /*
   * `?detect=1` is a lightweight side-channel the Publish panel's fetcher hits to
   * auto-detect the deploy mode (server vs static) WITHOUT choosing for the user.
   * It reuses this route (no extra file / single-fetch nesting) and returns only
   * the detection so the page's own loader shape is untouched.
   */
  const url = new URL(args.request.url);

  if (url.searchParams.get('detect') === '1') {
    const projectId = args.params.projectId;

    if (!projectId) {
      throw json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    try {
      const detected = await apiRequest<DeployDetect>(args.request, `/projects/${projectId}/deployments/detect`);

      return json({ detected });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      return json({
        detected: {
          mode: 'unknown' as const,
          framework: 'unknown',
          reason: 'Detection is unavailable right now — open the workspace and retry.',
          pending: true,
        },
      });
    }
  }

  /*
   * `?rateCard=1` side-channel (same pattern as `?detect=1`): the Publish card
   * fetches the versioned rate card — machine sizes, per-size availability for
   * the org's plan, unit prices — so the size selector renders from the card,
   * never from hard-coded UI strings.
   */
  if (url.searchParams.get('rateCard') === '1') {
    const projectId = args.params.projectId;

    if (!projectId) {
      throw json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    try {
      const rateCard = await apiRequest<DeployRateCard>(args.request, `/projects/${projectId}/deployments/rate-card`);

      return json({ rateCard });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      return json({ rateCard: null });
    }
  }

  return projectPageLoader<DeploymentsData>(args, (projectId) => `/projects/${projectId}/deployments`);
};
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      const envVars = parseEnvVars(body.envVars ?? '');

      /*
       * Workspace isolation — the deploy POST handler in services/api scopes
       * the build sandbox and Deployment row to `body.workspaceId` when it's
       * present. Read from the hidden input first, then fall back to the URL
       * query so `?workspace=ws-…` deep-links also deploy the right workspace.
       */
      const queryWorkspaceId = new URL(request.url).searchParams.get('workspace') ?? undefined;
      const workspaceId = body.workspaceId || queryWorkspaceId || undefined;

      try {
        await apiRequest(request, `/projects/${projectId}/deployments`, {
          method: 'POST',

          /*
           * The static provider runs `npm install` + `npm run build`
           * SYNCHRONOUSLY inside this POST (services/api caps it at 600s). A
           * freshly generated app's install alone routinely exceeds the
           * apiRequest default 30s AbortSignal, which would abort the fetch and
           * surface a hard "Failed to start deployment" even though the backend
           * keeps building and the deployment actually goes READY (and a retry
           * then 409s DEPLOYMENT_IN_PROGRESS). Override the signal to exceed the
           * backend build cap so the action waits for the real outcome.
           */
          signal: AbortSignal.timeout(DEPLOY_REQUEST_TIMEOUT_MS),
          body: JSON.stringify({
            provider: body.provider || 'static',
            environment: body.environment || 'preview',
            buildCommand: body.buildCommand || 'npm run build',
            outputDirectory: body.outputDirectory || 'dist',
            framework: body.framework || undefined,
            branch: body.branch || undefined,
            customDomain: body.customDomain || undefined,
            previewDeployment: body.previewDeployment === 'on',
            envVars,
            injectSecrets: (body.injectSecrets ?? '')
              .split(',')
              .map((secret) => secret.trim())
              .filter(Boolean),
            githubIntegration: body.repositoryUrl
              ? { repositoryUrl: body.repositoryUrl, branch: body.branch || undefined }
              : undefined,
            workspaceId,

            // Server deploys: rate-card machine size picked in the publish card.
            machineSize: body.machineSize || undefined,
          }),
        });
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        return json({ error: await apiErrorMessage(error, 'Failed to start deployment') });
      }

      const redirectQuery = deploymentsRedirectQuery(request.url, workspaceId);

      return redirect(`/projects/${projectId}/deployments${redirectQuery}`);
    },
    cancel: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/cancel`, { method: 'POST' });
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        return json({ error: await apiErrorMessage(error, 'Failed to cancel deployment') });
      }

      const redirectQuery = deploymentsRedirectQuery(request.url, body.workspaceId);

      return redirect(`/projects/${projectId}/deployments${redirectQuery}`);
    },
    redeploy: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/redeploy`, {
          method: 'POST',

          /* Redeploy re-runs the same synchronous static build (see deploy POST). */
          signal: AbortSignal.timeout(DEPLOY_REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        return json({ error: await apiErrorMessage(error, 'Failed to redeploy') });
      }

      const redirectQuery = deploymentsRedirectQuery(request.url, body.workspaceId);

      return redirect(`/projects/${projectId}/deployments${redirectQuery}`);
    },
    rollback: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/rollback`, {
          method: 'POST',
        });
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        return json({ error: await apiErrorMessage(error, 'Failed to roll back') });
      }

      const redirectQuery = deploymentsRedirectQuery(request.url, body.workspaceId);

      return redirect(`/projects/${projectId}/deployments${redirectQuery}`);
    },
  });

export default function ProjectDeploymentsPage() {
  /*
   * The loader is dual-purpose (the page shape, plus a `?detect=1` side-channel
   * the Publish card hits via a fetcher), so `typeof loader` is a union. The
   * PAGE render is always the page shape — the detect branch is only ever read
   * from the fetcher — so narrow to it here.
   */
  const { project, data } = useLoaderData() as { project: { id: string }; data: DeploymentsData };
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== 'idle';
  const latest = data.deployments[0];

  /*
   * Live deploy status — the panel otherwise renders a static loader snapshot,
   * so a QUEUED/BUILDING row never transitions to READY/FAILED until a manual
   * page reload. The GET loader already reconciles in-flight builds on each hit
   * ("so a CLIENT POLLING this endpoint sees real status transitions"), so we
   * just re-run it on an interval while any row is still building and stop once
   * every row is terminal.
   */
  const polling = shouldPollDeployments(data.deployments);

  useEffect(() => {
    if (!polling) {
      return undefined;
    }

    const interval = setInterval(() => {
      if (revalidator.state === 'idle') {
        revalidator.revalidate();
      }
    }, DEPLOY_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [polling, revalidator]);

  /*
   * Carry the active workspace id from the IDE shell (e.g. `?workspace=ws-1`)
   * into the form so the API scopes the build sandbox and Deployment row to
   * the right workspace. Legacy projects without workspaces submit no value
   * and continue to deploy from the project root.
   */
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('workspace') ?? '';

  /*
   * Replit-style Publish: the deployment-type selector is the primary choice.
   * Only `static` is deployable today (the managed backend is static-only), so
   * the compute tiers render an honest "coming soon" panel instead of a form
   * that would fail server-side. Default to the one tier that actually ships.
   */
  const [deployType, setDeployType] = useState<DeploymentTypeId>(DEFAULT_DEPLOYMENT_TYPE);

  // Replit-style sub-nav: Overview · Logs · Domains · Manage.
  const [view, setView] = useState<DeployView>('overview');

  /*
   * P2: reflect the ACTUAL build status (not just the fast async POST). The
   * create POST now returns 202 immediately and the build runs in the pod, so
   * the loader-poll drives QUEUED/BUILDING → READY/FAILED with logs growing each
   * tick. Jump to the Logs view when a build starts so the user watches it live.
   */
  const latestStatus = latest?.status ?? '';
  const building = latestStatus === 'QUEUED' || latestStatus === 'BUILDING';
  const buildingRef = useRef(false);

  useEffect(() => {
    if (building && !buildingRef.current) {
      setView('logs');
    }

    buildingRef.current = building;
  }, [building]);

  return (
    <ProjectShell
      projectId={project.id}
      title="Deployments"
      description="Ship preview, staging and production releases with scoped secrets, quota checks and redacted logs."
    >
      {actionData?.error ? (
        <div
          role="alert"
          className="mb-6 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error-text)]"
        >
          {actionData.error}
        </div>
      ) : null}
      <DeploySubNav active={view} onSelect={setView} />

      {view === 'logs' ? <DeployLogsView deployment={latest} building={building} /> : null}
      {view === 'domains' ? <DeployDomainsView deployment={latest} /> : null}
      {view === 'manage' ? (
        <DeployHistory deployments={data.deployments} busy={busy} workspaceId={workspaceId} />
      ) : null}

      {view === 'overview' ? (
        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Form method="post" className="contents">
                <input type="hidden" name="intent" value="redeploy" />
                <input type="hidden" name="deploymentId" value={latest?.id ?? ''} />
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <DeployActionButton primary type="submit" disabled={busy || !latest}>
                  <Rocket className="h-3.5 w-3.5" aria-hidden /> Republish
                </DeployActionButton>
              </Form>
              <DeployActionButton type="button" onClick={() => setView('manage')}>
                <Settings className="h-3.5 w-3.5" aria-hidden /> Adjust settings
              </DeployActionButton>
              {latest?.url ? (
                <DeployActionButton
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(latest.url as string)}
                  title="Copy deployment link"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy deployment link
                </DeployActionButton>
              ) : null}
              <DeployActionButton type="button" disabled title="Security scanning is coming soon">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Run security scan
              </DeployActionButton>
            </div>

            <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">Production</h2>
            <DeploymentOverview
              deployment={latest}
              deploymentTypeId={deployType}
              databaseConnected={false}
              usageHref="/usage"
              onManage={() => setView('manage')}
              onBuyDomain={() => setView('domains')}
              onManageDatabase={() => setView('manage')}
            />
          </section>

          <DeployPublishCard
            projectId={project.id}
            workspaceId={workspaceId}
            busy={busy}
            building={building}
            onDetectedMode={(mode) => setDeployType(mode === 'server' ? 'autoscale' : 'static')}
          />
        </div>
      ) : null}
    </ProjectShell>
  );
}

/**
 * Replit-parity Publish card: the user does NOT choose Static vs Server. We
 * auto-detect the deploy mode from the project (detectServerRuntime, via the
 * `?detect=1` loader side-channel), SHOW it ("Detected: Next.js → server
 * deployment"), and publish with a single button. An "Advanced" disclosure lets
 * you override the mode, but guessing is never required, and a detection failure
 * surfaces a clear message instead of a silent wrong-mode deploy.
 */
function DeployPublishCard({
  projectId,
  workspaceId,
  busy,
  building,
  onDetectedMode,
}: {
  projectId: string;
  workspaceId: string;
  busy: boolean;
  building: boolean;
  onDetectedMode: (mode: 'server' | 'static') => void;
}) {
  const detectFetcher = useFetcher<{ detected: DeployDetect }>();
  const rateCardFetcher = useFetcher<{ rateCard: DeployRateCard | null }>();
  const [override, setOverride] = useState<'auto' | 'server' | 'static'>('auto');

  const detectHref = `/projects/${projectId}/deployments?detect=1${
    workspaceId ? `&workspace=${encodeURIComponent(workspaceId)}` : ''
  }`;

  // Detect on mount and whenever the workspace changes.
  useEffect(() => {
    detectFetcher.load(detectHref);
  }, [detectHref]);

  // The rate card (machine sizes + availability) drives the server-mode selector.
  useEffect(() => {
    rateCardFetcher.load(`/projects/${projectId}/deployments?rateCard=1`);
  }, [projectId]);

  const rateCard = rateCardFetcher.data?.rateCard ?? null;

  const detected = detectFetcher.data?.detected;
  const detecting = detectFetcher.state !== 'idle' || !detected;
  const detectedMode = detected?.mode ?? 'unknown';

  // The effective mode: an explicit override wins; otherwise the detected mode.
  const effectiveMode: 'server' | 'static' | 'unknown' = override === 'auto' ? detectedMode : override;

  useEffect(() => {
    if (effectiveMode === 'server' || effectiveMode === 'static') {
      onDetectedMode(effectiveMode);
    }
  }, [effectiveMode]);

  const provider = effectiveMode === 'server' ? 'server' : 'static';
  const canPublish = (effectiveMode === 'server' || effectiveMode === 'static') && !busy && !building;

  return (
    <div className="grid gap-4">
      {/* Detected-mode banner — transparency, no opaque magic. */}
      <div className="grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Publish</h2>
        {detecting ? (
          <p className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Detecting how your app should deploy…
          </p>
        ) : detectedMode === 'unknown' && override === 'auto' ? (
          <div className="grid gap-2">
            <p className="flex items-start gap-2 text-xs text-[var(--status-error-text)]">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{detected?.reason ?? 'Could not detect how this app should deploy.'}</span>
            </p>
            <button
              type="button"
              onClick={() => detectFetcher.load(detectHref)}
              className="justify-self-start text-xs font-medium text-bolt-elements-item-contentAccent hover:underline"
            >
              Re-detect
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-success-text,currentColor)]" aria-hidden />
            <span>
              Detected: <span className="font-medium text-bolt-elements-textPrimary">{detected?.framework}</span> →{' '}
              <span className="font-medium text-bolt-elements-textPrimary">
                {effectiveMode === 'server' ? 'server deployment' : 'static deployment'}
              </span>
              {override !== 'auto' ? ' (overridden)' : ''}
            </span>
          </p>
        )}
      </div>

      <Form
        method="post"
        className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md"
      >
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="provider" value={provider} />

        <p className="text-xs text-bolt-elements-textSecondary">
          {effectiveMode === 'server'
            ? 'Runs your app as a managed HTTP service on a durable runtime. Build and start command are auto-detected; your project secrets (including the database URL) are injected automatically.'
            : 'Builds your app and serves the output as a fast static site at a public URL.'}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field as="select" label="Environment" name="environment" defaultValue="preview">
            <option value="preview">Preview</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </Field>
          <Field label="Custom domain" name="customDomain" placeholder="app.example.com" />
        </div>

        {/*
         * Machine size (server mode) — rendered from the versioned rate card,
         * never hard-coded. Sizes the plan or current capacity cannot grant stay
         * visible but disabled, so the ladder is honest about what exists.
         */}
        {effectiveMode === 'server' && rateCard ? (
          <div className="grid gap-1.5">
            <Field as="select" label="Machine size" name="machineSize" defaultValue={rateCard.defaultMachineSize}>
              {rateCard.machineSizes.map((size) => (
                <option key={size.key} value={size.key} disabled={!size.available}>
                  {size.label} — {machineSizeHourlyDollars(rateCard, size)}/h active
                  {size.available ? '' : size.reason === 'plan' ? ' (upgrade plan)' : ' (unavailable)'}
                </option>
              ))}
            </Field>
            <p className="text-[11px] text-bolt-elements-textTertiary">
              Billed only while your app is running — it sleeps automatically after 15 min without traffic and wakes on
              the next request. Rate card v{rateCard.version}.
            </p>
          </div>
        ) : null}

        <Field
          as="textarea"
          label="Environment variables"
          name="envVars"
          placeholder={'PUBLIC_API_URL=https://api.example.com\nFEATURE_FLAG=on'}
        />

        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary">
            Advanced — override the deploy mode
          </summary>
          <div className="mt-2 grid gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
            {(
              [
                ['auto', 'Auto (recommended) — use the detected mode'],
                ['server', 'Server — managed HTTP service'],
                ['static', 'Static — built output, no server'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-xs text-bolt-elements-textSecondary"
              >
                <input
                  className="h-3.5 w-3.5 accent-bolt-elements-focus"
                  type="radio"
                  name="deployModeOverride"
                  value={value}
                  checked={override === value}
                  onChange={() => setOverride(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </details>

        <Button type="submit" disabled={!canPublish} className="gap-2">
          <Rocket className="h-4 w-4" aria-hidden />
          {busy || building ? 'Publishing…' : 'Publish'}
        </Button>
      </Form>
    </div>
  );
}

/** Republish/Adjust/Security action buttons — Replit-measured 32px/r6/13.3px; primary = action blue. */
function DeployActionButton({
  primary,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...props}
      className={classNames(
        'inline-flex h-[32px] items-center gap-1.5 rounded-[6px] px-3 text-[13.3px] font-medium disabled:opacity-60',
        primary
          ? 'font-semibold text-white hover:opacity-90'
          : 'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
      )}
      style={primary ? { background: 'var(--vc-ide-accent-action)' } : undefined}
    >
      {children}
    </button>
  );
}

/**
 * Logs view — the latest deployment's redacted build/deploy logs, streamed live.
 * The loader-poll refreshes this row every few seconds while a build runs and the
 * API flushes logs to the record incrementally, so lines appear as they happen
 * (no frozen screen). Auto-scrolls, colours error lines, and shows a clear
 * building / failed / deployed header.
 */
function DeployLogsView({ deployment, building = false }: { deployment?: Deployment; building?: boolean }) {
  const logs = deployment?.logs ?? [];
  const status = deployment?.status ?? '';
  const failed = status === 'FAILED';
  const ready = status === 'READY';

  // Keep the newest line in view as logs stream in (only when pinned to bottom).
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;

    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length, status]);

  return (
    <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="flex items-center justify-between gap-2 border-b border-bolt-elements-borderColor px-4 py-3 text-[14px] font-medium text-bolt-elements-textPrimary">
        <span className="flex items-center gap-2">
          <TerminalSquare className="h-4 w-4" aria-hidden /> Build &amp; deploy logs
        </span>
        {building ? (
          <span className="flex items-center gap-1.5 text-[13px] text-[var(--vc-ide-accent-action)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Building…
          </span>
        ) : failed ? (
          <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--status-error-text)' }}>
            <Ban className="h-3.5 w-3.5" aria-hidden /> Failed
          </span>
        ) : ready ? (
          <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--status-ok, #3fb950)' }}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Deployed
          </span>
        ) : null}
      </div>
      <pre
        ref={preRef}
        className="max-h-[480px] overflow-auto p-4 font-mono text-[12px] leading-5 text-bolt-elements-textSecondary"
        aria-live="polite"
      >
        {logs.length ? (
          logs.map((log, index) => (
            <div key={index} style={log.level === 'error' ? { color: 'var(--status-error-text)' } : undefined}>
              {`[${log.level}] ${log.message}`}
            </div>
          ))
        ) : (
          <span className="text-bolt-elements-textTertiary">
            {building ? 'Starting the build…' : 'No logs yet — click Deploy project to build and publish.'}
          </span>
        )}
      </pre>
    </div>
  );
}

/** Domains view — live URL + custom domain + DNS guidance. */
function DeployDomainsView({ deployment }: { deployment?: Deployment }) {
  return (
    <div className="mt-4 grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
      <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">Domains</h2>
      <div className="grid gap-2 text-[14px]">
        <div className="flex items-center gap-2">
          <Globe2 className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
          {deployment?.url ? (
            <a
              href={deployment.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-[var(--vc-ide-accent-action)] hover:underline"
            >
              {deployment.url}
            </a>
          ) : (
            <span className="text-bolt-elements-textTertiary">No live URL yet — publish first.</span>
          )}
        </div>
        {deployment?.customDomain ? (
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
            <span className="text-bolt-elements-textPrimary">{deployment.customDomain}</span>
          </div>
        ) : null}
      </div>
      <p className="text-[12px] text-bolt-elements-textTertiary">
        Add a custom domain in the Overview wizard. After publishing, point your domain&apos;s DNS (CNAME) at the
        deployment; managed TLS for custom domains is coming soon.
      </p>
    </div>
  );
}

/** Manage view — full deployment history with redeploy/cancel/rollback. */
function DeployHistory({
  deployments,
  busy,
  workspaceId,
}: {
  deployments: Deployment[];
  busy: boolean;
  workspaceId: string;
}) {
  return (
    <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="flex items-center justify-between border-b border-bolt-elements-borderColor px-5 py-4">
        <div>
          <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">Deployment history</h2>
          <p className="text-xs text-bolt-elements-textSecondary">
            Redeploy, cancel or rollback without leaving the project.
          </p>
        </div>
        <History className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
      </div>
      <div className="divide-y divide-bolt-elements-borderColor">
        {deployments.length ? (
          deployments.map((deployment) => (
            <DeploymentRow key={deployment.id} deployment={deployment} busy={busy} workspaceId={workspaceId} />
          ))
        ) : (
          <div className="grid place-items-center gap-3 px-5 py-14 text-center">
            <Rocket className="h-8 w-8 text-bolt-elements-textTertiary" aria-hidden />
            <div>
              <p className="text-sm font-medium text-bolt-elements-textPrimary">No deployments yet</p>
              <p className="text-xs text-bolt-elements-textSecondary">
                Use the Overview wizard to create the first preview or production release.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Time-of-day label for a log line. Only rendered after the user expands the
 * logs (a client-side interaction), so locale formatting can't cause an
 * SSR/hydration mismatch. Falls back to the raw value for malformed timestamps.
 */
function formatLogTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return formatUserAreaTime(date) ?? timestamp;
}

/**
 * One timeline entry: status pill + provider/environment chips, then a meta
 * line built from the fields the Deployment row REALLY stores — commit sha,
 * branch, build duration (startedAt→finishedAt) and age. The mockup's "author"
 * column has no backing field (deployments aren't attributed to a git author in
 * the data model) so it is intentionally not rendered. Logs are a flat
 * timestamped line array (no per-step structure), rendered as an expandable
 * section collapsed by default.
 */
function DeploymentRow({
  deployment,
  busy,
  workspaceId,
}: {
  deployment: Deployment;
  busy: boolean;
  workspaceId: string;
}) {
  const ready = deployment.status === 'READY';
  const logs = deployment.logs ?? [];
  const [logsOpen, setLogsOpen] = useState(false);
  const duration = formatDeploymentDuration(deployment.startedAt, deployment.finishedAt);

  return (
    <article className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={deployment.status} />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">{deployment.provider}</span>
          <span className="rounded bg-bolt-elements-background-depth-1 px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary">
            {deployment.environment}
          </span>
          {deployment.framework ? (
            <span className="rounded bg-bolt-elements-background-depth-1 px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary">
              {deployment.framework}
            </span>
          ) : null}
          {deployment.rolledBackFromId ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-bolt-elements-background-depth-1 px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary"
              title={`Created by rolling back to deployment ${deployment.rolledBackFromId}`}
            >
              <History className="h-3 w-3" aria-hidden /> rollback
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-bolt-elements-textSecondary">
          {deployment.commitSha ? (
            <span className="inline-flex items-center gap-1 font-mono" title={deployment.commitSha}>
              <GitCommitHorizontal className="h-3.5 w-3.5 text-bolt-elements-textTertiary" aria-hidden />
              {deployment.commitSha.slice(0, 7)}
            </span>
          ) : null}
          {deployment.branch ? (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5 text-bolt-elements-textTertiary" aria-hidden />
              {deployment.branch}
            </span>
          ) : null}
          {duration ? (
            <span className="inline-flex items-center gap-1" title="Build duration">
              <Timer className="h-3.5 w-3.5 text-bolt-elements-textTertiary" aria-hidden />
              {duration}
            </span>
          ) : null}
          {deployment.createdAt ? <RelativeTime value={deployment.createdAt} prefix="deployed" /> : null}
        </div>
        <p className="mt-2 truncate text-xs text-bolt-elements-textSecondary">
          {deployment.url ?? 'URL pending'} {deployment.customDomain ? `- ${deployment.customDomain}` : ''}
        </p>
        <div className="mt-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <button
            type="button"
            onClick={() => setLogsOpen((open) => !open)}
            aria-expanded={logsOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-bolt-elements-textSecondary transition-colors hover:text-bolt-elements-textPrimary"
          >
            <ChevronDown
              className={classNames('h-4 w-4 transition-transform', logsOpen ? '' : '-rotate-90')}
              aria-hidden
            />
            <TerminalSquare className="h-4 w-4" aria-hidden />
            Redacted deployment logs
            <span className="ml-auto text-[11px] font-normal text-bolt-elements-textTertiary">
              {logs.length} {logs.length === 1 ? 'line' : 'lines'}
            </span>
          </button>
          {logsOpen ? (
            <div className="max-h-40 overflow-auto border-t border-bolt-elements-borderColor p-3 font-mono text-[11px] leading-5 text-bolt-elements-textSecondary">
              {logs.length ? (
                logs.map((log, index) => (
                  <div
                    key={index}
                    className="whitespace-pre-wrap"
                    style={
                      log.level === 'error'
                        ? { color: 'var(--status-error-text)' }
                        : log.level === 'warn'
                          ? { color: 'var(--status-warning-text)' }
                          : undefined
                    }
                  >
                    [{formatLogTimestamp(log.timestamp)}] [{log.level}] {log.message}
                  </div>
                ))
              ) : (
                <span>No logs yet</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap content-start gap-2 lg:justify-end">
        {deployment.url ? (
          <a
            className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
            href={deployment.url}
            target="_blank"
            rel="noreferrer"
          >
            Open
          </a>
        ) : null}
        <InlineAction
          intent="redeploy"
          deploymentId={deployment.id}
          workspaceId={workspaceId}
          disabled={busy}
          icon={RotateCcw}
        >
          Redeploy
        </InlineAction>
        <InlineAction
          intent="rollback"
          deploymentId={deployment.id}
          workspaceId={workspaceId}
          disabled={busy || !ready}
          icon={History}
        >
          Rollback
        </InlineAction>
        <InlineAction
          intent="cancel"
          deploymentId={deployment.id}
          workspaceId={workspaceId}
          disabled={busy || ready}
          icon={Ban}
        >
          Cancel
        </InlineAction>
      </div>
    </article>
  );
}

/*
 * Rollback/cancel are production-impacting; require an explicit confirmation
 * dialog (ui/ConfirmationDialog, not window.confirm) before firing them.
 * Redeploy is non-destructive (no prompt). The rollback POST is fully real
 * server-side: it re-publishes the target deployment (triggering a provider
 * rollback for netlify/vercel) and records a `deployment.rollback` audit event.
 */
const confirmDialogs: Record<
  string,
  { title: string; description: string; confirmLabel: string; variant: 'default' | 'destructive' }
> = {
  rollback: {
    title: 'Roll back to this deployment?',
    description:
      'This changes what is currently served: the selected build is re-published as a new deployment and an audit event is recorded.',
    confirmLabel: 'Roll back',
    variant: 'default',
  },
  cancel: {
    title: 'Cancel this deployment?',
    description: 'The in-progress build stops and the deployment is marked as canceled.',
    confirmLabel: 'Cancel deployment',
    variant: 'destructive',
  },
};

function InlineAction({
  intent,
  deploymentId,
  workspaceId,
  disabled,
  icon,
  children,
}: {
  intent: string;
  deploymentId: string;
  workspaceId: string;
  disabled?: boolean;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const ActionIcon = icon;
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirm = confirmDialogs[intent];

  return (
    <>
      <Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="deploymentId" value={deploymentId} />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <Button
          type={confirm ? 'button' : 'submit'}
          onClick={confirm ? () => setConfirmOpen(true) : undefined}
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-2"
        >
          <ActionIcon className="h-3.5 w-3.5" aria-hidden />
          {children}
        </Button>
      </Form>
      {confirm ? (
        <ConfirmationDialog
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);

            // requestSubmit (not submit()) fires the submit event react-router intercepts.
            formRef.current?.requestSubmit();
          }}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          variant={confirm.variant}
        />
      ) : null}
    </>
  );
}

/**
 * Status pill on live status tokens: READY=success, FAILED=error,
 * CANCELED=warning (deliberate stop, not a failure), QUEUED/BUILDING=info.
 */
function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'READY' ? 'success' : status === 'FAILED' ? 'error' : status === 'CANCELED' ? 'warning' : 'info';

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: `var(--status-${tone}-text)`,
        borderColor: `color-mix(in srgb, var(--status-${tone}-text) 30%, transparent)`,
        background: `color-mix(in srgb, var(--status-${tone}-text) 10%, transparent)`,
      }}
    >
      {status === 'READY' ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden />
      ) : (
        <Rocket className="h-3 w-3" aria-hidden />
      )}
      {statusDisplayLabel(status)}
    </span>
  );
}

function Field({
  label,
  name,
  placeholder,
  defaultValue,
  as = 'input',
  children,
}: {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  as?: 'input' | 'textarea' | 'select';
  children?: React.ReactNode;
}) {
  const className =
    'w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm text-bolt-elements-textPrimary outline-none transition-colors placeholder:text-bolt-elements-textTertiary focus:border-bolt-elements-focus';

  return (
    <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
      {label}
      {as === 'textarea' ? (
        <textarea
          className={`${className} min-h-24 py-2 normal-case tracking-normal`}
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue}
        />
      ) : as === 'select' ? (
        <select className={`${className} h-10 normal-case tracking-normal`} name={name} defaultValue={defaultValue}>
          {children}
        </select>
      ) : (
        <input
          className={`${className} h-10 normal-case tracking-normal`}
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue}
        />
      )}
    </label>
  );
}

function parseEnvVars(value: string) {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.includes('='))
      .map((line) => {
        const [key, ...rest] = line.split('=');
        return [key.trim(), rest.join('=').trim()];
      })
      .filter(([key]) => key),
  );
}
