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
  LockKeyhole,
  RotateCcw,
  Rocket,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
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
import { DeploymentRuntimeCard } from '~/components/deploy/DeploymentRuntimeCard';
import {
  isDeploymentPlanReadyForPublish,
  PlanDeploymentControls,
  type DeploymentPlanEntitlements,
  type DeploymentPlanProvider,
} from '~/components/deploy/PlanDeploymentControls';
import {
  isValidReservedVmSelection,
  RESERVED_VM_TIER_IDS,
  ReservedVmConfigurator,
  validateReservedVmTiers,
  type ReservedVmTier,
  type ReservedVmTierId,
} from '~/components/deploy/ReservedVmConfigurator';
import {
  ensureDeploymentIdempotencyKey,
  resolveDeploymentIdempotencyKey,
} from '~/components/deploy/deployment-idempotency';
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
import {
  formatProjectCopyPlural,
  formatProjectUserAreaCurrency,
  getProjectDeploymentsCopy,
  interpolateProjectCopy,
  resolveProjectUserAreaLanguage,
  type ProjectDeploymentsCopy,
  type ProjectUserAreaLanguage,
} from '~/lib/i18n/catalogs/project-user-area';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { formatUserAreaTime } from '~/lib/i18n/user-area-locale';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

type DeploymentLog = { timestamp: string; level: 'info' | 'warn' | 'error'; message: string };
type DeploymentAccessMode = 'PUBLIC' | 'PASSWORD_PROTECTED' | 'WORKSPACE_ONLY' | 'INVITE_ONLY';
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
  machineSize?: string;
  runtimeKind?: 'autoscale' | 'reserved-vm';
  runtimeVersion?: number;
  reservedVmTier?: ReservedVmTierId;
  logs: DeploymentLog[];
  accessPolicy?: {
    mode: DeploymentAccessMode;
    version: number;
    revision: string;
    createdAt: string | null;
  };
  accessPolicyState?: 'ACTIVE' | 'LOCKED';
  accessPolicyCanManage?: boolean;

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
export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getProjectDeploymentsCopy(rootData?.language).metaTitle }];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

const DEPLOYMENT_DOMAIN_PLACEHOLDER = 'app.example.com';

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
  reservedVm: {
    enabled: boolean;
    reasonCode?: string;
    paidPlanEligible: boolean;
    termsVersion: string;
    tiers: ReservedVmTier[];
  };
};

type ReservedVmSubmission = Readonly<{
  tier: ReservedVmTierId;
  termsVersion: string;
  monthlyPriceCents: number;
}>;

const RESERVED_VM_SUBMISSION_CONFIRMATION = 'confirmation' as const;
const RESERVED_VM_SUBMISSION_PRICING = 'pricing' as const;

export function parseReservedVmSubmission(
  body: Readonly<Record<string, string>>,
): { ok: true; value: ReservedVmSubmission } | { ok: false; reason: 'confirmation' | 'pricing' } {
  if (body.reservedVmConfirmation !== 'on') {
    return { ok: false, reason: RESERVED_VM_SUBMISSION_CONFIRMATION };
  }

  const termsVersion = body.reservedVmTermsVersion?.trim() ?? '';
  const monthlyPriceCents = Number(body.reservedVmMonthlyPriceCents);

  if (
    termsVersion.length < 1 ||
    termsVersion.length > 128 ||
    !Number.isInteger(monthlyPriceCents) ||
    !isValidReservedVmSelection(body.reservedVmTier ?? '', monthlyPriceCents)
  ) {
    return { ok: false, reason: RESERVED_VM_SUBMISSION_PRICING };
  }

  return {
    ok: true,
    value: {
      tier: body.reservedVmTier as ReservedVmTierId,
      termsVersion,
      monthlyPriceCents,
    },
  };
}

export type DeployPlanEntitlementsData = {
  planEntitlements: DeploymentPlanEntitlements | null;
  error: string | null;
};

function isDeploymentPlanProvider(value: string | null): value is DeploymentPlanProvider {
  return value === 'static' || value === 'server';
}

export function deploymentPlanRequestFields(body: { publishRegion?: string; removeBrandingBadge?: string }): {
  publishRegion?: string;
  removeBrandingBadge: boolean;
} {
  const publishRegion = body.publishRegion?.trim();

  return {
    ...(publishRegion ? { publishRegion } : {}),
    removeBrandingBadge: body.removeBrandingBadge === 'on',
  };
}

/** ~$ per active hour for a size (compute units/s × 3600 × unit price). */
export function machineSizeHourlyDollars(
  card: DeployRateCard,
  size: { computeUnitsPerSecond: number },
  language: ProjectUserAreaLanguage = 'en',
): string {
  const cents = size.computeUnitsPerSecond * 3600 * card.compute.unitCents;
  return formatProjectUserAreaCurrency(cents / 100, card.currency, language, cents >= 100 ? 2 : 3);
}

export const loader = async (args: EnterpriseLoaderArgs) => {
  /*
   * `?detect=1` is a lightweight side-channel the Publish panel's fetcher hits to
   * auto-detect the deploy mode (server vs static) WITHOUT choosing for the user.
   * It reuses this route (no extra file / single-fetch nesting) and returns only
   * the detection so the page's own loader shape is untouched.
   */
  const url = new URL(args.request.url);
  const copy = getProjectDeploymentsCopy(resolveRequestLocale(args.request).language);

  if (url.searchParams.get('detect') === '1') {
    const projectId = args.params.projectId;

    if (!projectId) {
      throw json({ ok: false, error: copy.errors.projectNotFound }, { status: 404 });
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
          reason: copy.errors.detectionUnavailable,
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
      throw json({ ok: false, error: copy.errors.projectNotFound }, { status: 404 });
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

  /*
   * Server-authoritative publication policy for the currently detected
   * provider. The browser never derives badge/region rights from a plan name.
   */
  if (url.searchParams.get('planEntitlements') === '1') {
    const projectId = args.params.projectId;
    const provider = url.searchParams.get('provider');

    if (!projectId) {
      throw json({ ok: false, error: copy.errors.projectNotFound }, { status: 404 });
    }

    if (!isDeploymentPlanProvider(provider)) {
      return json<DeployPlanEntitlementsData>(
        { planEntitlements: null, error: copy.publish.entitlements.providerEdgeRequired },
        { status: 400 },
      );
    }

    try {
      const planEntitlements = await apiRequest<DeploymentPlanEntitlements>(
        args.request,
        `/projects/${projectId}/deployments/plan-entitlements?provider=${encodeURIComponent(provider)}`,
      );

      return json<DeployPlanEntitlementsData>({ planEntitlements, error: null });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      return json<DeployPlanEntitlementsData>({
        planEntitlements: null,
        error: await apiErrorMessage(error, copy.publish.entitlements.errorDescription),
      });
    }
  }

  return projectPageLoader<DeploymentsData>(args, (projectId) => `/projects/${projectId}/deployments`);
};

async function localizedDeploymentApiError(
  error: unknown,
  request: Request,
  key: keyof ProjectDeploymentsCopy['errors'],
): Promise<string> {
  const language = resolveProjectUserAreaLanguage(resolveRequestLocale(request).language);
  const fallback = getProjectDeploymentsCopy(language).errors[key];

  /*
   * apiRequest forwards the resolved locale and only exposes the API's public
   * error contract, so entitlement/provider denials remain precise in EN/FR.
   */
  return apiErrorMessage(error, fallback);
}

export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      const envVars = parseEnvVars(body.envVars ?? '');
      const reservedVmRequested = body.runtimeKind === 'reserved-vm';
      const reservedVmSubmission = reservedVmRequested ? parseReservedVmSubmission(body) : null;
      const idempotencyKey = resolveDeploymentIdempotencyKey(body.idempotencyKey);

      if (reservedVmSubmission && !reservedVmSubmission.ok) {
        const localizedCopy = getProjectDeploymentsCopy(resolveRequestLocale(request).language);

        return json(
          {
            error:
              reservedVmSubmission.reason === 'confirmation'
                ? localizedCopy.errors.reservedConfirmationRequired
                : localizedCopy.errors.reservedPricingInvalid,
          },
          { status: 400 },
        );
      }

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
          headers: { 'Idempotency-Key': idempotencyKey },
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
            runtimeKind: body.provider === 'server' ? (reservedVmRequested ? 'reserved-vm' : 'autoscale') : undefined,
            reservedVmTier: reservedVmSubmission?.ok ? reservedVmSubmission.value.tier : undefined,
            reservedVmConfirmation: reservedVmSubmission?.ok
              ? {
                  accepted: true,
                  termsVersion: reservedVmSubmission.value.termsVersion,
                  monthlyPriceCents: reservedVmSubmission.value.monthlyPriceCents,
                }
              : undefined,
            ...deploymentPlanRequestFields(body),
            accessMode: body.accessMode || 'INVITE_ONLY',
            accessPassword: body.accessMode === 'PASSWORD_PROTECTED' ? body.accessPassword || undefined : undefined,
          }),
        });
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        return json({ error: await localizedDeploymentApiError(error, request, 'startFailed') });
      }

      const redirectQuery = deploymentsRedirectQuery(request.url, workspaceId);

      return redirect(`/projects/${projectId}/deployments${redirectQuery}`);
    },
    runtime: async ({ request, projectId, body }) => {
      const runtimeKind = body.runtimeKind;
      const expectedRuntimeVersion = Number(body.expectedRuntimeVersion);
      const idempotencyKey = resolveDeploymentIdempotencyKey(body.idempotencyKey);

      if (
        !body.deploymentId ||
        (runtimeKind !== 'autoscale' && runtimeKind !== 'reserved-vm') ||
        !body.expectedRuntimeVersion?.trim() ||
        !Number.isInteger(expectedRuntimeVersion) ||
        expectedRuntimeVersion < 0
      ) {
        return json(
          { error: getProjectDeploymentsCopy(resolveRequestLocale(request).language).errors.runtimeChangeInvalid },
          { status: 400 },
        );
      }

      const reservedVmSubmission = runtimeKind === 'reserved-vm' ? parseReservedVmSubmission(body) : null;

      if (reservedVmSubmission && !reservedVmSubmission.ok) {
        const localizedCopy = getProjectDeploymentsCopy(resolveRequestLocale(request).language);

        return json(
          {
            error:
              reservedVmSubmission.reason === 'confirmation'
                ? localizedCopy.errors.reservedConfirmationRequired
                : localizedCopy.errors.reservedPricingInvalid,
          },
          { status: 400 },
        );
      }

      if (runtimeKind === 'autoscale' && !body.machineSize?.trim()) {
        return json(
          { error: getProjectDeploymentsCopy(resolveRequestLocale(request).language).errors.runtimeChangeInvalid },
          { status: 400 },
        );
      }

      try {
        await apiRequest(
          request,
          `/projects/${projectId}/deployments/${encodeURIComponent(body.deploymentId)}/runtime`,
          {
            method: 'PATCH',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify({
              expectedRuntimeVersion,
              runtimeKind,
              machineSize: runtimeKind === 'autoscale' ? body.machineSize.trim() : undefined,
              reservedVmTier: reservedVmSubmission?.ok ? reservedVmSubmission.value.tier : undefined,
              reservedVmConfirmation: reservedVmSubmission?.ok
                ? {
                    accepted: true,
                    termsVersion: reservedVmSubmission.value.termsVersion,
                    monthlyPriceCents: reservedVmSubmission.value.monthlyPriceCents,
                  }
                : undefined,
            }),
          },
        );
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        return json({ error: await localizedDeploymentApiError(error, request, 'runtimeChangeFailed') });
      }

      const redirectQuery = deploymentsRedirectQuery(request.url, body.workspaceId);

      return redirect(`/projects/${projectId}/deployments${redirectQuery}`);
    },
    cancel: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/cancel`, { method: 'POST' });
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        return json({ error: await localizedDeploymentApiError(error, request, 'cancelFailed') });
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

        return json({ error: await localizedDeploymentApiError(error, request, 'redeployFailed') });
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

        return json({ error: await localizedDeploymentApiError(error, request, 'rollbackFailed') });
      }

      const redirectQuery = deploymentsRedirectQuery(request.url, body.workspaceId);

      return redirect(`/projects/${projectId}/deployments${redirectQuery}`);
    },
    access: async ({ request, projectId, body }) => {
      try {
        const expectedVersion = Number(body.expectedVersion);
        await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/access`, {
          method: 'PUT',
          body: JSON.stringify({
            mode: body.accessMode,
            ...(body.accessMode === 'PASSWORD_PROTECTED' ? { password: body.accessPassword } : {}),
            ...(Number.isInteger(expectedVersion) && expectedVersion > 0 ? { expectedVersion } : {}),
          }),
        });
      } catch (error) {
        if (isReauthRedirect(error)) {
          throw error;
        }

        return json({ error: await localizedDeploymentApiError(error, request, 'accessFailed') });
      }
      return json({ success: getProjectDeploymentsCopy(resolveRequestLocale(request).language).access.saved });
    },
  });

function useProjectDeploymentsLocale(): {
  copy: ProjectDeploymentsCopy;
  language: ProjectUserAreaLanguage;
} {
  const { i18n } = useTranslation();
  const language = resolveProjectUserAreaLanguage(i18n.resolvedLanguage ?? i18n.language);

  return { copy: getProjectDeploymentsCopy(language), language };
}

export default function ProjectDeploymentsPage() {
  /*
   * The loader is dual-purpose (the page shape, plus a `?detect=1` side-channel
   * the Publish card hits via a fetcher), so `typeof loader` is a union. The
   * PAGE render is always the page shape — the detect branch is only ever read
   * from the fetcher — so narrow to it here.
   */
  const { project, data } = useLoaderData() as { project: { id: string }; data: DeploymentsData };
  const { copy, language } = useProjectDeploymentsLocale();
  const actionData = useActionData<{ error?: string; success?: string }>();
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

  // The overview mirrors the publish card's real, currently selected runtime.
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
    <ProjectShell projectId={project.id} title={copy.shell.title} description={copy.shell.description}>
      {actionData?.error ? (
        <div
          role="alert"
          className="mb-6 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error-text)]"
        >
          {actionData.error}
        </div>
      ) : null}
      {actionData?.success ? (
        <div
          role="status"
          className="mb-6 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success-text)]"
        >
          {actionData.success}
        </div>
      ) : null}
      <DeploySubNav
        active={view}
        onSelect={setView}
        ariaLabel={copy.navigation.aria}
        labels={{
          overview: copy.navigation.overview,
          logs: copy.navigation.logs,
          domains: copy.navigation.domains,
          manage: copy.navigation.manage,
        }}
      />

      {view === 'logs' ? <DeployLogsView deployment={latest} building={building} /> : null}
      {view === 'domains' ? <DeployDomainsView deployment={latest} /> : null}
      {view === 'manage' ? (
        <div className="mt-4 grid gap-5">
          {latest?.provider === 'server' ? (
            <DeploymentRuntimeCard
              projectId={project.id}
              workspaceId={workspaceId}
              deployment={latest}
              busy={busy}
              copy={copy}
              language={language}
            />
          ) : null}
          <DeploymentAccessCard deployment={latest} busy={busy} />
          <DeployHistory deployments={data.deployments} busy={busy} workspaceId={workspaceId} />
        </div>
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
                  <Rocket className="h-3.5 w-3.5" aria-hidden /> {copy.actions.republish}
                </DeployActionButton>
              </Form>
              <DeployActionButton type="button" onClick={() => setView('manage')}>
                <Settings className="h-3.5 w-3.5" aria-hidden /> {copy.actions.adjustSettings}
              </DeployActionButton>
              {latest?.url ? (
                <DeployActionButton
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(latest.url as string)}
                  title={copy.actions.copyLink}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden /> {copy.actions.copyLink}
                </DeployActionButton>
              ) : null}
              <DeployActionButton type="button" disabled title={copy.actions.securitySoon}>
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {copy.actions.securityScan}
              </DeployActionButton>
            </div>

            <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">{copy.production}</h2>
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
            onDeploymentType={setDeployType}
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
type PublishRuntimeMode = 'autoscale' | 'reserved-vm' | 'static' | 'unknown';

export function DeployPublishCard({
  projectId,
  workspaceId,
  busy,
  building,
  onDeploymentType,
}: {
  projectId: string;
  workspaceId: string;
  busy: boolean;
  building: boolean;
  onDeploymentType: (mode: Exclude<PublishRuntimeMode, 'unknown'>) => void;
}) {
  const { copy, language } = useProjectDeploymentsLocale();
  const detectFetcher = useFetcher<{ detected: DeployDetect }>();
  const rateCardFetcher = useFetcher<{ rateCard: DeployRateCard | null }>();
  const planEntitlementsFetcher = useFetcher<DeployPlanEntitlementsData>();
  const [override, setOverride] = useState<'auto' | Exclude<PublishRuntimeMode, 'unknown'>>('auto');
  const [accessMode, setAccessMode] = useState<DeploymentAccessMode>('INVITE_ONLY');
  const [reservedTierId, setReservedTierId] = useState<ReservedVmTierId>(RESERVED_VM_TIER_IDS[0]);
  const [reservedConfirmed, setReservedConfirmed] = useState(false);

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
  const rateCardLoading = rateCardFetcher.state !== 'idle' || rateCardFetcher.data === undefined;
  const reservedVm = rateCard?.reservedVm;
  const validReservedTiers = reservedVm ? validateReservedVmTiers(reservedVm.tiers) : null;
  const reservedTermsVersion = reservedVm?.termsVersion.trim() ?? '';

  const reservedPricingValid = Boolean(
    validReservedTiers && reservedTermsVersion.length > 0 && reservedTermsVersion.length <= 128,
  );

  const reservedVmEnabled =
    reservedVm?.enabled === true && reservedVm.paidPlanEligible === true && reservedPricingValid;

  const detected = detectFetcher.data?.detected;
  const detecting = detectFetcher.state !== 'idle' || !detected;
  const detectedMode = detected?.mode ?? 'unknown';

  /*
   * Server detection defaults to autoscale. Reserved VM is always an explicit,
   * priced choice because it creates a fixed monthly reservation.
   */
  const detectedRuntime: PublishRuntimeMode =
    detectedMode === 'server' ? 'autoscale' : detectedMode === 'static' ? 'static' : 'unknown';

  const effectiveMode: PublishRuntimeMode = override === 'auto' ? detectedRuntime : override;

  useEffect(() => {
    if (effectiveMode !== 'unknown') {
      onDeploymentType(effectiveMode);
    }
  }, [effectiveMode, onDeploymentType]);

  useEffect(() => {
    if (validReservedTiers && !validReservedTiers.some((tier) => tier.id === reservedTierId)) {
      setReservedTierId(validReservedTiers[0].id);
    }
  }, [reservedTierId, validReservedTiers]);

  useEffect(() => {
    setReservedConfirmed(false);
  }, [effectiveMode, reservedTermsVersion, reservedTierId]);

  useEffect(() => {
    if (override === 'reserved-vm' && !rateCardLoading && !reservedVmEnabled) {
      setOverride('auto');
    }
  }, [override, rateCardLoading, reservedVmEnabled]);

  const provider: DeploymentPlanProvider =
    effectiveMode === 'autoscale' || effectiveMode === 'reserved-vm' ? 'server' : 'static';

  const planEntitlementsHref = `/projects/${projectId}/deployments?planEntitlements=1&provider=${provider}`;

  useEffect(() => {
    if (effectiveMode !== 'unknown') {
      planEntitlementsFetcher.load(planEntitlementsHref);
    }
  }, [effectiveMode, planEntitlementsHref]);

  const planEntitlements = planEntitlementsFetcher.data?.planEntitlements ?? null;
  const planEntitlementsError = planEntitlementsFetcher.data?.error ?? null;

  const planEntitlementsLoading =
    effectiveMode !== 'unknown'
      ? planEntitlementsFetcher.state !== 'idle' ||
        planEntitlementsFetcher.data === undefined ||
        planEntitlements?.provider !== provider
      : false;

  const planReady = effectiveMode !== 'unknown' && isDeploymentPlanReadyForPublish(planEntitlements, provider);

  const computeConfigurationReady =
    effectiveMode === 'autoscale'
      ? Boolean(rateCard) && !rateCardLoading
      : effectiveMode === 'reserved-vm'
        ? reservedVmEnabled && reservedConfirmed && !rateCardLoading
        : effectiveMode === 'static';

  const canPublish = effectiveMode !== 'unknown' && computeConfigurationReady && planReady && !busy && !building;

  const reservedUnavailableReason = reservedVmUnavailableReason({
    loading: rateCardLoading,
    rateCard,
    pricingValid: reservedPricingValid,
    copy,
  });

  const effectiveModeLabel =
    effectiveMode === 'autoscale'
      ? copy.publish.serverMode
      : effectiveMode === 'reserved-vm'
        ? copy.publish.reservedMode
        : copy.publish.staticMode;
  const effectiveModeDescription =
    effectiveMode === 'autoscale'
      ? copy.publish.serverDescription
      : effectiveMode === 'reserved-vm'
        ? copy.publish.reservedDescription
        : copy.publish.staticDescription;

  return (
    <div className="grid gap-4">
      {/* Detected-mode banner — transparency, no opaque magic. */}
      <div className="grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">{copy.publish.title}</h2>
        {detecting ? (
          <p className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {copy.publish.detecting}
          </p>
        ) : detectedMode === 'unknown' && override === 'auto' ? (
          <div className="grid gap-2">
            <p className="flex items-start gap-2 text-xs text-[var(--status-error-text)]">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{detected?.reason ?? copy.publish.detectionFailed}</span>
            </p>
            <button
              type="button"
              onClick={() => detectFetcher.load(detectHref)}
              className="inline-flex min-h-[44px] items-center justify-center justify-self-start rounded-md px-2 text-xs font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
            >
              {copy.publish.redetect}
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-success-text,currentColor)]" aria-hidden />
            <span>
              {copy.publish.detected}{' '}
              <span className="font-medium text-bolt-elements-textPrimary">{detected?.framework}</span> →{' '}
              <span className="font-medium text-bolt-elements-textPrimary">{effectiveModeLabel}</span>
              {override !== 'auto' ? ` ${copy.publish.overridden}` : ''}
            </span>
          </p>
        )}
      </div>

      <Form
        method="post"
        onSubmit={(event) => ensureDeploymentIdempotencyKey(event.currentTarget)}
        className="grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md"
      >
        <input type="hidden" name="idempotencyKey" defaultValue="" />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="provider" value={provider} />
        {provider === 'server' ? <input type="hidden" name="runtimeKind" value={effectiveMode} /> : null}

        <p className="text-xs leading-5 text-bolt-elements-textSecondary">{effectiveModeDescription}</p>

        {effectiveMode !== 'unknown' ? (
          <PlanDeploymentControls
            key={provider}
            copy={copy.publish.entitlements}
            provider={provider}
            entitlements={planEntitlements}
            loading={planEntitlementsLoading}
            error={planEntitlementsError}
            retrying={planEntitlementsFetcher.state !== 'idle'}
            onRetry={() => planEntitlementsFetcher.load(planEntitlementsHref)}
          />
        ) : null}

        <div className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
            {copy.access.label}
            <select
              className="min-h-11 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 text-sm normal-case tracking-normal text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              name="accessMode"
              value={accessMode}
              onChange={(event) => setAccessMode(event.currentTarget.value as DeploymentAccessMode)}
            >
              <option value="PUBLIC">{copy.access.modes.public.label}</option>
              <option value="PASSWORD_PROTECTED">{copy.access.modes.password.label}</option>
              <option value="WORKSPACE_ONLY">{copy.access.modes.workspace.label}</option>
              <option value="INVITE_ONLY">{copy.access.modes.invite.label}</option>
            </select>
          </label>
          <p className="text-xs leading-5 text-bolt-elements-textSecondary">
            {accessMode === 'PUBLIC'
              ? copy.access.modes.public.description
              : accessMode === 'PASSWORD_PROTECTED'
                ? copy.access.modes.password.description
                : accessMode === 'WORKSPACE_ONLY'
                  ? copy.access.modes.workspace.description
                  : copy.access.modes.invite.description}
          </p>
          {accessMode === 'PASSWORD_PROTECTED' ? (
            <label className="grid gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
              {copy.access.password}
              <input
                className="min-h-11 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 text-sm normal-case tracking-normal text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
                name="accessPassword"
                type="password"
                minLength={10}
                maxLength={256}
                autoComplete="new-password"
                required
              />
            </label>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field as="select" label={copy.publish.environment} name="environment" defaultValue="preview">
            <option value="preview">{copy.environments.preview}</option>
            <option value="staging">{copy.environments.staging}</option>
            <option value="production">{copy.environments.production}</option>
          </Field>
          <Field label={copy.publish.customDomain} name="customDomain" placeholder={DEPLOYMENT_DOMAIN_PLACEHOLDER} />
        </div>

        {effectiveMode === 'autoscale' && rateCardLoading ? (
          <ComputeRateCardSkeleton label={copy.publish.rateCardLoading} />
        ) : effectiveMode === 'autoscale' && !rateCard ? (
          <ComputeRateCardError
            message={copy.publish.rateCardUnavailable}
            retryLabel={copy.publish.retryRateCard}
            onRetry={() => rateCardFetcher.load(`/projects/${projectId}/deployments?rateCard=1`)}
          />
        ) : effectiveMode === 'autoscale' && rateCard ? (
          <div className="grid gap-1.5">
            <Field
              as="select"
              label={copy.publish.machineSize}
              name="machineSize"
              defaultValue={rateCard.defaultMachineSize}
            >
              {rateCard.machineSizes.map((size) => (
                <option key={size.key} value={size.key} disabled={!size.available}>
                  {size.label} —{' '}
                  {interpolateProjectCopy(copy.publish.hourlyActive, {
                    amount: machineSizeHourlyDollars(rateCard, size, language),
                  })}
                  {size.available
                    ? ''
                    : ` ${size.reason === 'plan' ? copy.publish.upgradePlan : copy.publish.unavailable}`}
                </option>
              ))}
            </Field>
            <p className="text-[11px] text-bolt-elements-textTertiary">
              {interpolateProjectCopy(copy.publish.billing, { version: rateCard.version })}
            </p>
          </div>
        ) : null}

        {effectiveMode === 'reserved-vm' && rateCardLoading ? (
          <ComputeRateCardSkeleton label={copy.publish.rateCardLoading} />
        ) : effectiveMode === 'reserved-vm' && (!rateCard || !reservedVmEnabled || !validReservedTiers) ? (
          <ComputeRateCardError
            message={reservedUnavailableReason.message}
            retryLabel={copy.publish.retryRateCard}
            upgradeLabel={reservedUnavailableReason.paidPlan ? copy.publish.reservedVm.upgrade : undefined}
            onRetry={() => rateCardFetcher.load(`/projects/${projectId}/deployments?rateCard=1`)}
          />
        ) : effectiveMode === 'reserved-vm' && validReservedTiers && reservedVm ? (
          <ReservedVmConfigurator
            tiers={validReservedTiers}
            termsVersion={reservedTermsVersion}
            selectedTierId={reservedTierId}
            confirmed={reservedConfirmed}
            copy={copy.publish.reservedVm}
            language={language}
            onSelectTier={setReservedTierId}
            onConfirm={setReservedConfirmed}
            disabled={busy || building}
          />
        ) : null}

        <Field
          as="textarea"
          label={copy.publish.environmentVariables}
          name="envVars"
          placeholder={copy.publish.environmentPlaceholder}
        />

        <details className="group">
          <summary className="flex min-h-[44px] cursor-pointer items-center rounded-md text-xs font-medium text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus">
            {copy.publish.advanced}
          </summary>
          <div className="mt-2 grid gap-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
            {(
              [
                ['auto', copy.publish.modeAuto],
                ['autoscale', copy.publish.modeServer],
                ['reserved-vm', copy.publish.modeReservedVm],
                ['static', copy.publish.modeStatic],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={classNames(
                  'flex min-h-11 items-center gap-2 rounded-md px-2 text-xs text-bolt-elements-textSecondary focus-within:ring-2 focus-within:ring-bolt-elements-focus',
                  value === 'reserved-vm' && !reservedVmEnabled
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer hover:bg-bolt-elements-background-depth-3',
                )}
              >
                <input
                  className="h-4 w-4 shrink-0 accent-bolt-elements-focus"
                  type="radio"
                  name="deployModeOverride"
                  value={value}
                  checked={override === value}
                  onChange={() => setOverride(value)}
                  disabled={value === 'reserved-vm' && !reservedVmEnabled}
                />
                <span className="min-w-0 break-words">{label}</span>
              </label>
            ))}
            {reservedUnavailableReason.message ? (
              <div
                className="mt-1 grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-xs leading-5 text-bolt-elements-textSecondary"
                role={rateCardLoading ? 'status' : 'note'}
                aria-live="polite"
              >
                <span>{reservedUnavailableReason.message}</span>
                {reservedUnavailableReason.paidPlan ? (
                  <a
                    href="/upgrade"
                    className="inline-flex min-h-11 items-center justify-center justify-self-start rounded-md border border-bolt-elements-borderColor px-3 font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
                  >
                    {copy.publish.reservedVm.upgrade}
                  </a>
                ) : !rateCardLoading ? (
                  <button
                    type="button"
                    onClick={() => rateCardFetcher.load(`/projects/${projectId}/deployments?rateCard=1`)}
                    className="inline-flex min-h-11 items-center justify-center justify-self-start rounded-md border border-bolt-elements-borderColor px-3 font-medium text-bolt-elements-item-contentAccent hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
                  >
                    {copy.publish.retryRateCard}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>

        <Button type="submit" disabled={!canPublish} aria-busy={busy || building} className="min-h-11 gap-2">
          <Rocket className="h-4 w-4" aria-hidden />
          {busy || building ? copy.publish.publishing : copy.publish.submit}
        </Button>
      </Form>
    </div>
  );
}

type ReservedVmAvailabilityMessage = Readonly<{ message: string; paidPlan: boolean }>;

export function reservedVmUnavailableReason({
  loading,
  rateCard,
  pricingValid,
  copy,
}: {
  loading: boolean;
  rateCard: DeployRateCard | null;
  pricingValid: boolean;
  copy: ProjectDeploymentsCopy;
}): ReservedVmAvailabilityMessage {
  if (loading) {
    return { message: copy.publish.rateCardLoading, paidPlan: false };
  }

  if (!rateCard) {
    return { message: copy.publish.rateCardUnavailable, paidPlan: false };
  }

  const reasonCode = rateCard.reservedVm?.reasonCode?.toUpperCase() ?? '';

  const paidPlan =
    rateCard.reservedVm?.paidPlanEligible !== true ||
    rateCard.planKey.trim().toLowerCase() === 'free' ||
    reasonCode.includes('PLAN');

  if (paidPlan) {
    return { message: copy.publish.reservedVm.paidPlanRequired, paidPlan: true };
  }

  if (!pricingValid && rateCard.reservedVm?.enabled === true) {
    return { message: copy.publish.reservedVm.pricingInvalid, paidPlan: false };
  }

  if (rateCard.reservedVm?.enabled !== true) {
    return {
      message: copy.publish.reservedVm.operatorUnavailable,
      paidPlan: false,
    };
  }

  if (!pricingValid) {
    return { message: copy.publish.reservedVm.pricingInvalid, paidPlan: false };
  }

  return { message: '', paidPlan: false };
}

export function ComputeRateCardSkeleton({ label }: { label: string }) {
  return (
    <div
      className="grid gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="compute-rate-card-skeleton"
    >
      <span className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {label}
      </span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="h-[72px] animate-pulse rounded-md bg-bolt-elements-background-depth-3 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

export function ComputeRateCardError({
  message,
  retryLabel,
  upgradeLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  upgradeLabel?: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="grid gap-3 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-xs leading-5 text-[var(--status-error-text)]"
      data-testid="compute-rate-card-error"
    >
      <span className="flex items-start gap-2">
        <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </span>
      <span className="flex flex-wrap gap-2">
        {upgradeLabel ? (
          <a
            href="/upgrade"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-current px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
          >
            {upgradeLabel}
          </a>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-current px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
        >
          {retryLabel}
        </button>
      </span>
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
        'inline-flex min-h-11 items-center gap-1.5 rounded-[6px] px-3 text-[13.3px] font-medium disabled:opacity-60',
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
  const { copy } = useProjectDeploymentsLocale();
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
          <TerminalSquare className="h-4 w-4" aria-hidden /> {copy.logs.title}
        </span>
        {building ? (
          <span className="flex items-center gap-1.5 text-[13px] text-[var(--vc-ide-accent-action)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {copy.logs.building}
          </span>
        ) : failed ? (
          <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--status-error-text)' }}>
            <Ban className="h-3.5 w-3.5" aria-hidden /> {copy.logs.failed}
          </span>
        ) : ready ? (
          <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--status-ok, #3fb950)' }}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {copy.logs.deployed}
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
          <span className="text-bolt-elements-textTertiary">{building ? copy.logs.starting : copy.logs.empty}</span>
        )}
      </pre>
    </div>
  );
}

/** Domains view — live URL + custom domain + DNS guidance. */
function DeployDomainsView({ deployment }: { deployment?: Deployment }) {
  const { copy } = useProjectDeploymentsLocale();

  return (
    <div className="mt-4 grid gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-md">
      <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">{copy.domains.title}</h2>
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
            <span className="text-bolt-elements-textTertiary">{copy.domains.noUrl}</span>
          )}
        </div>
        {deployment?.customDomain ? (
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
            <span className="text-bolt-elements-textPrimary">{deployment.customDomain}</span>
          </div>
        ) : null}
      </div>
      <p className="text-[12px] text-bolt-elements-textTertiary">{copy.domains.guidance}</p>
    </div>
  );
}

/** Real policy management for the latest release; owner/admin only server-side. */
function DeploymentAccessCard({ deployment, busy }: { deployment?: Deployment; busy: boolean }) {
  const { copy } = useProjectDeploymentsLocale();
  const [mode, setMode] = useState<DeploymentAccessMode>(deployment?.accessPolicy?.mode ?? 'INVITE_ONLY');

  useEffect(() => {
    setMode(deployment?.accessPolicy?.mode ?? 'INVITE_ONLY');
  }, [deployment?.id, deployment?.accessPolicy?.mode, deployment?.accessPolicy?.version]);

  if (!deployment) {
    return (
      <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5">
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">{copy.access.title}</h2>
        <p className="mt-2 text-xs text-bolt-elements-textSecondary">{copy.access.noDeployment}</p>
      </section>
    );
  }

  const options: Array<{
    value: DeploymentAccessMode;
    label: string;
    description: string;
    icon: LucideIcon;
  }> = [
    { value: 'PUBLIC', icon: Globe2, ...copy.access.modes.public },
    { value: 'PASSWORD_PROTECTED', icon: LockKeyhole, ...copy.access.modes.password },
    { value: 'WORKSPACE_ONLY', icon: Users, ...copy.access.modes.workspace },
    { value: 'INVITE_ONLY', icon: ShieldCheck, ...copy.access.modes.invite },
  ];

  const canManage = deployment.accessPolicyCanManage === true;

  return (
    <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="border-b border-bolt-elements-borderColor px-5 py-4 sm:flex sm:items-start sm:justify-between sm:gap-5">
        <div>
          <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">{copy.access.title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-bolt-elements-textSecondary">{copy.access.description}</p>
        </div>
        <span className="mt-3 inline-flex min-h-7 items-center rounded-full border border-bolt-elements-borderColor px-2.5 text-[11px] font-medium text-bolt-elements-textSecondary sm:mt-0">
          {copy.access.version.replace('{version}', String(deployment.accessPolicy?.version ?? 0))}
        </span>
      </div>

      <Form method="post" className="grid gap-5 p-5">
        <input type="hidden" name="intent" value="access" />
        <input type="hidden" name="deploymentId" value={deployment.id} />
        <input type="hidden" name="expectedVersion" value={deployment.accessPolicy?.version ?? ''} />

        {deployment.accessPolicyState === 'LOCKED' ? (
          <div
            role="alert"
            className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-xs leading-5 text-[var(--status-warning-text)]"
          >
            {copy.access.locked}
          </div>
        ) : null}

        <fieldset disabled={!canManage || busy} className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">{copy.access.label}</legend>
          {options.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.value;

            return (
              <label
                key={option.value}
                className={classNames(
                  'flex min-h-[88px] cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors focus-within:ring-2 focus-within:ring-bolt-elements-focus',
                  selected
                    ? 'border-bolt-elements-focus bg-bolt-elements-background-depth-1'
                    : 'border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3',
                  !canManage ? 'cursor-not-allowed opacity-70' : '',
                )}
              >
                <input
                  className="mt-1 h-4 w-4 shrink-0 accent-bolt-elements-focus"
                  type="radio"
                  name="accessMode"
                  value={option.value}
                  checked={selected}
                  onChange={() => setMode(option.value)}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary">
                    <Icon className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden /> {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-bolt-elements-textSecondary">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {mode === 'PASSWORD_PROTECTED' ? (
          <label className="grid max-w-xl gap-2 text-xs font-medium uppercase tracking-[0.04em] text-bolt-elements-textTertiary">
            {copy.access.password}
            <input
              className="min-h-11 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm normal-case tracking-normal text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
              name="accessPassword"
              type="password"
              minLength={10}
              maxLength={256}
              autoComplete="new-password"
              required
              disabled={!canManage || busy}
              placeholder={copy.access.passwordPlaceholder}
            />
          </label>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-bolt-elements-borderColor pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-bolt-elements-textTertiary">
            {canManage ? copy.access.rotation : copy.access.adminOnly}
          </p>
          <Button type="submit" disabled={!canManage || busy} className="min-h-11 shrink-0 gap-2">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            )}
            {busy ? copy.access.saving : copy.access.save}
          </Button>
        </div>
      </Form>
    </section>
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
  const { copy } = useProjectDeploymentsLocale();

  return (
    <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-md">
      <div className="flex items-center justify-between border-b border-bolt-elements-borderColor px-5 py-4">
        <div>
          <h2 className="text-[14px] font-medium text-bolt-elements-textPrimary">{copy.history.title}</h2>
          <p className="text-xs text-bolt-elements-textSecondary">{copy.history.description}</p>
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
              <p className="text-sm font-medium text-bolt-elements-textPrimary">{copy.history.emptyTitle}</p>
              <p className="text-xs text-bolt-elements-textSecondary">{copy.history.emptyDescription}</p>
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
function formatLogTimestamp(timestamp: string, language: ProjectUserAreaLanguage): string {
  const date = new Date(timestamp);
  return formatUserAreaTime(date, undefined, language) ?? timestamp;
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
  const { copy, language } = useProjectDeploymentsLocale();
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
            {copy.environments[deployment.environment]}
          </span>
          {deployment.framework ? (
            <span className="rounded bg-bolt-elements-background-depth-1 px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary">
              {deployment.framework}
            </span>
          ) : null}
          {deployment.rolledBackFromId ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-bolt-elements-background-depth-1 px-2 py-0.5 text-[11px] text-bolt-elements-textSecondary"
              title={interpolateProjectCopy(copy.row.rollbackTitle, { deploymentId: deployment.rolledBackFromId })}
            >
              <History className="h-3 w-3" aria-hidden /> {copy.row.rollbackBadge}
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
            <span className="inline-flex items-center gap-1" title={copy.row.durationTitle}>
              <Timer className="h-3.5 w-3.5 text-bolt-elements-textTertiary" aria-hidden />
              {duration}
            </span>
          ) : null}
          {deployment.createdAt ? <RelativeTime value={deployment.createdAt} prefix={copy.row.deployedPrefix} /> : null}
        </div>
        <p className="mt-2 truncate text-xs text-bolt-elements-textSecondary">
          {deployment.url ?? copy.row.urlPending} {deployment.customDomain ? `- ${deployment.customDomain}` : ''}
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
            {copy.logs.redacted}
            <span className="ml-auto text-[11px] font-normal text-bolt-elements-textTertiary">
              {formatProjectCopyPlural(language, logs.length, {
                one: copy.logs.line_one,
                other: copy.logs.line_other,
              })}
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
                    [{formatLogTimestamp(log.timestamp, language)}] [{log.level}] {log.message}
                  </div>
                ))
              ) : (
                <span>{copy.logs.noLogs}</span>
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
            {copy.actions.open}
          </a>
        ) : null}
        <InlineAction
          intent="redeploy"
          deploymentId={deployment.id}
          workspaceId={workspaceId}
          disabled={busy}
          icon={RotateCcw}
        >
          {copy.actions.redeploy}
        </InlineAction>
        <InlineAction
          intent="rollback"
          deploymentId={deployment.id}
          workspaceId={workspaceId}
          disabled={busy || !ready}
          icon={History}
        >
          {copy.actions.rollback}
        </InlineAction>
        <InlineAction
          intent="cancel"
          deploymentId={deployment.id}
          workspaceId={workspaceId}
          disabled={busy || ready}
          icon={Ban}
        >
          {copy.actions.cancel}
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
  const { copy } = useProjectDeploymentsLocale();
  const ActionIcon = icon;
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirm =
    intent === 'rollback'
      ? {
          title: copy.confirmations.rollback.title,
          description: copy.confirmations.rollback.description,
          confirmLabel: copy.confirmations.rollback.confirm,
          variant: 'default' as const,
        }
      : intent === 'cancel'
        ? {
            title: copy.confirmations.cancel.title,
            description: copy.confirmations.cancel.description,
            confirmLabel: copy.confirmations.cancel.confirm,
            variant: 'destructive' as const,
          }
        : undefined;

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
  const { copy } = useProjectDeploymentsLocale();

  const tone =
    status === 'READY' ? 'success' : status === 'FAILED' ? 'error' : status === 'CANCELED' ? 'warning' : 'info';

  const normalizedStatus = status.trim().toUpperCase();

  const label =
    normalizedStatus === 'READY'
      ? copy.statuses.ready
      : normalizedStatus === 'FAILED' || normalizedStatus === 'ERROR'
        ? copy.statuses.failed
        : normalizedStatus === 'CANCELED' || normalizedStatus === 'CANCELLED'
          ? copy.statuses.canceled
          : normalizedStatus === 'QUEUED'
            ? copy.statuses.queued
            : normalizedStatus === 'BUILDING'
              ? copy.statuses.building
              : normalizedStatus === 'PENDING'
                ? copy.statuses.pending
                : normalizedStatus === 'DEPLOYING' || normalizedStatus === 'IN_PROGRESS'
                  ? copy.statuses.deploying
                  : copy.statuses.unknown;

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
      {label}
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
        <select className={`${className} min-h-11 normal-case tracking-normal`} name={name} defaultValue={defaultValue}>
          {children}
        </select>
      ) : (
        <input
          className={`${className} min-h-11 normal-case tracking-normal`}
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
