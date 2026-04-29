import type { MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { Grid2X2, List, Search } from 'lucide-react';
import { AppShell, ProjectGrid, LinkButton, type ProjectCard } from '~/components/dashboard/SaaSLayout';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Projects - VibeCore' }];

type Organization = { id: string };
type ApiProject = { id: string; name: string; updatedAt?: string; sourceType?: string; gitRepositoryUrl?: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgs = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  const organization = orgs.organizations[0];

  if (!organization) {
    return { projects: [] satisfies ProjectCard[] };
  }

  const result = await apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`);
  const projects = result.projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: 'Ready',
    updated: project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'recently',
    stack: project.gitRepositoryUrl ?? project.sourceType ?? 'Bolt project',
    sourceType: project.sourceType,
  }));

  return { projects };
}

export default function ProjectsPage() {
  const { projects } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Projects"
      description="Browse persistent Bolt projects, switch between grid and list views, and open managed workspaces."
      actions={
        <>
          <LinkButton to="/projects/new">Create project</LinkButton>
          <LinkButton to="/import-github" variant="outline">
            Import GitHub
          </LinkButton>
        </>
      }
    >
      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="Search projects"
            aria-label="Search projects"
          />
        </label>
        <div className="flex gap-2">
          <button className="rounded-md border border-bolt-elements-borderColor p-2" aria-label="Grid view">
            <Grid2X2 className="h-4 w-4" aria-hidden />
          </button>
          <button className="rounded-md border border-bolt-elements-borderColor p-2" aria-label="List view">
            <List className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <ProjectGrid projects={projects} />
    </AppShell>
  );
}
