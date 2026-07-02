import { Grid2X2, List, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { AppShell, ProjectGrid, LinkButton, StatusPill, type ProjectCard } from '~/components/dashboard/SaaSLayout';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { projectIdePath } from '~/utils/project-url';

export const meta: MetaFunction = () => [{ title: 'Projects - E-Code' }];

type Organization = { id: string; slug?: string };
type ApiProject = {
  id: string;
  name: string;
  slug?: string;
  updatedAt?: string;
  sourceType?: string;
  gitRepositoryUrl?: string;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgs = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');

  if (orgs.organizations.length === 0) {
    return { projects: [] satisfies ProjectCard[] };
  }

  /*
   * Aggregate across every organization the user belongs to. Previously this
   * only listed organizations[0], so a multi-org user silently never saw the
   * projects in their other orgs. Each project keeps its own org's slug so the
   * IDE link resolves to the correct org-scoped route.
   *
   * Use allSettled, not Promise.all: apiRequest throws on any non-2xx, so a
   * single degraded org (revoked access, backend hiccup, timeout) would reject
   * the whole page and the user would lose access to *every* org's projects.
   * A failing org degrades to "no projects from that org" instead.
   */
  const perOrg = await Promise.allSettled(
    orgs.organizations.map(async (organization) => {
      const result = await apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`);

      return result.projects.map((project) => ({
        id: project.id,
        name: project.name,
        status: 'Ready',
        updated: project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'recently',
        stack: project.gitRepositoryUrl ?? project.sourceType ?? 'E-Code project',
        sourceType: project.sourceType,
        previewImageUrl: `/api/projects/${project.id}/homepage-preview`,
        ideUrl: projectIdePath({ id: project.id, slug: project.slug, organizationSlug: organization.slug }),
      }));
    }),
  );

  for (const settled of perOrg) {
    if (settled.status === 'rejected') {
      console.error('Failed to list projects for an organization:', settled.reason);
    }
  }

  const projects = perOrg.flatMap((settled) => (settled.status === 'fulfilled' ? settled.value : []));

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
      description="Browse persistent E-Code projects, switch between grid and list views, and open managed workspaces."
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
            className="flex h-9 w-9 items-center justify-center rounded-md border border-bolt-elements-borderColor"
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
          >
            <Grid2X2 className="h-4 w-4" aria-hidden />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-md border border-bolt-elements-borderColor"
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
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
              {project.previewImageUrl ? (
                <img
                  src={project.previewImageUrl}
                  alt={`Latest homepage preview for ${project.name}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="min-w-0 truncate text-sm font-semibold" title={project.name}>
                  {project.name}
                </h2>
                <StatusPill label={project.status ?? 'Ready'} />
              </div>
              <p className="mt-1 truncate text-sm text-bolt-elements-textSecondary">
                {project.stack ?? project.sourceType ?? 'Persistent E-Code project'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-bolt-elements-textTertiary">Updated {project.updated ?? 'recently'}</span>
            <LinkButton to={project.ideUrl ?? `/projects/${project.id}/ide`} variant="outline">
              Open IDE
            </LinkButton>
          </div>
        </div>
      ))}
    </div>
  );
}
