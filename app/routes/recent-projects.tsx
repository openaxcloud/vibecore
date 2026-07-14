import type { MetaFunction } from 'react-router';
import { useLoaderData, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, ProjectGrid } from '~/components/dashboard/SaaSLayout';
import { projectStackLabel } from '~/lib/dashboard-project-stack';
import { apiRequest, firstOrganizationOrNull, redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { projectLifecycle, projectLifecycleDisplayLabel } from '~/lib/project-card-presentation';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Recent projects - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

type ApiProject = {
  id: string;
  name: string;
  updatedAt?: string;
  sourceType?: string;
  gitRepositoryUrl?: string;
  deploymentCount?: number;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  try {
    const result = await apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`);

    const projects = Array.isArray(result?.projects) ? result.projects : [];

    return {
      projects: projects
        .sort((left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime())
        .map((project) => {
          const lifecycle = projectLifecycle(project);

          return {
            id: project.id,
            name: project.name,
            status: projectLifecycleDisplayLabel(lifecycle),
            lifecycle,
            deploymentCount: project.deploymentCount,
            updated: project.updatedAt ? (formatUserAreaDateTime(project.updatedAt) ?? 'recently') : 'recently',
            updatedAtIso: project.updatedAt,
            stack: projectStackLabel(project),
            sourceType: project.sourceType,
            previewImageUrl: `/api/projects/${project.id}/thumbnail`,
          };
        }),
      projectsUnavailable: false,
    };
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return { projects: [], projectsUnavailable: true };
  }
}

export default function RecentProjectsPage() {
  const { projects, projectsUnavailable } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';

  return (
    <AppShell
      title="Recent projects"
      description="Continue from the projects and workspaces you touched most recently."
    >
      {projectsUnavailable ? (
        retrying ? (
          <AsyncPanelSkeleton label="Loading recent projects" rows={4} />
        ) : (
          <AsyncPanelError
            title="Recent projects could not load"
            description="The project list is hidden because the latest request failed. No project was changed."
            onRetry={revalidator.revalidate}
          />
        )
      ) : (
        <ProjectGrid projects={projects} />
      )}
    </AppShell>
  );
}
