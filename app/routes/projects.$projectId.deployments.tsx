import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useLoaderData, useNavigation } from '@remix-run/react';
import {
  Ban,
  CheckCircle2,
  Cloud,
  CloudCog,
  GitBranch,
  Globe2,
  History,
  RotateCcw,
  Rocket,
  ShieldCheck,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react';
import type React from 'react';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';
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
  customDomain?: string;
  logs: DeploymentLog[];
  createdAt?: string;
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

export const meta: MetaFunction = () => [{ title: 'Project deployments - VibeCore' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<DeploymentsData>(args, (projectId) => `/projects/${projectId}/deployments`);
export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      const envVars = parseEnvVars(body.envVars ?? '');
      await apiRequest(request, `/projects/${projectId}/deployments`, {
        method: 'POST',
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
        }),
      });

      return redirect(`/projects/${projectId}/deployments`);
    },
    cancel: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/cancel`, { method: 'POST' });
      return redirect(`/projects/${projectId}/deployments`);
    },
    redeploy: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/redeploy`, { method: 'POST' });
      return redirect(`/projects/${projectId}/deployments`);
    },
    rollback: async ({ request, projectId, body }) => {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/rollback`, { method: 'POST' });
      return redirect(`/projects/${projectId}/deployments`);
    },
  });

export default function ProjectDeploymentsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const latest = data.deployments[0];

  return (
    <ProjectShell
      projectId={project.id}
      title="Deployments"
      description="Ship preview, staging and production releases with scoped secrets, quota checks and redacted logs."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="grid gap-4">
          <div className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md md:grid-cols-3">
            <Metric
              label="Latest status"
              value={latest?.status ?? 'None'}
              tone={latest?.status === 'READY' ? 'good' : 'muted'}
            />
            <Metric label="Environment" value={latest?.environment ?? 'Not deployed'} />
            <Metric label="Live URL" value={latest?.url ? new URL(latest.url).hostname : 'No URL'} />
          </div>

          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
            <div className="flex items-center justify-between border-b border-bolt-elements-borderColor px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Deployment history</h2>
                <p className="text-xs text-bolt-elements-textSecondary">
                  Redeploy, cancel or rollback without leaving the project.
                </p>
              </div>
              <History className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
            </div>
            <div className="divide-y divide-bolt-elements-borderColor">
              {data.deployments.length ? (
                data.deployments.map((deployment) => (
                  <DeploymentRow key={deployment.id} deployment={deployment} busy={busy} />
                ))
              ) : (
                <div className="grid place-items-center gap-3 px-5 py-14 text-center">
                  <Rocket className="h-8 w-8 text-bolt-elements-textTertiary" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-bolt-elements-textPrimary">No deployments yet</p>
                    <p className="text-xs text-bolt-elements-textSecondary">
                      Use the wizard to create the first preview or production release.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <Form
          method="post"
          className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md"
        >
          <div>
            <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Deployment wizard</h2>
            <p className="text-xs text-bolt-elements-textSecondary">
              Provider, environment, build command, output directory and controlled secret injection.
            </p>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
              Provider
            </span>
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
                      <span className="block text-sm font-medium text-bolt-elements-textPrimary">{provider.name}</span>
                      <span className="block truncate text-xs text-bolt-elements-textSecondary">{provider.detail}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Git branch" name="branch" placeholder="main" />
            <Field label="Custom domain" name="customDomain" placeholder="app.example.com" />
          </div>
          <Field label="GitHub repository URL" name="repositoryUrl" placeholder="https://github.com/acme/app" />
          <Field
            as="textarea"
            label="Environment variables"
            name="envVars"
            placeholder={'PUBLIC_API_URL=https://api.example.com\nSECRET_TOKEN=redacted-in-logs'}
          />
          <Field label="Inject user-scoped secrets" name="injectSecrets" placeholder="DATABASE_URL,STRIPE_SECRET_KEY" />
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
      </div>
    </ProjectShell>
  );
}

function DeploymentRow({ deployment, busy }: { deployment: Deployment; busy: boolean }) {
  const ready = deployment.status === 'READY';

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
        </div>
        <p className="mt-2 truncate text-xs text-bolt-elements-textSecondary">
          {deployment.url ?? 'URL pending'} {deployment.customDomain ? `- ${deployment.customDomain}` : ''}
        </p>
        <div className="mt-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <div className="flex items-center gap-2 border-b border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textSecondary">
            <TerminalSquare className="h-4 w-4" aria-hidden />
            Redacted deployment logs
          </div>
          <pre className="max-h-40 overflow-auto p-3 font-mono text-[11px] leading-5 text-bolt-elements-textSecondary">
            {(deployment.logs ?? []).map((log) => `[${log.level}] ${log.message}`).join('\n') || 'No logs yet'}
          </pre>
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
        <InlineAction intent="redeploy" deploymentId={deployment.id} disabled={busy} icon={RotateCcw}>
          Redeploy
        </InlineAction>
        <InlineAction intent="rollback" deploymentId={deployment.id} disabled={busy || !ready} icon={History}>
          Rollback
        </InlineAction>
        <InlineAction intent="cancel" deploymentId={deployment.id} disabled={busy || ready} icon={Ban}>
          Cancel
        </InlineAction>
      </div>
    </article>
  );
}

function InlineAction({
  intent,
  deploymentId,
  disabled,
  icon,
  children,
}: {
  intent: string;
  deploymentId: string;
  disabled?: boolean;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const ActionIcon = icon;

  return (
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="deploymentId" value={deploymentId} />
      <Button type="submit" variant="outline" size="sm" disabled={disabled} className="gap-2">
        <ActionIcon className="h-3.5 w-3.5" aria-hidden />
        {children}
      </Button>
    </Form>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ready = status === 'READY';
  const failed = status === 'FAILED' || status === 'CANCELED';

  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        ready
          ? 'border-green-500/30 bg-green-500/10 text-green-300'
          : failed
            ? 'border-red-500/30 bg-red-500/10 text-red-300'
            : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
      )}
    >
      {ready ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <Rocket className="h-3 w-3" aria-hidden />}
      {status}
    </span>
  );
}

function Metric({ label, value, tone = 'muted' }: { label: string; value: string; tone?: 'good' | 'muted' }) {
  return (
    <div className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <p className="text-xs text-bolt-elements-textSecondary">{label}</p>
      <p
        className={classNames(
          'mt-2 truncate text-sm font-semibold',
          tone === 'good' ? 'text-green-300' : 'text-bolt-elements-textPrimary',
        )}
      >
        {value}
      </p>
    </div>
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
      .map((line) => {
        const [key, ...rest] = line.split('=');
        return [key.trim(), rest.join('=').trim()];
      })
      .filter(([key]) => key),
  );
}
