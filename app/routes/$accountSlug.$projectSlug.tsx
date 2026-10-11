import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { redirect } from 'react-router';
import ProjectIdeRoute, { shouldRevalidate } from './projects.$projectId.ide';
import { apiRequest } from '~/lib/enterprise-api.server';
import { buildRemainingRouteMeta, getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';
import { loadProjectIdeData } from '~/lib/project-ide-loader.server';
import { canonicalAccountSlugFromParam, projectIdePath, slugifyProjectUrlSegment } from '~/utils/project-url';

type ResolveProjectResponse = {
  project: { id: string; slug: string; name: string };
  organization: { id: string; slug: string; name: string };
};

export { shouldRevalidate };

export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = rootData?.language;
  const copy = getRemainingRouteShellsCopy(language);
  const title = data ? `${data.project.name} - E-Code IDE` : copy['remainingRoutes.projectIde.fallbackTitle'];
  const path = `/${encodeURIComponent(params.accountSlug ?? '')}/${encodeURIComponent(params.projectSlug ?? '')}`;

  return buildRemainingRouteMeta({
    title,
    description: copy['remainingRoutes.projectIde.description'],
    path,
    language,
  });
};

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const accountSlug = canonicalAccountSlugFromParam(params.accountSlug);
  const projectSlug = slugifyProjectUrlSegment(params.projectSlug ?? '');

  if (!accountSlug || !projectSlug) {
    throw new Response(null, { status: 404 });
  }

  let resolved: ResolveProjectResponse;

  try {
    resolved = await apiRequest<ResolveProjectResponse>(
      request,
      `/projects/resolve?accountSlug=${encodeURIComponent(accountSlug)}&projectSlug=${encodeURIComponent(projectSlug)}`,
    );
  } catch (error) {
    /* Re-throw genuine 404s and redirects so project-not-found still resolves correctly. */
    if (error instanceof Response && error.status < 500) {
      throw error;
    }

    /*
     * Transient API failures (5xx, network/timeout) would otherwise surface as a bare thrown
     * Response and crash the whole IDE page. Send the user to the dashboard instead so the
     * readable account/project URL degrades gracefully and can be retried.
     */
    throw redirect('/dashboard');
  }

  const url = new URL(request.url);

  const canonicalPath = projectIdePath(
    { id: resolved.project.id, slug: resolved.project.slug, organizationSlug: resolved.organization.slug },
    { searchParams: url.searchParams },
  );

  if (url.pathname.replace(/\/+$/, '') !== canonicalPath.split('?')[0]) {
    throw redirect(canonicalPath);
  }

  return loadProjectIdeData(request, resolved.project.id, context);
}

export default ProjectIdeRoute;
