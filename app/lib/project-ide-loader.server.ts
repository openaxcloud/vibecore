import { apiErrorMessage, apiRequest, json } from '~/lib/enterprise-api.server';

export type ProjectLoaderData = {
  projectId: string;
  project: {
    id: string;
    name: string;
    slug?: string;
    organizationId?: string;
    gitDefaultBranch?: string;
  };
  workspace: {
    id?: string;
    name?: string;
    status?: string;
    runtimeMode?: string;
    ports?: Array<{ port?: number; ready?: boolean; url?: string }>;
  } | null;
  organization: {
    id: string;
    name?: string;
    slug?: string;
  } | null;
  git: {
    branch?: string;
  };
  collaborators: Array<{ id?: string; userId?: string; roleKey?: string }>;
  notifications: Array<{ id?: string; action: string; createdAt?: string; metadata?: unknown }>;
  initialIdePanels: Record<
    string,
    {
      panel: string;
      project: ProjectLoaderData['project'];
      status: 'ok' | 'empty' | 'error';
      data: unknown;
    }
  >;
  projectApiError?: string;
};

export async function loadProjectIdeData(request: Request, projectId: string) {
  if (!projectId) {
    throw new Response('Project not found', { status: 404 });
  }

  try {
    const result = await apiRequest<{ project: ProjectLoaderData['project'] }>(request, `/projects/${projectId}`);

    const [collaboratorsResult, dashboardResult, organizationsResult] = await Promise.all([
      apiRequest<{ collaborators: ProjectLoaderData['collaborators'] }>(
        request,
        `/projects/${projectId}/collaborators`,
      ).catch(() => ({ collaborators: [] })),
      apiRequest<{
        workspace?: ProjectLoaderData['workspace'];
        git?: ProjectLoaderData['git'];
        recentActivity?: ProjectLoaderData['notifications'];
      }>(request, `/projects/${projectId}/dashboard`).catch(() => ({ workspace: null, git: {}, recentActivity: [] })),
      apiRequest<{ organizations: NonNullable<ProjectLoaderData['organization']>[] }>(request, '/orgs').catch(() => ({
        organizations: [],
      })),
    ]);

    const organization =
      organizationsResult.organizations.find((item) => item.id === result.project.organizationId) ??
      organizationsResult.organizations[0] ??
      null;

    return json<ProjectLoaderData>({
      projectId,
      project: result.project,
      workspace: dashboardResult.workspace ?? null,
      organization,
      git: dashboardResult.git ?? {},
      collaborators: collaboratorsResult.collaborators ?? [],
      notifications: dashboardResult.recentActivity ?? [],
      initialIdePanels: {
        git: {
          panel: 'git',
          project: result.project,
          status: 'ok',
          data: { status: dashboardResult.git ?? {} },
        },
      },
    });
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project API unavailable');

    return json<ProjectLoaderData>({
      projectId,
      project: { id: projectId, name: projectId },
      workspace: null,
      organization: null,
      git: {},
      collaborators: [],
      notifications: [],
      initialIdePanels: {},
      projectApiError: message,
    });
  }
}
