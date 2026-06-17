import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { redirect } from 'react-router';
import ProjectIdeRoute, { shouldRevalidate } from './projects.$projectId.ide';
import { apiRequest } from '~/lib/enterprise-api.server';
import { loadProjectIdeData } from '~/lib/project-ide-loader.server';
import { canonicalAccountSlugFromParam, projectIdePath, slugifyProjectUrlSegment } from '~/utils/project-url';

type ResolveProjectResponse = {
  project: { id: string; slug: string; name: string };
  organization: { id: string; slug: string; name: string };
};

export { shouldRevalidate };

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.project.name} - E-Code IDE` : 'Project - E-Code IDE' },
  { name: 'description', content: 'Authenticated E-Code project IDE with a readable account/project URL.' },
];

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

  const canonicalPath = projectIdePath(
    { id: resolved.project.id, slug: resolved.project.slug, organizationSlug: resolved.organization.slug },
    { searchParams: url.searchParams },
  );

  if (url.pathname.replace(/\/+$/, '') !== canonicalPath.split('?')[0]) {
    throw redirect(canonicalPath);
  }

  return loadProjectIdeData(request, resolved.project.id);
}

export default ProjectIdeRoute;
