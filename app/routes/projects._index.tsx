import type { MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { useMemo, useState } from 'react';
import { Grid2X2, List, Search } from 'lucide-react';
import { AppShell, ProjectGrid, LinkButton, StatusPill, type ProjectCard } from '~/components/dashboard/SaaSLayout';
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
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return projects;
    }

    return projects.filter((project) =>
      [project.name, project.stack, project.sourceType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [projects, query]);

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
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-bolt-elements-borderColor p-2"
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
          >
            <Grid2X2 className="h-4 w-4" aria-hidden />
          </button>
          <button
            className="rounded-md border border-bolt-elements-borderColor p-2"
            aria-label="List view"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            <List className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {view === 'grid' ? <ProjectGrid projects={filteredProjects} /> : <ProjectList projects={filteredProjects} />}
    </AppShell>
  );
}

function ProjectList({ projects }: { projects: ProjectCard[] }) {
  if (!projects.length) {
    return <ProjectGrid projects={projects} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
      {projects.map((project) => (
        <div
          key={project.id}
          className="flex flex-col gap-3 border-b border-bolt-elements-borderColor p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{project.name}</h2>
              <StatusPill label={project.status ?? 'Ready'} />
            </div>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              {project.stack ?? project.sourceType ?? 'Persistent Bolt project'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-bolt-elements-textTertiary">Updated {project.updated ?? 'recently'}</span>
            <LinkButton to={`/projects/${project.id}/ide`} variant="outline">
              Open IDE
            </LinkButton>
          </div>
        </div>
      ))}
    </div>
  );
}
