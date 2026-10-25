import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link, useParams, useRouteError } from 'react-router';
import {
  DEPLOY_REQUEST_TIMEOUT_MS,
  deploymentsRedirectQuery,
  canonicalDeploymentHref,
} from './projects.$projectId.deployments.view';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { UserAreaRouteErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
import type { DeployDetect, DeployRateCard } from '~/components/deploy/DeployPublishCard';
import {
  apiErrorMessage,
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  getProjectDeploymentsCopy,
  resolveProjectUserAreaLanguage,
  type ProjectDeploymentsCopy,
} from '~/lib/i18n/catalogs/project-user-area';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { projectAction } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';
export {
  machineSizeHourlyDollars,
  type DeployRateCard,
  type DeployDetect,
} from '~/components/deploy/DeployPublishCard';

export function ErrorBoundary() {
  const error = useRouteError();
  const { projectId } = useParams();
  const { t } = useTranslation();

  if (!isRouteErrorResponse(error) || error.data?.code !== 'DEPLOYMENT_ACTION_FAILED') {
    return <UserAreaRouteErrorBoundary />;
  }

  return (
    <AppShell title={t('userArea.navigation.deployments')} description="" serverSync={false}>
      <p role="alert">{error.data.error}</p>
      <Link
        to={canonicalDeploymentHref(
          projectId ?? '',
          new URLSearchParams(typeof error.data.workspaceId === 'string' ? { workspace: error.data.workspaceId } : {}),
        )}
      >
        {t('userArea.navigation.deployments')}
      </Link>
    </AppShell>
  );
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
      const workspaceId = url.searchParams.get('workspace')?.trim();
      const query = workspaceId ? `?${new URLSearchParams({ workspaceId })}` : '';

      const detected = await apiRequest<DeployDetect>(
        args.request,
        `/projects/${projectId}/deployments/detect${query}`,
      );

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

  const projectId = args.params.projectId;

  if (!projectId) {
    throw json({ error: copy.errors.projectNotFound }, { status: 404 });
  }

  await apiRequest(args.request, `/projects/${projectId}`);

  return redirect(canonicalDeploymentHref(projectId, url.searchParams));
};

async function localizedDeploymentApiError(
  error: unknown,
  request: Request,
  key: keyof ProjectDeploymentsCopy['errors'],
): Promise<string> {
  const language = resolveProjectUserAreaLanguage(resolveRequestLocale(request).language);
  const fallback = getProjectDeploymentsCopy(language).errors[key];

  return language === 'fr' ? fallback : apiErrorMessage(error, fallback);
}

const legacyDeploymentAction = (args: EnterpriseActionArgs) =>
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

        return json({ error: await localizedDeploymentApiError(error, request, 'startFailed') });
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
  });

export async function action(args: EnterpriseActionArgs) {
  const originalRequest = args.request.clone();
  const result = await legacyDeploymentAction(args);

  if (
    !(result instanceof Response) &&
    result &&
    typeof result === 'object' &&
    'data' in result &&
    result.data &&
    typeof result.data === 'object' &&
    'error' in result.data
  ) {
    const form = await originalRequest.formData();

    const workspaceId = String(
      form.get('workspaceId') || new URL(originalRequest.url).searchParams.get('workspace') || '',
    );
    throw json({ ...result.data, code: 'DEPLOYMENT_ACTION_FAILED', workspaceId }, { status: 400 });
  }

  return result;
}

export default function ProjectDeploymentsPage() {
  return null;
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
