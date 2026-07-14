import { Grid2X2, List, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useLoaderData, useRevalidator, useSearchParams } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { ProjectCardMenu, ProjectRenameForm } from '~/components/dashboard/ProjectCardMenu';
import {
  AppShell,
  ProjectGrid,
  ProjectPreviewMedia,
  ProjectStatusPill,
  LinkButton,
  type ProjectCard,
} from '~/components/dashboard/SaaSLayout';
import { EmptyState } from '~/components/ui/EmptyState';
import { FilterChip } from '~/components/ui/FilterChip';
import { RelativeTime } from '~/components/ui/RelativeTime';
import { SearchInput } from '~/components/ui/SearchInput';
import { projectStackLabel } from '~/lib/dashboard-project-stack';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import {
  projectDeploymentSummary,
  projectLifecycle,
  projectLifecycleDisplayLabel,
} from '~/lib/project-card-presentation';
import { projectIdePath } from '~/utils/project-url';

export const meta: MetaFunction = () => [{ title: 'Projects - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

type Organization = { id: string; slug?: string };
type ApiProject = {
  id: string;
  name: string;
  slug?: string;
  updatedAt?: string;
  sourceType?: string;
  gitRepositoryUrl?: string;
  deletedAt?: string | null;
  deploymentCount?: number;
};

type LifecycleFilter = 'all' | 'deployed' | 'draft' | 'archived';

const LIFECYCLE_FILTERS: Array<{ id: LifecycleFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'deployed', label: 'Deployed' },
  { id: 'draft', label: 'Draft' },
  { id: 'archived', label: 'Archived' },
];

function isLifecycleFilter(value: string | null): value is LifecycleFilter {
  return LIFECYCLE_FILTERS.some((filter) => filter.id === value);
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgs = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');

  if (orgs.organizations.length === 0) {
    return { projects: [] satisfies ProjectCard[], failedOrganizationCount: 0, organizationCount: 0 };
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
   *
   * includeArchived=1 lets the Archived filter show soft-deleted projects; the
   * default All view still hides them client-side, matching the old listing.
   */
  const perOrg = await Promise.allSettled(
    orgs.organizations.map(async (organization) => {
      const result = await apiRequest<{ projects: ApiProject[] }>(
        request,
        `/orgs/${organization.id}/projects?includeArchived=1`,
      );

      return result.projects.map((project) => {
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
          ideUrl: projectIdePath({ id: project.id, slug: project.slug, organizationSlug: organization.slug }),
        };
      });
    }),
  );

  for (const settled of perOrg) {
    if (settled.status === 'rejected') {
      console.error('Failed to list projects for an organization:', settled.reason);
    }
  }

  const projects = perOrg.flatMap((settled) => (settled.status === 'fulfilled' ? settled.value : []));
  const failedOrganizationCount = perOrg.filter((settled) => settled.status === 'rejected').length;

  return { projects, failedOrganizationCount, organizationCount: orgs.organizations.length };
}

export default function ProjectsPage() {
  const { projects, failedOrganizationCount, organizationCount } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';
  const allOrganizationsFailed = organizationCount > 0 && failedOrganizationCount === organizationCount;

  const statusParam = searchParams.get('status');
  const statusFilter: LifecycleFilter = isLifecycleFilter(statusParam) ? statusParam : 'all';

  /*
   * Keep ?q= in sync with the input, debounced 150ms so typing doesn't spam
   * history (replace) and shared URLs restore the same filtered view.
   */
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          const trimmed = query.trim();

          if (trimmed) {
            next.set('q', trimmed);
          } else {
            next.delete('q');
          }

          return next;
        },
        { replace: true },
      );
    }, 150);

    return () => window.clearTimeout(handle);
  }, [query, setSearchParams]);

  const setStatusFilter = (filter: LifecycleFilter) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);

        if (filter === 'all') {
          next.delete('status');
        } else {
          next.set('status', filter);
        }

        return next;
      },
      { replace: true },
    );
  };

  const clearFilters = () => {
    setQuery('');
    setSearchParams({}, { replace: true });
  };

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      // The default view hides archived projects, exactly like the old listing.
      if (statusFilter === 'all' ? project.lifecycle === 'archived' : project.lifecycle !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [project.name, project.stack, project.sourceType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [projects, query, statusFilter]);

  const isFiltering = Boolean(query.trim()) || statusFilter !== 'all';
  const noMatches = filteredProjects.length === 0 && projects.length > 0 && isFiltering;

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
      {failedOrganizationCount > 0 && !allOrganizationsFailed ? (
        <AsyncPanelError
          title="Some projects could not load"
          description={`${failedOrganizationCount} organization${failedOrganizationCount === 1 ? '' : 's'} could not be reached. Projects from the other organizations remain available.`}
          onRetry={revalidator.revalidate}
          retrying={retrying}
          compact
          className="mb-5"
        />
      ) : null}
      {allOrganizationsFailed ? (
        retrying ? (
          <AsyncPanelSkeleton label="Loading projects" rows={4} />
        ) : (
          <AsyncPanelError
            title="Projects could not load"
            description="We could not reach your organizations. Your projects are unchanged; try loading them again."
            onRetry={revalidator.revalidate}
          />
        )
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onClear={() => setQuery('')}
                placeholder="Search projects"
                aria-label="Search projects"
                containerClassName="min-w-0 flex-1"
              />
              <div className="flex gap-2">
                <button
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor"
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                  onClick={() => setView('grid')}
                >
                  <Grid2X2 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor"
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                >
                  <List className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter projects by status">
              {LIFECYCLE_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.id}
                  label={filter.label}
                  active={statusFilter === filter.id}
                  onClick={() => setStatusFilter(filter.id)}
                />
              ))}
            </div>
          </div>
          {noMatches ? (
            <EmptyState
              icon={SearchX}
              title={query.trim() ? `No projects match “${query.trim()}”` : 'No projects match these filters'}
              description="Try a different search or clear the filters."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : view === 'grid' ? (
            <ProjectGrid projects={filteredProjects} />
          ) : (
            <ProjectList projects={filteredProjects} />
          )}
        </>
      )}
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
        <ProjectListRow key={project.id} project={project} />
      ))}
    </div>
  );
}

function ProjectListRow({ project }: { project: ProjectCard }) {
  // E16: shares the grid card's ⋯ menu; Rename swaps the row title inline.
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="flex flex-col gap-3 border-b border-bolt-elements-borderColor p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
          <ProjectPreviewMedia project={project} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {renaming ? (
              <ProjectRenameForm
                project={project}
                onDone={() => setRenaming(false)}
                className="h-7 max-w-xs text-sm font-semibold"
              />
            ) : (
              <h2 className="min-w-0 truncate text-sm font-semibold" title={project.name}>
                {project.name}
              </h2>
            )}
            <ProjectStatusPill project={project} />
          </div>
          <p className="mt-1 truncate text-sm text-bolt-elements-textSecondary">
            {project.stack ?? project.sourceType ?? 'Persistent E-Code project'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 text-xs text-bolt-elements-textTertiary">
          {project.updatedAtIso ? (
            <RelativeTime value={project.updatedAtIso} prefix="Last activity" className="block" />
          ) : (
            <span className="block">Last activity {project.updated ?? 'recently'}</span>
          )}
          <span className="block">{projectDeploymentSummary(project.deploymentCount)}</span>
        </div>
        <LinkButton to={project.ideUrl ?? `/projects/${project.id}/ide`} variant="outline">
          Open IDE
        </LinkButton>
        <ProjectCardMenu project={project} onRename={() => setRenaming(true)} />
      </div>
    </div>
  );
}
