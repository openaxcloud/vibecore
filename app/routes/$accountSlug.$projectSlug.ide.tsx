import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import { shouldRethrowResolveError } from '~/lib/canonical-resolve-failure';
import { apiRequest } from '~/lib/enterprise-api.server';
import { canonicalAccountSlugFromParam, projectIdePath, slugifyProjectUrlSegment } from '~/utils/project-url';

type ResolveProjectResponse = {
  project: { id: string; slug: string };
  organization: { slug: string };
};

export async function loader({ request, params }: LoaderFunctionArgs) {
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
    /* Re-throw genuine 404s and login/MFA redirects so project-not-found still resolves correctly. */
    if (shouldRethrowResolveError(error)) {
      throw error;
    }

    /*
     * Transient API failures (5xx, network / AbortSignal timeout) would otherwise propagate
     * uncaught and surface a hard root-level error page when the api pod is draining or slow.
     * Send the user to the dashboard instead so the canonical /ide URL degrades gracefully and
     * can be retried.
     */
    throw redirect('/dashboard');
  }

  const url = new URL(request.url);

  throw redirect(
    projectIdePath(
      { id: resolved.project.id, slug: resolved.project.slug, organizationSlug: resolved.organization.slug },
      { searchParams: url.searchParams },
    ),
  );
}

export default function CanonicalProjectIdeRedirect() {
  return null;
}
