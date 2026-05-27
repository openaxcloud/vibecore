import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { redirect } from '@remix-run/cloudflare';
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
    throw new Response('Project not found', { status: 404 });
  }

  const resolved = await apiRequest<ResolveProjectResponse>(
    request,
    `/projects/resolve?accountSlug=${encodeURIComponent(accountSlug)}&projectSlug=${encodeURIComponent(projectSlug)}`,
  );

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
