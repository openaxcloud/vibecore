import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { AppShell, ProjectGrid } from '~/components/dashboard/SaaSLayout';
import { apiRequest, firstOrganizationOrNull, redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Recent projects - E-Code' }];

type ApiProject = { id: string; name: string; updatedAt?: string; sourceType?: string; gitRepositoryUrl?: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  const result = await apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`);

  return {
    projects: result.projects
      .sort((left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime())
      .map((project) => ({
        id: project.id,
        name: project.name,
        status: 'Ready',
        updated: project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'recently',
        stack: project.gitRepositoryUrl ?? project.sourceType ?? 'Bolt project',
        sourceType: project.sourceType,
        previewImageUrl: `/api/projects/${project.id}/homepage-preview`,
      })),
  };
}

export default function RecentProjectsPage() {
  const { projects } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Recent projects"
      description="Continue from the projects and workspaces you touched most recently."
    >
      <ProjectGrid projects={projects} />
    </AppShell>
  );
}
