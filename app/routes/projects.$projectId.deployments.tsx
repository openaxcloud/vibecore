import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CloudCog,
  GitBranch,
  GitCommitHorizontal,
  Globe2,
  Copy,
  History,
  RotateCcw,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSearchParams } from 'react-router';
import {
  DEPLOY_POLL_INTERVAL_MS,
  DEPLOY_REQUEST_TIMEOUT_MS,
  deploymentsRedirectQuery,
  formatDeploymentDuration,
  shouldPollDeployments,
} from './projects.$projectId.deployments.view';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { ComputeTierPreview } from '~/components/deploy/ComputeTierPreview';
import { DeploySubNav, type DeployView } from '~/components/deploy/DeploySubNav';
import { DeploymentOverview } from '~/components/deploy/DeploymentOverview';
import { DeploymentTypeSelector } from '~/components/deploy/DeploymentTypeSelector';
import {
  DEFAULT_DEPLOYMENT_TYPE,
  getDeploymentType,
  type DeploymentType,
  type DeploymentTypeId,
} from '~/components/deploy/deployment-types';
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
import { projectAction, projectPageLoader } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';
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

const providers = [
  { id: 'static', name: 'Static export', detail: 'Upload a static build artifact.', icon: Globe2 },
  { id: 'vercel', name: 'Vercel', detail: 'Deploy with scoped Vercel integration.', icon: Cloud },
  { id: 'netlify', name: 'Netlify', detail: 'Deploy previews and production sites.', icon: Cloud },
  { id: 'github-pages', name: 'GitHub Pages', detail: 'Publish static apps from GitHub.', icon: GitBranch },
  { id: 'cloudflare-pages', name: 'Cloudflare Pages', detail: 'Edge static deployments.', icon: CloudCog },
  { id: 'google-cloud-run', name: 'Google Cloud Run', detail: 'Build an isolated container service.', icon: CloudCog },
  { id: 'docker', name: 'Custom Dockerfile', detail: 'Enterprise isolated builder only.', icon: ShieldCheck },
];

/**
 * True when `error` is a react-router redirect Response (3xx with a Location
 * header). apiRequest throws one of these when the session expired (401) or MFA
 * is required (403) on a page-navigation route, so the action must re-throw it
 * to let the browser follow the re-auth redirect instead of converting a
 * body-less redirect into a generic inline "Failed to …" banner.
 */
export const meta: MetaFunction = () => [{ title: 'Project deployments - E-Code' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<DeploymentsData>(args, (projectId) => `/projects/${projectId}/deployments`);
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
  const { project, data } = useLoaderData<typeof loader>();
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

  return (
    <ProjectShell
      projectId={project.id}
      title="Deployments"
      description="Ship preview, staging and production releases with scoped secrets, quota checks and redacted logs."
    >
      {actionData?.error ? (
        <div
          role="alert"
          className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {actionData.error}
        </div>
      ) : null}
      <DeploySubNav active={view} onSelect={setView} />

      {view === 'logs' ? <DeployLogsView deployment={latest} /> : null}
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

          <div className="grid gap-4">
            <div className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
              <DeploymentTypeSelector selected={deployType} onSelect={setDeployType} />
            </div>

            {deployType === 'static' ? (
              <Form
                method="post"
                className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md"
              >
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <div>
                  <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Deployment wizard</h2>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    Provider, environment, build command, output directory and controlled secret injection.
                  </p>
                </div>

                <fieldset className="grid gap-2 border-0 p-0">
                  <legend className="text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
                    Provider
                  </legend>
                  <div className="grid gap-2">
                    {providers.map((provider, index) => {
                      const Icon = provider.icon;
                      return (
                        <label
                          key={provider.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 transition-colors hover:bg-bolt-elements-background-depth-3"
                        >
                          <input
                            className="h-4 w-4 accent-bolt-elements-focus"
                            type="radio"
                            name="provider"
                            value={provider.id}
                            defaultChecked={index === 0}
                          />
                          <Icon className="h-4 w-4 text-bolt-elements-item-contentAccent" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-bolt-elements-textPrimary">
                              {provider.name}
                            </span>
                            <span className="block truncate text-xs text-bolt-elements-textSecondary">
                              {provider.detail}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field as="select" label="Environment" name="environment" defaultValue="preview">
                    <option value="preview">Preview</option>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </Field>
                  <Field label="Framework" name="framework" placeholder="Auto detect" />
                </div>
                <Field label="Build command" name="buildCommand" defaultValue="npm run build" />
                <Field label="Output directory" name="outputDirectory" defaultValue="dist" />
                <Field label="Git branch" name="branch" placeholder="main" />
                <div className="grid gap-1">
                  <Field label="Custom domain" name="customDomain" placeholder="app.example.com" />
                  <p className="text-[11px] text-bolt-elements-textTertiary">
                    Optional. After publishing, point your domain&apos;s DNS (CNAME) at the deployment. Managed TLS
                    certificates for custom domains are coming soon.
                  </p>
                </div>
                <Field label="GitHub repository URL" name="repositoryUrl" placeholder="https://github.com/acme/app" />
                <Field
                  as="textarea"
                  label="Environment variables"
                  name="envVars"
                  placeholder={'PUBLIC_API_URL=https://api.example.com\nSECRET_TOKEN=redacted-in-logs'}
                />
                <Field
                  label="Inject user-scoped secrets"
                  name="injectSecrets"
                  placeholder="DATABASE_URL,STRIPE_SECRET_KEY"
                />
                <label className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                  <input
                    className="h-4 w-4 accent-bolt-elements-focus"
                    type="checkbox"
                    name="previewDeployment"
                    defaultChecked
                  />
                  Create preview deployment URL when environment is not production.
                </label>

                <Button type="submit" disabled={busy} className="gap-2">
                  <Rocket className="h-4 w-4" aria-hidden />
                  {busy ? 'Deploying...' : 'Deploy project'}
                </Button>
              </Form>
            ) : (
              <ComingSoonPanel type={getDeploymentType(deployType)} />
            )}
          </div>
        </div>
      ) : null}
    </ProjectShell>
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

/** Logs view — the latest deployment's redacted build/deploy logs. */
function DeployLogsView({ deployment }: { deployment?: Deployment }) {
  const logs = deployment?.logs ?? [];

  return (
    <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor px-4 py-3 text-[14px] font-medium text-bolt-elements-textPrimary">
        <TerminalSquare className="h-4 w-4" aria-hidden /> Build &amp; deploy logs
      </div>
      <pre className="max-h-[480px] overflow-auto p-4 font-mono text-[12px] leading-5 text-bolt-elements-textSecondary">
        {logs.length ? logs.map((log) => `[${log.level}] ${log.message}`).join('\n') : 'No logs yet'}
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

function ComingSoonPanel({ type }: { type?: DeploymentType }) {
  if (!type) {
    return null;
  }

  return (
    <div className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <Sparkles className="h-4 w-4 text-bolt-elements-item-contentAccent" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary">
            {type.name}
            <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
              Coming soon
            </span>
          </h2>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">{type.description}</p>
        </div>
      </div>

      <ComputeTierPreview tier={type.id} />

      {type.requires ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <RequirementList title="In progress (platform)" items={type.requires.code} />
          <RequirementList title="Requires scale infrastructure" items={type.requires.infra} />
        </div>
      ) : null}

      <p className="text-xs text-bolt-elements-textTertiary">
        Need this tier now? Use Static for front-end apps today, or contact us to prioritise managed compute.
      </p>
    </div>
  );
}

function RequirementList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">{title}</p>
      <ul className="mt-2 grid gap-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs text-bolt-elements-textSecondary">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-bolt-elements-textTertiary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
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
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString();
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
      {status}
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
