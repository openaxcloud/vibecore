import { apiErrorMessage, apiRequest, json } from '~/lib/enterprise-api.server';

export type ProjectWorkspaceSummary = {
  id: string;
  name?: string;
  status?: string;
  runtimeMode?: string;
  createdAt?: string;
  gitRepositoryUrl?: string | null;
};

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

  /*
   * The list of workspaces the project owns, plus the resolved selection. The
   * current workspace defaults to the primary (oldest) one and is overridden
   * when the IDE URL carries `?workspace=<id>`. UI tabs read this id via the
   * CurrentWorkspaceContext so per-workspace scoping stays consistent without
   * each tab fetching the workspace list on its own.
   */
  workspaces: ProjectWorkspaceSummary[];
  currentWorkspaceId?: string;
  primaryWorkspaceId?: string;
  projectApiError?: string;
};

/*
 * `apiRequest` signals login/MFA navigations by throwing a redirect `Response`
 * (3xx). React Router only navigates when a loader throws such a Response, so
 * the IDE loader must re-throw these instead of folding them into its soft
 * error shell.
 */
export function isRedirectResponse(error: unknown): error is Response {
  return error instanceof Response && error.status >= 300 && error.status < 400;
}

export async function loadProjectIdeData(request: Request, projectId: string) {
  if (!projectId) {
    throw new Response('Project not found', { status: 404 });
  }

  const url = new URL(request.url);

  /*
   * `?workspace=` is the canonical name; `?workspaceId=` is accepted as a
   * tolerant alias so links forwarded from API responses keep working.
   */
  const requestedWorkspaceId = url.searchParams.get('workspace') ?? url.searchParams.get('workspaceId') ?? undefined;

  try {
    const result = await apiRequest<{ project: ProjectLoaderData['project'] }>(request, `/projects/${projectId}`);

    const [collaboratorsResult, dashboardResult, organizationsResult, workspacesResult] = await Promise.all([
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
      apiRequest<{ workspaces: ProjectWorkspaceSummary[] }>(request, `/projects/${projectId}/workspaces`).catch(() => ({
        workspaces: [] as ProjectWorkspaceSummary[],
      })),
    ]);

    const organization =
      organizationsResult.organizations.find((item) => item.id === result.project.organizationId) ??
      organizationsResult.organizations[0] ??
      null;

    const workspaces = Array.isArray(workspacesResult.workspaces) ? workspacesResult.workspaces : [];
    const { currentWorkspaceId, primaryWorkspaceId } = resolveWorkspaceSelection(workspaces, requestedWorkspaceId);

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
      workspaces,
      currentWorkspaceId,
      primaryWorkspaceId,
    });
  } catch (error) {
    /*
     * `apiRequest` throws redirect Responses (login on 401, MFA on 403) for page
     * navigations. React Router navigates only when a loader *throws* such a
     * Response, so re-throw any 3xx here instead of swallowing it into the soft
     * shell below — otherwise a logged-out user renders broken IDE chrome rather
     * than being sent to /login.
     */
    if (isRedirectResponse(error)) {
      throw error;
    }

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
      workspaces: [],
      projectApiError: message,
    });
  }
}

function resolveWorkspaceSelection(workspaces: ProjectWorkspaceSummary[], requestedWorkspaceId: string | undefined) {
  /*
   * Workspaces from /workspaces come back DESC by createdAt. The primary is the
   * oldest, so we sort ascending and take the first entry. Picking the primary
   * by default means freshly opening the IDE lands on the canonical working
   * tree rather than whatever experimental branch was created last.
   */
  const orderedByCreated = [...workspaces].sort((a, b) =>
    String(a?.createdAt ?? '').localeCompare(String(b?.createdAt ?? '')),
  );

  const primaryWorkspaceId = orderedByCreated[0]?.id;

  const requestedIsKnown =
    requestedWorkspaceId && workspaces.some((workspace) => workspace?.id === requestedWorkspaceId);

  const currentWorkspaceId = requestedIsKnown ? requestedWorkspaceId : primaryWorkspaceId;

  return { currentWorkspaceId, primaryWorkspaceId };
}
