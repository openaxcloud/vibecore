import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link, useParams, useRouteError } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { UserAreaRouteErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
import {
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  getProjectDomainsCopy,
  resolveProjectDomainsLanguage,
  type ProjectDomainsKey,
} from '~/lib/i18n/catalogs/project-domains';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

type Project = { id: string; name: string; description?: string; organizationId?: string };

export function ErrorBoundary() {
  const error = useRouteError();
  const { projectId } = useParams();
  const { t } = useTranslation();

  if (!isRouteErrorResponse(error) || error.data?.code !== 'DOMAIN_ACTION_FAILED') {
    return <UserAreaRouteErrorBoundary />;
  }

  return (
    <AppShell
      title={t('projectDomains.page.title')}
      description={t('projectDomains.page.description')}
      serverSync={false}
    >
      <p role="alert">{error.data.error}</p>
      <Link to={`/projects/${encodeURIComponent(projectId ?? '')}/ide?panel=domains`}>
        {t('projectDomains.page.title')}
      </Link>
    </AppShell>
  );
}

/** Preserve bookmarked links and authorize the project before opening the canonical deployment flow. */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const copy = getProjectDomainsCopy(resolveProjectDomainsLanguage(resolveRequestLocale(request).language));
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: copy['projectDomains.error.projectNotFound'] }, { status: 404 });
  }

  const { project } = await apiRequest<{ project: Project }>(request, `/projects/${projectId}`);

  if (!project.organizationId) {
    throw json({ error: copy['projectDomains.error.organizationMissing'] }, { status: 400 });
  }

  return redirect(`/projects/${encodeURIComponent(projectId)}/ide?panel=domains`);
}

export async function action(args: EnterpriseActionArgs) {
  const result = await legacyDomainAction(args);

  if (!(result instanceof Response) && result.data.error) {
    // An error must render before the GET redirect; never replay the mutation.
    throw json({ ...result.data, code: 'DOMAIN_ACTION_FAILED' }, { status: 400 });
  }

  return result;
}

async function legacyDomainAction({ request, params }: EnterpriseActionArgs) {
  const language = resolveProjectDomainsLanguage(resolveRequestLocale(request).language);
  const copy = getProjectDomainsCopy(language);
  const projectId = params.projectId;

  if (!projectId) {
    throw json({ error: copy['projectDomains.error.projectNotFound'] }, { status: 404 });
  }

  /*
   * Same rule as the loader: write into the PROJECT's organization. Using
   * `firstOrganization` here meant "Add domain" on project X's page could
   * create the domain in a completely different organization — silently, with
   * a 201 and a redirect that looked like success.
   */
  let organizationId: string | undefined;

  try {
    const projectResult = await apiRequest<{ project: Project }>(request, `/projects/${projectId}`);
    organizationId = projectResult.project.organizationId;
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    /*
     * apiRequest's default AbortSignal.timeout fires on a hung/draining api pod
     * (rejecting with a non-Response TimeoutError) and it also throws a 5xx
     * Response on upstream failure. Neither must reach the root error boundary
     * and blow away the whole Custom Domains page — surface the same friendly
     * inline message the add/verify branches use so the user stays on the page.
     */
    console.error('Project lookup failed in domains action:', error);

    return json({ error: copy['projectDomains.error.serviceUnavailable'] });
  }

  if (!organizationId) {
    return json({ error: copy['projectDomains.error.organizationMissing'] });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const domain = String(form.get('domain') ?? '');

  if (intent === 'verify') {
    try {
      await apiRequest(request, `/orgs/${organizationId}/domains/${encodeURIComponent(domain)}/verify`, {
        method: 'POST',
      });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      /*
       * The API performs a real DNS TXT lookup and returns 422 with a human-readable message when the
       * record isn't visible yet. Surface that message inline instead of throwing to an error boundary.
       */
      if (error instanceof Response) {
        const key: ProjectDomainsKey =
          error.status >= 500 ? 'projectDomains.error.serviceUnavailable' : 'projectDomains.error.verificationFailed';
        return json({ error: copy[key] });
      }

      /*
       * A non-Response failure (e.g. the apiRequest AbortSignal.timeout firing on a slow
       * upstream DNS-TXT lookup, a hung/draining api pod, or a connection reset) would
       * otherwise propagate to the root error boundary and blow away the whole page.
       * Surface a friendly inline message instead so the user stays on the page.
       */
      console.error('Domain verification request failed:', error);

      return json({ error: copy['projectDomains.error.serviceUnavailable'] });
    }
  } else {
    try {
      await apiRequest(request, `/orgs/${organizationId}/domains`, {
        method: 'POST',
        body: JSON.stringify({ domain }),
      });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      /*
       * The API validates the domain and rejects duplicates or invalid hosts. Surface that
       * message inline instead of throwing to an error boundary.
       */
      if (error instanceof Response) {
        const key: ProjectDomainsKey =
          error.status >= 500 ? 'projectDomains.error.serviceUnavailable' : 'projectDomains.error.addFailed';
        return json({ error: copy[key] });
      }

      /*
       * A non-Response failure (e.g. the apiRequest AbortSignal.timeout firing, a hung/draining
       * api pod, DNS failure, or a connection reset) would otherwise propagate to the root error
       * boundary and blow away the whole page. Surface a friendly inline message instead.
       */
      console.error('Add-domain request failed:', error);

      return json({ error: copy['projectDomains.error.serviceUnavailable'] });
    }
  }

  return redirect(`/projects/${projectId}/domains`);
}

// GET requests always redirect; legacy POST actions and their authorization remain available.
export default function ProjectDomainsPage() {
  return null;
}
