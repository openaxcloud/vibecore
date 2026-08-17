import { randomUUID } from 'node:crypto';
import {
  classifyDatabaseRestoreError,
  foldRestoreResponse,
  shouldRestoreDatabase,
  type DatabaseRestoreOutcome,
} from './snapshot-restore-database';
import {
  apiRequest,
  clearSessionCookie,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  apiRuntimeRoutesEn,
  formatApiRuntimeRoutesCopy,
  getApiRuntimeRoutesCopy,
  type ApiRuntimeRoutesCopy,
} from '~/lib/i18n/catalogs/api-runtime-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { reconcileDebugSessions } from '~/lib/ide/debug-session-status';
import { isSecurityScheduleDue, vulnerabilitiesFromSecretScan } from '~/lib/ide-panel-security';
import {
  computeNextRunFromCron,
  defaultWorkflowSchedule,
  isWorkflowScheduleDue,
  normalizeWorkflowSchedule,
  runWorkflowSteps,
  validateCron,
  type WorkflowLike,
  type WorkflowStateLike,
} from '~/lib/ide-panel-workflows';
import { defaultProjectKeybindings, serializeKeybindingOverrides } from '~/lib/keybindings';
import { buildProjectOverviewInsights } from '~/lib/project-overview';
import { generateSshKeyPair } from '~/lib/ssh-keygen.server';

export type IdePanelStatus = 'ok' | 'empty' | 'error';

const OVERVIEW_STREAM_INTERVAL_MS = 15_000;

const ENV_VAR_SCOPES = ['development', 'preview', 'production'] as const;
type EnvVarScope = (typeof ENV_VAR_SCOPES)[number];

/*
 * Only forward a known scope; anything else is dropped so the API applies its
 * own production default (keeps pre-scope clients working).
 */
function normalizeEnvScope(scope: string | undefined): EnvVarScope | undefined {
  return ENV_VAR_SCOPES.includes(scope as EnvVarScope) ? (scope as EnvVarScope) : undefined;
}

export interface IdePanelEnvelope<T = unknown> {
  panel: string;
  project: unknown;
  status: IdePanelStatus;
  data: T;
  error?: { code: string; message: string; retryable: boolean };
}

function isPanelDataEmpty(data: unknown): boolean {
  if (data === null || data === undefined) {
    return true;
  }

  if (Array.isArray(data)) {
    return data.length === 0;
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);

    if (entries.length === 0) {
      return true;
    }

    return entries.every(([, value]) => {
      if (Array.isArray(value)) {
        return value.length === 0;
      }

      return value === null || value === undefined;
    });
  }

  return false;
}

function panelEnvelope<T>(panel: string, project: unknown, data: T): IdePanelEnvelope<T> {
  return {
    panel,
    project,
    status: isPanelDataEmpty(data) ? 'empty' : 'ok',
    data,
  };
}

function panelEnvelopeError(
  panel: string,
  project: unknown,
  error: unknown,
  language?: string | null,
): IdePanelEnvelope<null> {
  const copy = getApiRuntimeRoutesCopy(language);
  const status = (error as { status?: number } | undefined)?.status;

  /*
   * BUG-QA-PANEL-429-MASKED-001 : 429 n'avait pas de branche et retombait dans
   * le fourre-tout `PANEL_REQUEST_FAILED`, donc « les données du panneau n'ont
   * pas pu être chargées » — alors que la cause réelle est un QUOTA atteint, que
   * l'utilisateur peut corriger. La ligne `retryable` juste en dessous
   * reconnaissait pourtant déjà 429.
   */
  const code =
    status === 401
      ? 'PANEL_AUTH'
      : status === 403
        ? 'PANEL_FORBIDDEN'
        : status === 404
          ? 'PANEL_NOT_FOUND'
          : status === 429
            ? 'PANEL_QUOTA_EXCEEDED'
            : status && status >= 500
              ? 'PANEL_BACKEND_UNAVAILABLE'
              : 'PANEL_REQUEST_FAILED';

  const retryable = !status || status >= 500 || status === 408 || status === 429;

  const message =
    code === 'PANEL_AUTH'
      ? copy['apiRuntime.panel.authenticationRequired']
      : code === 'PANEL_FORBIDDEN'
        ? copy['apiRuntime.panel.forbidden']
        : code === 'PANEL_NOT_FOUND'
          ? copy['apiRuntime.panel.notFound']
          : code === 'PANEL_QUOTA_EXCEEDED'
            ? copy['apiRuntime.panel.quotaExceeded']
            : code === 'PANEL_BACKEND_UNAVAILABLE'
              ? copy['apiRuntime.panel.backendUnavailable']
              : copy['apiRuntime.panel.loadFailed'];

  console.error('IDE panel request failed:', { panel, status, error });

  return {
    panel,
    project,
    status: 'error',
    data: null,
    error: { code, message, retryable },
  };
}

function panelErrorMessage(error: unknown, language?: string | null) {
  console.error('IDE runtime request failed:', error);

  return getApiRuntimeRoutesCopy(language)['apiRuntime.panel.runtimeFailed'];
}

export function scopeDeploymentsForWorkspace(
  deployments: Array<Record<string, unknown>>,
  selectedWorkspaceId?: string,
  primaryWorkspaceId?: string,
) {
  return deployments.filter((deployment) => {
    const deploymentWorkspaceId =
      typeof deployment.workspaceId === 'string' && deployment.workspaceId.length > 0
        ? deployment.workspaceId
        : undefined;

    if (!selectedWorkspaceId) {
      return !deploymentWorkspaceId;
    }

    if (selectedWorkspaceId === primaryWorkspaceId) {
      return !deploymentWorkspaceId || deploymentWorkspaceId === selectedWorkspaceId;
    }

    return deploymentWorkspaceId === selectedWorkspaceId;
  });
}

interface PanelWorkspaceContext {
  workspaceList: Array<Record<string, unknown>>;
  primaryWorkspaceId?: string;
  activeWorkspaceId?: string;
  selectedWorkspaceId?: string;
}

/*
 * Resolves the workspace a panel loader should operate on, mirroring the
 * git/debugger pattern. Honors `?workspaceId=` when it matches one of the
 * project's workspaces; otherwise falls back to the primary (oldest)
 * workspace so panels land on the canonical working tree instead of whichever
 * experimental branch was created most recently.
 */
async function resolvePanelWorkspace(
  request: Request,
  projectId: string,
  requestedWorkspaceId?: string,
): Promise<PanelWorkspaceContext> {
  const workspacesResponse = await apiRequest<{ workspaces: Array<Record<string, unknown>> }>(
    request,
    `/projects/${projectId}/workspaces`,
  ).catch(() => ({ workspaces: [] as Array<Record<string, unknown>> }));

  const workspaceList = Array.isArray(workspacesResponse?.workspaces) ? workspacesResponse.workspaces : [];

  const orderedByCreated = [...workspaceList].sort((a, b) =>
    String(a?.createdAt ?? '').localeCompare(String(b?.createdAt ?? '')),
  );

  const primaryWorkspaceId =
    typeof orderedByCreated[0]?.id === 'string' ? (orderedByCreated[0]!.id as string) : undefined;
  const activeWorkspaceId =
    typeof workspaceList[0]?.id === 'string' ? (workspaceList[0]!.id as string) : primaryWorkspaceId;

  const requestedIsKnown =
    requestedWorkspaceId && workspaceList.some((workspace) => workspace?.id === requestedWorkspaceId);

  const selectedWorkspaceId = requestedIsKnown ? requestedWorkspaceId : (primaryWorkspaceId ?? activeWorkspaceId);

  return { workspaceList, primaryWorkspaceId, activeWorkspaceId, selectedWorkspaceId };
}

async function loadOverviewPanelEnvelope(
  request: Request,
  projectId: string,
  project: unknown,
  language?: string | null,
) {
  try {
    const [dashboard, packages, collaborators, gitGraph, envVars] = await Promise.all([
      apiRequest(request, `/projects/${projectId}/dashboard`).catch((error) => ({
        error: panelErrorMessage(error, language),
      })),
      apiRequest(request, `/projects/${projectId}/packages`).catch(() => null),
      apiRequest(request, `/projects/${projectId}/collaboration`).catch(() => ({ collaborators: [] })),
      apiRequest(request, `/projects/${projectId}/git/graph`).catch(() => ({ commits: [] })),
      apiRequest(request, `/projects/${projectId}/env-vars`).catch((error) => ({
        envVars: [],
        error: panelErrorMessage(error, language),
      })),
    ]);

    const dashboardData = dashboard as Record<string, any>;
    const packageData = packages as Record<string, any> | null;
    const collaborationData = collaborators as Record<string, any>;
    const gitGraphData = gitGraph as Record<string, any>;

    return panelEnvelope('overview', project, {
      ...dashboardData,
      packageManager: packageData?.packageManager,
      manifests: packageData?.manifests ?? [],
      dependencies: packageData?.dependencies ?? [],
      lockfiles: packageData?.lockfiles ?? [],
      commits: gitGraphData?.commits ?? [],
      collaborators: collaborationData?.collaborators ?? [],
      presence: collaborationData?.presence ?? [],
      overview: buildProjectOverviewInsights({
        project: project as any,
        language,
        dashboard: dashboardData as any,
        packages: packageData as any,
        gitGraph: gitGraphData as any,
        collaboration: collaborationData as any,
      }),
      workflowsState: readWorkflowsState(envVars, language),
      terminalState: readTerminalState(envVars, language),
      packagesState: readPackagesState(envVars),
    });
  } catch (error) {
    return panelEnvelope('overview', project, {
      overview: buildProjectOverviewInsights({ project: project as any, language }),
      loadError: panelErrorMessage(error, language),
      workflowsState: defaultWorkflowsState(language),
      terminalState: defaultTerminalState(),
      packagesState: defaultPackagesState(),
    });
  }
}

function encodeServerSentEvent(eventName: string, data: unknown) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamOverviewPanel(request: Request, projectId: string, project: unknown, language?: string | null) {
  const encoder = new TextEncoder();

  let interval: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let sending = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        closed = true;

        if (interval) {
          clearInterval(interval);
          interval = undefined;
        }

        try {
          controller.close();
        } catch {
          // The client may already have closed the stream.
        }
      };

      const send = async () => {
        if (closed || sending) {
          return;
        }

        sending = true;

        try {
          const envelope = await loadOverviewPanelEnvelope(request, projectId, project, language);

          if (!closed) {
            controller.enqueue(encoder.encode(encodeServerSentEvent('overview', envelope)));
          }
        } catch (error) {
          if (!closed) {
            controller.enqueue(
              encoder.encode(encodeServerSentEvent('error', panelEnvelopeError('overview', project, error, language))),
            );
          }
        } finally {
          sending = false;
        }
      };

      request.signal.addEventListener('abort', close, { once: true });
      void send();
      interval = setInterval(() => void send(), OVERVIEW_STREAM_INTERVAL_MS);
    },
    cancel() {
      closed = true;

      if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

const panelEndpoints: Record<string, (projectId: string) => string> = {
  overview: (projectId) => `/projects/${projectId}/dashboard`,
  database: (projectId) => `/projects/${projectId}/dashboard`,
  'object-storage': (projectId) => `/projects/${projectId}/dashboard`,
  packages: (projectId) => `/projects/${projectId}/packages`,
  skills: (projectId) => `/projects/${projectId}/skills`,
  monitoring: (projectId) => `/projects/${projectId}/dashboard`,
  extensions: (projectId) => `/projects/${projectId}/dashboard`,
  integrations: (projectId) => `/projects/${projectId}/env-vars`,
  workflows: (projectId) => `/projects/${projectId}/env-vars`,
  debugger: (projectId) => `/projects/${projectId}/env-vars`,
  security: (projectId) => `/projects/${projectId}/activity`,
  terminal: (projectId) => `/projects/${projectId}/dashboard`,
  deployments: (projectId) => `/projects/${projectId}/deployments`,
  env: (projectId) => `/projects/${projectId}/env-vars`,
  secrets: (projectId) => `/projects/${projectId}/secrets`,
  git: (projectId) => `/projects/${projectId}/git/status`,
  activity: (projectId) => `/projects/${projectId}/activity`,
  logs: (projectId) => `/projects/${projectId}/dashboard`,
  collaborators: (projectId) => `/projects/${projectId}/collaboration`,
  snapshots: (projectId) => `/projects/${projectId}/snapshots`,
  settings: (projectId) => `/projects/${projectId}/settings`,
};

async function loaderHandler({ request, params }: EnterpriseLoaderArgs) {
  const language = resolveRequestLocale(request).language;
  const copy = getApiRuntimeRoutesCopy(language);
  const projectId = params.projectId;
  const panel = params.panel;

  if (!projectId || !panel) {
    throw json({ error: copy['apiRuntime.panel.panelNotFound'], code: 'PANEL_NOT_FOUND' }, { status: 404 });
  }

  const project = await apiRequest<{ project: unknown }>(request, `/projects/${projectId}`);
  const url = new URL(request.url);

  if (
    panel === 'overview' &&
    (url.searchParams.get('stream') === '1' || request.headers.get('accept')?.includes('text/event-stream'))
  ) {
    return streamOverviewPanel(request, projectId, project.project, language);
  }

  if (panel === 'overview') {
    return json(await loadOverviewPanelEnvelope(request, projectId, project.project, language));
  }

  if (panel === 'domains') {
    try {
      const organizationId = (project.project as any)?.organizationId;

      if (!organizationId) {
        throw Object.assign(new Error(), { code: 'PROJECT_ORGANIZATION_MISSING' });
      }

      const [domains, deployments] = await Promise.all([
        apiRequest(request, `/orgs/${organizationId}/domains`),
        apiRequest(request, `/projects/${projectId}/deployments`),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(domains as any),
          ...(deployments as any),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'git') {
    try {
      const blameFile = url.searchParams.get('blameFile');
      const diffFile = url.searchParams.get('diffFile');
      const commitSha = url.searchParams.get('commitSha');
      const conflictFile = url.searchParams.get('conflictFile');
      const requestedWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;

      const workspacesResponse = await apiRequest<{ workspaces: Array<Record<string, unknown>> }>(
        request,
        `/projects/${projectId}/workspaces`,
      ).catch(() => ({ workspaces: [] as Array<Record<string, unknown>> }));

      const workspaceList = Array.isArray(workspacesResponse?.workspaces) ? workspacesResponse.workspaces : [];

      const orderedByCreated = [...workspaceList].sort((a, b) =>
        String(a?.createdAt ?? '').localeCompare(String(b?.createdAt ?? '')),
      );

      const primaryWorkspaceId =
        typeof orderedByCreated[0]?.id === 'string' ? (orderedByCreated[0]!.id as string) : undefined;

      /*
       * workspaceList comes back DESC by createdAt, so workspaceList[0] is the
       * most recently created workspace. Expose it as activeWorkspaceId so the
       * UI can label it, but default the selection to the primary (oldest)
       * workspace so the IDE lands on the canonical working tree rather than
       * whatever experimental branch was created most recently.
       */
      const activeWorkspaceId =
        typeof workspaceList[0]?.id === 'string' ? (workspaceList[0]!.id as string) : primaryWorkspaceId;

      const selectedWorkspaceId =
        requestedWorkspaceId && workspaceList.some((workspace) => workspace?.id === requestedWorkspaceId)
          ? requestedWorkspaceId
          : (primaryWorkspaceId ?? activeWorkspaceId);

      const workspaceQueryParam =
        selectedWorkspaceId && selectedWorkspaceId !== primaryWorkspaceId
          ? `workspaceId=${encodeURIComponent(selectedWorkspaceId)}`
          : '';

      const withWorkspace = (path: string) => {
        if (!workspaceQueryParam) {
          return path;
        }

        return path.includes('?') ? `${path}&${workspaceQueryParam}` : `${path}?${workspaceQueryParam}`;
      };

      /*
       * status + branches were the only un-caught calls here, so a single 5xx
       * from either (e.g. a workspace whose repo momentarily fails) nuked the
       * WHOLE Git panel with PANEL_BACKEND_UNAVAILABLE. Degrade each to a clean
       * empty state (with a soft gitLoadError marker the UI can surface inline)
       * so the panel still renders — matching how graph/stashes already behave.
       */
      const [status, branches, graph, stashes] = await Promise.all([
        apiRequest(request, withWorkspace(`/projects/${projectId}/git/status`)).catch((error) => ({
          status: { branch: 'main', changedFiles: [], fileStatuses: [], conflicts: [], ahead: 0, behind: 0 },
          gitLoadError: panelErrorMessage(error, language),
        })),
        apiRequest(request, withWorkspace(`/projects/${projectId}/git/branches`)).catch(() => ({
          branches: [],
          selected: 'main',
        })),
        apiRequest(request, withWorkspace(`/projects/${projectId}/git/graph`)).catch(() => ({ commits: [] })),
        apiRequest(request, withWorkspace(`/projects/${projectId}/git/stashes`)).catch(() => ({ stashes: [] })),
      ]);
      const [blame, diff] = await Promise.all([
        blameFile
          ? apiRequest(
              request,
              withWorkspace(`/projects/${projectId}/git/blame?filePath=${encodeURIComponent(blameFile)}`),
            ).catch(() => ({
              blame: [],
            }))
          : Promise.resolve({ blame: [] }),
        diffFile
          ? apiRequest(
              request,
              withWorkspace(`/projects/${projectId}/git/diff?filePath=${encodeURIComponent(diffFile)}`),
            ).catch(() => ({
              diff: '',
            }))
          : Promise.resolve({ diff: '' }),
      ]);
      const commitDetail = commitSha
        ? await apiRequest(request, withWorkspace(`/projects/${projectId}/git/commit/${encodeURIComponent(commitSha)}`))
            .then((detail) => ({ commitDetail: detail }))
            .catch(() => ({ commitDetail: null }))
        : { commitDetail: null };
      const conflictContent = conflictFile
        ? await apiRequest(
            request,
            withWorkspace(`/projects/${projectId}/git/conflict-file?filePath=${encodeURIComponent(conflictFile)}`),
          )
            .then((detail) => ({ conflictContent: detail }))
            .catch(() => ({ conflictContent: null }))
        : { conflictContent: null };

      return json(
        panelEnvelope(panel, project.project, {
          ...(status as any),
          ...(branches as any),
          ...(graph as any),
          ...(stashes as any),
          ...(blame as any),
          ...(diff as any),
          ...(commitDetail as any),
          ...(conflictContent as any),
          workspaces: workspaceList,
          activeWorkspaceId,
          primaryWorkspaceId,
          selectedWorkspaceId,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'deployments') {
    try {
      const requestedWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;
      const workspaceCtx = await resolvePanelWorkspace(request, projectId, requestedWorkspaceId);

      const selectedWorkspaceId = workspaceCtx.selectedWorkspaceId;

      /*
       * Deploy → Overview (Replit parity) reads REAL data: the deployment list
       * (provider/status/url/commitSha/branch), the project's database
       * connections (Database connected), and the git commit graph (commit
       * history scoping the deployment — hash + author + date). Each enrichment
       * is best-effort so the panel never fails if git/db is unavailable.
       */
      const [deployments, databases, commitGraph] = await Promise.all([
        apiRequest<{ deployments?: Array<Record<string, unknown>> }>(request, `/projects/${projectId}/deployments`),
        apiRequest<{ connections?: unknown[] }>(request, `/projects/${projectId}/databases`).catch(() => ({
          connections: [],
        })),
        apiRequest<{ commits?: unknown[] }>(
          request,
          `/projects/${projectId}/git/graph${selectedWorkspaceId ? `?workspaceId=${encodeURIComponent(selectedWorkspaceId)}` : ''}`,
        ).catch(() => ({ commits: [] })),
      ]);

      const deploymentList = Array.isArray(deployments.deployments) ? deployments.deployments : [];
      const primaryWorkspaceId = workspaceCtx.primaryWorkspaceId;
      const scopedDeployments = scopeDeploymentsForWorkspace(deploymentList, selectedWorkspaceId, primaryWorkspaceId);

      return json(
        panelEnvelope(panel, project.project, {
          deployments: scopedDeployments,
          allDeployments: deploymentList,
          connections: Array.isArray(databases.connections) ? databases.connections : [],
          gitCommits: Array.isArray(commitGraph.commits) ? commitGraph.commits : [],
          workspaces: workspaceCtx.workspaceList,
          primaryWorkspaceId,
          activeWorkspaceId: workspaceCtx.activeWorkspaceId,
          selectedWorkspaceId,
          workspaceId: selectedWorkspaceId,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'ports') {
    try {
      const requestedWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;
      const workspaceCtx = await resolvePanelWorkspace(request, projectId, requestedWorkspaceId);
      const workspaceId = workspaceCtx.selectedWorkspaceId ?? projectId;

      /*
       * Real forwarded ports straight from the runtime + the persisted
       * primary/visibility config (VIBECORE_PORTS_STATE).
       */
      const [runtimePorts, envVars] = await Promise.all([
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/ports`).catch(() => ({
          ports: [],
        })),
        apiRequest(request, `/projects/${projectId}/env-vars`).catch(() => ({ envVars: [] })),
      ]);

      const ports = normalizeRuntimePorts(runtimePorts);

      return json(
        panelEnvelope(panel, project.project, {
          ports,
          portsState: readPortsState(envVars),
          workspaces: workspaceCtx.workspaceList,
          selectedWorkspaceId: workspaceCtx.selectedWorkspaceId,
          workspaceId,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'database') {
    try {
      const schemaKey = url.searchParams.get('schemaKey');

      const [dashboard, databases, envVars, secrets, snapshots] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/dashboard`).catch(() => ({})),
        apiRequest(request, `/projects/${projectId}/databases`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/secrets`),
        apiRequest(request, `/projects/${projectId}/snapshots`).catch(() => ({ snapshots: [] })),
      ]);
      const schema = schemaKey
        ? await apiRequest(
            request,
            `/projects/${projectId}/databases/schema?key=${encodeURIComponent(schemaKey)}`,
          ).catch((error) => ({ schemaError: panelErrorMessage(error, language) }))
        : {};

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(databases as any),
          ...(envVars as any),
          ...(secrets as any),
          ...(snapshots as any),
          ...(schema as any),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'debugger') {
    try {
      const requestedWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;

      const [dashboard, envVars, activity, workspacesResponse] = await Promise.all([
        apiRequest<any>(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/activity`),
        apiRequest<{ workspaces: Array<Record<string, unknown>> }>(request, `/projects/${projectId}/workspaces`).catch(
          () => ({ workspaces: [] as Array<Record<string, unknown>> }),
        ),
      ]);

      const workspaceList = Array.isArray(workspacesResponse?.workspaces) ? workspacesResponse.workspaces : [];

      const primaryWorkspaceId = (() => {
        const ordered = [...workspaceList].sort((a, b) =>
          String(a?.createdAt ?? '').localeCompare(String(b?.createdAt ?? '')),
        );

        return typeof ordered[0]?.id === 'string' ? (ordered[0]!.id as string) : undefined;
      })();
      const requestedIsKnown =
        requestedWorkspaceId && workspaceList.some((workspace) => workspace?.id === requestedWorkspaceId);

      /*
       * Prefer the explicitly requested workspace, then the project's primary
       * workspace, then the dashboard's reported workspace, and finally the
       * projectId itself as a last-resort fallback. The previous fallback chain
       * silently bound the debugger to whichever workspace happened to be
       * reported by /dashboard rather than the workspace the IDE is scoped to.
       */
      const workspaceId =
        (requestedIsKnown ? requestedWorkspaceId : undefined) ??
        primaryWorkspaceId ??
        dashboard?.workspace?.id ??
        projectId;

      const [runtimeStatus, runtimeProcesses, runtimeLogs] = await Promise.all([
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/status`).catch((error) => ({
          error: panelErrorMessage(error, language),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes`).catch((error) => ({
          error: panelErrorMessage(error, language),
          processes: [],
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/logs/snapshot`).catch(
          (error) => ({
            error: panelErrorMessage(error, language),
            logs: [],
          }),
        ),
      ]);

      const debuggerState = readDebuggerState(envVars, language);

      /*
       * Report the real fate of each launch: a session is only "running" while
       * its pid is still in the workspace's live process list. Read-side only —
       * the stored blob keeps whatever start/stop wrote, and an unreadable
       * process list downgrades nothing.
       */
      debuggerState.sessions = reconcileDebugSessions(debuggerState.sessions ?? [], runtimeProcesses);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(activity as any),
          workspaceId,
          runtimeStatus,
          runtimeProcesses,
          runtimeLogs,
          debuggerState,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'secrets' && url.searchParams.get('reveal') === 'true' && url.searchParams.get('key')) {
    const confirmation = url.searchParams.get('confirm');

    if (confirmation !== '1') {
      return json<IdePanelEnvelope<null>>({
        panel,
        project: project.project,
        status: 'error',
        data: null,
        error: {
          code: 'PANEL_REVEAL_REQUIRES_CONFIRMATION',
          message: copy['apiRuntime.panel.secretConfirmation'],
          retryable: true,
        },
      });
    }

    try {
      const key = url.searchParams.get('key') ?? '';

      const data = await apiRequest(
        request,
        `/projects/${projectId}/secrets?reveal=true&key=${encodeURIComponent(key)}`,
      );

      return json(panelEnvelope(panel, project.project, data));
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'packages') {
    try {
      const requestedWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;
      const workspaceCtx = await resolvePanelWorkspace(request, projectId, requestedWorkspaceId);

      const [packages, envVars] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/packages`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(packages as any),
          envVars: (envVars as any)?.envVars ?? [],
          packagesState: readPackagesState(envVars),
          workspaces: workspaceCtx.workspaceList,
          primaryWorkspaceId: workspaceCtx.primaryWorkspaceId,
          activeWorkspaceId: workspaceCtx.activeWorkspaceId,
          selectedWorkspaceId: workspaceCtx.selectedWorkspaceId,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (['database', 'object-storage', 'monitoring', 'extensions'].includes(panel)) {
    if (panel === 'extensions') {
      try {
        /*
         * Extensions ARE the MCP marketplace: installing one persists a real
         * McpInstall (user-scoped) that also surfaces in the MCP settings tab.
         * Legacy VIBECORE_EXTENSIONS env state is still surfaced read-only so
         * pre-MCP installs remain visible.
         */
        const [envVars, catalog, installs] = await Promise.all([
          apiRequest(request, `/projects/${projectId}/env-vars`).catch(() => ({ envVars: [] })),
          apiRequest(request, `/mcp/catalog?limit=100`).catch(() => ({ items: [] })),
          apiRequest(request, `/mcp/installs`).catch(() => ({ installs: [] })),
        ]);

        return json(
          panelEnvelope(panel, project.project, {
            ...(envVars as any),
            extensionsState: readExtensionsState(envVars),
            mcpCatalog: (catalog as any)?.items ?? [],
            mcpInstalls: (installs as any)?.installs ?? [],
          }),
        );
      } catch (error) {
        return json(panelEnvelopeError(panel, project.project, error, language));
      }
    }

    try {
      const requestedWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;

      const workspaceCtx =
        panel === 'monitoring' ? await resolvePanelWorkspace(request, projectId, requestedWorkspaceId) : undefined;

      const [dashboard, envVars, deployments, snapshots] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/deployments`),
        panel === 'database' ? apiRequest(request, `/projects/${projectId}/snapshots`) : Promise.resolve({}),
      ]);

      const workspaceId = workspaceCtx?.selectedWorkspaceId ?? (dashboard as any)?.workspace?.id ?? projectId;

      const [runtimeStatus, runtimePorts] =
        panel === 'monitoring'
          ? await Promise.all([
              apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/status`).catch(
                (error) => ({
                  error: panelErrorMessage(error, language),
                }),
              ),
              apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/ports`).catch(
                (error) => ({
                  error: panelErrorMessage(error, language),
                  ports: [],
                }),
              ),
            ])
          : [{}, { ports: [] }];

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(deployments as any),
          ...(snapshots as any),
          workspaceId,
          runtimeStatus,
          runtimePorts,
          ...(workspaceCtx
            ? {
                workspaces: workspaceCtx.workspaceList,
                primaryWorkspaceId: workspaceCtx.primaryWorkspaceId,
                activeWorkspaceId: workspaceCtx.activeWorkspaceId,
                selectedWorkspaceId: workspaceCtx.selectedWorkspaceId,
              }
            : {}),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'integrations') {
    try {
      const [dashboard, envVars, secrets, activity] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/secrets`),
        apiRequest(request, `/projects/${projectId}/activity`),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(secrets as any),
          ...(activity as any),
          integrationsState: readIntegrationsState(envVars),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'workflows') {
    try {
      const [dashboard, envVars, activity, packages, scheduled] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/activity`),
        apiRequest(request, `/projects/${projectId}/packages`).catch(() => null),

        // The REAL scheduler's view: what is armed, when it next fires, how it went.
        apiRequest(request, `/projects/${projectId}/scheduled-tasks`).catch(() => null),
      ]);

      const packageData = packages as Record<string, any> | null;
      const workflowsState = readWorkflowsState(envVars, language);
      const scheduleNow = new Date();

      /*
       * The scheduler row — not the env-var blob — is the source of truth for
       * cron/nextRunAt/lastRun once a workflow is armed. Overlay it so the panel
       * can never again show "scheduled" for something that will not run.
       */
      const scheduledTasks = ((scheduled as any)?.tasks ?? []).filter(
        (task: any) => task.kind === 'WORKFLOW' && task.workflowId != null,
      );

      /*
       * Real execution history, straight from the executor: status, exit code,
       * duration and billed compute per run. Full logs are pulled for the LATEST
       * run only — a run's log can be 256 KB, so shipping every run's output on
       * every panel read would be gratuitous.
       */
      const scheduledHistory = new Map<string, { runs: any[]; latest: any }>();

      await Promise.all(
        scheduledTasks.map(async (task: any) => {
          const runs = await apiRequest<{ runs?: any[] }>(
            request,
            `/projects/${projectId}/scheduled-tasks/${task.id}/runs`,
          )
            .then((response) => (response.runs ?? []).slice(0, 5))
            .catch(() => []);

          const latest = runs[0]
            ? await apiRequest<{ run?: any }>(
                request,
                `/projects/${projectId}/scheduled-tasks/${task.id}/runs/${runs[0].id}`,
              )
                .then((response) => response.run ?? null)
                .catch(() => null)
            : null;

          scheduledHistory.set(task.id, { runs, latest });
        }),
      );

      workflowsState.workflows = (workflowsState.workflows ?? []).map((workflow: any) => {
        const task = scheduledTasks.find((candidate: any) => Number(candidate.workflowId) === Number(workflow.id));

        if (!task) {
          return workflow;
        }

        const history = scheduledHistory.get(task.id);

        return {
          ...workflow,
          schedule: {
            ...workflow.schedule,
            enabled: task.enabled,
            cron: task.cron,
            timezone: task.timezone,
            nextRunAt: task.nextRunAt,
            lastRunAt: task.lastRunAt ?? workflow.schedule?.lastRunAt ?? null,
          },
          scheduledTaskId: task.id,
          lastScheduledStatus: task.lastStatus ?? null,
          scheduledRuns: history?.runs ?? [],
          latestScheduledRun: history?.latest ?? null,
        };
      });

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(activity as any),

          // For the "Install Packages" task type's package selector (Replit parity).
          packageManager: packageData?.packageManager ?? null,
          dependencies: packageData?.dependencies ?? [],
          workflowsState,
          scheduledTasks,
          scheduledLimits: (scheduled as any)?.limits ?? null,

          /*
           * Workflow ids whose enabled cron is due right now. Purely a UI badge —
           * the executor is the api's scheduler tick, not this loader.
           */
          scheduledWorkflowsDue: (workflowsState.workflows ?? [])
            .filter((workflow: any) => isWorkflowScheduleDue(workflow.schedule, scheduleNow))
            .map((workflow: any) => workflow.id),

          /*
           * Honesty flag: no cluster/worker scheduler is firing scheduled runs
           * yet, so an enabled cron only computes `nextRunAt` — it does NOT run
           * on its own. The panel must show scheduled runs as "manual only" and
           * must not imply a run will fire at nextRunAt. Flip to true once the
           * worker-cron executor lands.
           */
          scheduledExecutionEnabled: false,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'security') {
    try {
      const [dashboard, envVars, activity] = await Promise.all([
        apiRequest<any>(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/activity`),
      ]);

      /*
       * The loader is a GET and must be side-effect-free. Scheduled scans run shell
       * commands in the workspace and mutate project env-vars, so they are triggered
       * from the action (POST) path, never from a plain panel read/navigation.
       */
      const securityState = readSecurityState(envVars, language);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(activity as any),
          securityState,
          scheduledScanDue: isSecurityScheduleDue(securityState, new Date()),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'settings') {
    try {
      const [settings, account, sessions, envVars, secrets, aiUsage, organizations] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/settings`),
        apiRequest(request, '/auth/me').catch((error) => ({ error: panelErrorMessage(error, language) })),
        apiRequest(request, '/auth/sessions').catch((error) => ({
          error: panelErrorMessage(error, language),
          sessions: [],
        })),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/secrets`),
        apiRequest(request, '/ai/usage').catch((error) => ({
          error: panelErrorMessage(error, language),
          usage: [],
        })),
        apiRequest(request, '/orgs').catch((error) => ({
          error: panelErrorMessage(error, language),
          organizations: [],
        })),
      ]);

      const orgs = (organizations as any)?.organizations ?? [];
      const projectOrgId = (project.project as any)?.organizationId;
      const billingOrg = orgs.find((o: any) => o?.id === projectOrgId) ?? orgs[0];

      const billing = billingOrg?.id
        ? await apiRequest(request, `/orgs/${billingOrg.id}/billing`).catch((error) => ({
            error: panelErrorMessage(error, language),
          }))
        : { error: copy['apiRuntime.panel.billingOrganizationMissing'] };

      return json(
        panelEnvelope(panel, project.project, {
          ...(settings as any),
          account,
          sessions,
          envVars: (envVars as any)?.envVars ?? [],
          secrets: (secrets as any)?.secrets ?? [],
          aiUsage,
          organizations,
          billing,
          settingsState: readIdeSettingsState(envVars),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'terminal') {
    try {
      const requestedWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;
      const workspaceCtx = await resolvePanelWorkspace(request, projectId, requestedWorkspaceId);

      const [dashboard, envVars, secrets, activity] = await Promise.all([
        apiRequest<any>(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/secrets`),
        apiRequest(request, `/projects/${projectId}/activity`),
      ]);

      const workspaceId = workspaceCtx.selectedWorkspaceId ?? dashboard?.workspace?.id ?? projectId;

      const [runtimeStatus, runtimeFiles, runtimeProcesses, runtimePorts] = await Promise.all([
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/status`).catch((error) => ({
          error: panelErrorMessage(error, language),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/files`).catch((error) => ({
          error: panelErrorMessage(error, language),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes`).catch((error) => ({
          error: panelErrorMessage(error, language),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/ports`).catch((error) => ({
          error: panelErrorMessage(error, language),
        })),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(secrets as any),
          ...(activity as any),
          workspaceId,
          runtimeStatus,
          runtimeFiles,
          runtimeProcesses,
          runtimePorts,
          terminalState: readTerminalState(envVars, language),
          workspaces: workspaceCtx.workspaceList,
          primaryWorkspaceId: workspaceCtx.primaryWorkspaceId,
          activeWorkspaceId: workspaceCtx.activeWorkspaceId,
          selectedWorkspaceId: workspaceCtx.selectedWorkspaceId,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'logs') {
    try {
      const requestedWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;
      const workspaceCtx = await resolvePanelWorkspace(request, projectId, requestedWorkspaceId);

      const [dashboard, activity, deployments] = await Promise.all([
        apiRequest<any>(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/activity`),
        apiRequest(request, `/projects/${projectId}/deployments`),
      ]);

      const workspaceId = workspaceCtx.selectedWorkspaceId ?? dashboard?.workspace?.id ?? projectId;

      const [runtimeStatus, runtimeProcesses, runtimePorts, runtimeLogs] = await Promise.all([
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/status`).catch((error) => ({
          error: panelErrorMessage(error, language),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes`).catch((error) => ({
          error: panelErrorMessage(error, language),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/ports`).catch((error) => ({
          error: panelErrorMessage(error, language),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/logs/snapshot`).catch(
          (error) => ({
            error: panelErrorMessage(error, language),
            logs: [],
          }),
        ),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(activity as any),
          ...(deployments as any),
          workspaceId,
          runtimeStatus,
          runtimeProcesses,
          runtimePorts,
          runtimeLogs,
          workspaces: workspaceCtx.workspaceList,
          primaryWorkspaceId: workspaceCtx.primaryWorkspaceId,
          activeWorkspaceId: workspaceCtx.activeWorkspaceId,
          selectedWorkspaceId: workspaceCtx.selectedWorkspaceId,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'studio') {
    /*
     * Agent Studio supervisor — a read-only oversight surface that aggregates
     * the project's existing agent signals into one envelope. Both reads are
     * project-read gated server-side (requireProject 'projects:read'), so this
     * never leaks another tenant's agent data. Each enrichment is best-effort:
     * a missing signal degrades to an empty list rather than failing the panel.
     * Conversation branches + agent-memory are layered on client-side by the
     * panel component (they live in client persistence / are fetched directly).
     */
    try {
      const [proposals, repairEvents, consensus] = await Promise.all([
        apiRequest<{ proposals?: unknown[] }>(request, `/projects/${projectId}/agent-patch-proposals`).catch(() => ({
          proposals: [],
        })),
        apiRequest<{ events?: unknown[] }>(request, `/projects/${projectId}/agent-repair-events?limit=50`).catch(
          () => ({
            events: [],
          }),
        ),
        apiRequest<{ records?: unknown[] }>(request, `/projects/${projectId}/agent-consensus?limit=50`).catch(() => ({
          records: [],
        })),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          patchProposals: Array.isArray(proposals.proposals) ? proposals.proposals : [],
          repairEvents: Array.isArray(repairEvents.events) ? repairEvents.events : [],
          consensusRecords: Array.isArray(consensus.records) ? consensus.records : [],
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  if (panel === 'skills') {
    /*
     * Skills panel (F#27): builtin catalog toggles PLUS the installable
     * GitHub-repo catalog and the project- and workspace-scoped installed skills.
     * Each source fails open so one 5xx never blanks the whole panel. The
     * workspace-scoped installed list 409s (SKILL_NO_WORKSPACE) until the project
     * has a workspace — degrade that to an empty list.
     */
    try {
      const [skillsResp, catalogResp, installedProjectResp, installedWorkspaceResp, auditResp] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/skills`).catch(() => ({ skills: [] })),
        apiRequest(request, `/projects/${projectId}/skills/catalog`).catch(() => ({
          entries: [],
          hasWorkspace: false,
        })),
        apiRequest(request, `/projects/${projectId}/skills/installed?scope=project`).catch(() => ({ skills: [] })),
        apiRequest(request, `/projects/${projectId}/skills/installed?scope=workspace`).catch(() => ({ skills: [] })),

        // RPL-SK-001.3 — the audit journal for the project scope (fails open to []).
        apiRequest(request, `/projects/${projectId}/skills/audit?scope=project`).catch(() => ({ events: [] })),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          skills: (skillsResp as any)?.skills ?? [],
          catalog: (catalogResp as any)?.entries ?? [],
          hasWorkspace: Boolean((catalogResp as any)?.hasWorkspace),
          installedProject: (installedProjectResp as any)?.skills ?? [],
          installedWorkspace: (installedWorkspaceResp as any)?.skills ?? [],
          auditEvents: (auditResp as any)?.events ?? [],
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error, language));
    }
  }

  const endpoint = panelEndpoints[panel];

  if (!endpoint) {
    throw json({ error: copy['apiRuntime.panel.unsupportedPanel'], code: 'UNSUPPORTED_PANEL' }, { status: 404 });
  }

  try {
    const data = await apiRequest(request, endpoint(projectId));

    return json(panelEnvelope(panel, project.project, data));
  } catch (error) {
    return json(panelEnvelopeError(panel, project.project, error, language));
  }
}

/*
 * Object Storage (GCS) is flag-gated (OBJECT_STORAGE_ENABLED): every internal
 * route 404s with code FEATURE_NOT_ENABLED while the flag is off. Translate that
 * into a structured `{ enabled: false }` payload so the IDE panel can render a
 * clear "not enabled" state instead of a 502; any other error is re-thrown.
 */
async function objectStorageResultOrDisabled(error: unknown): Promise<ReturnType<typeof json>> {
  if (error instanceof Response && error.status === 404) {
    const payload = (await error
      .clone()
      .json()
      .catch(() => ({}))) as { code?: string };

    if (payload.code === 'FEATURE_NOT_ENABLED' || payload.code === undefined) {
      return json({ enabled: false, objects: [], folders: [] });
    }
  }

  throw error;
}

async function actionHandler({ request, params }: EnterpriseActionArgs) {
  const language = resolveRequestLocale(request).language;
  const copy = getApiRuntimeRoutesCopy(language);
  const projectId = params.projectId;
  const panel = params.panel;

  if (!projectId || !panel) {
    throw json({ error: copy['apiRuntime.panel.panelNotFound'], code: 'PANEL_NOT_FOUND' }, { status: 404 });
  }

  /*
   * Accept BOTH form-encoded (the in-app panels submit that) and JSON (API
   * clients / scripts). Previously this called request.formData() unconditionally,
   * so a JSON body threw a raw TypeError and surfaced as an opaque 500. Detect the
   * content type, and on any parse failure return a clear 400 instead of a 500.
   */
  let body: Record<string, string>;

  try {
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      body = ((await request.json()) ?? {}) as Record<string, string>;
    } else {
      body = formObject(await request.formData()) as Record<string, string>;
    }
  } catch {
    throw json({ error: copy['apiRuntime.panel.invalidBody'], code: 'INVALID_REQUEST_BODY' }, { status: 400 });
  }

  const intent = body.intent ?? 'default';

  if (panel === 'snapshots') {
    if (intent === 'restore') {
      // Validate the id so a missing field never builds `/snapshots/undefined/restore`.
      const snapshotId = (body.snapshotId ?? '').trim();

      if (!snapshotId) {
        throw json({ error: copy['apiRuntime.panel.snapshotRequired'], code: 'SNAPSHOT_REQUIRED' }, { status: 400 });
      }

      await apiRequest(request, `/projects/${projectId}/snapshots/${encodeURIComponent(snapshotId)}/restore`, {
        method: 'POST',
      });

      /*
       * The rollback modal's "Database" checkbox posts `restoreDatabase`. The
       * file restore above rewinds project storage + the workspace tree only;
       * when the user explicitly asked for the database too, drive the real
       * point-in-time restore (POST /projects/:id/database/restores) with the
       * same snapshot. Surface its outcome so a checked box never silently
       * leaves the database un-rolled-back.
       */
      let databaseOutcome: DatabaseRestoreOutcome = { kind: 'skipped' };

      if (shouldRestoreDatabase(body.restoreDatabase)) {
        try {
          const restore = await apiRequest(request, `/projects/${projectId}/database/restores`, {
            method: 'POST',
            body: JSON.stringify({ snapshotId }),
          });

          databaseOutcome = { kind: 'restored', restore };
        } catch (error) {
          if (error instanceof Response) {
            const payload = (await error
              .clone()
              .json()
              .catch(() => ({}))) as { code?: string; error?: string };

            databaseOutcome = classifyDatabaseRestoreError(
              {
                status: error.status,
                code: payload.code,
                message: payload.error ?? 'DATABASE_RESTORE_FAILED',
              },
              language,
            );
          } else {
            console.error('Database restore failed:', error);
            databaseOutcome = {
              kind: 'failed',
              status: 502,
              message: copy['apiRuntime.snapshot.failed'],
            };
          }
        }
      }

      return json(foldRestoreResponse(databaseOutcome));
    } else {
      await apiRequest(request, `/projects/${projectId}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({
          label: body.label || copy['apiRuntime.panel.manualCheckpoint'],
          kind: 'manual',
          manifest: {},
        }),
      });
    }
  } else if (panel === 'deployments') {
    if (intent === 'cancel' || intent === 'redeploy' || intent === 'rollback') {
      // Validate the id so a missing field never builds `/deployments/undefined/<action>`.
      const deploymentId = (body.deploymentId ?? '').trim();

      if (!deploymentId) {
        throw json(
          {
            error: formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.deploymentRequired'], { action: intent }),
            code: 'DEPLOYMENT_REQUIRED',
          },
          { status: 400 },
        );
      }

      await apiRequest(request, `/projects/${projectId}/deployments/${encodeURIComponent(deploymentId)}/${intent}`, {
        method: 'POST',
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/deployments`, {
        method: 'POST',
        body: JSON.stringify({
          provider: body.provider || 'static',
          environment: body.environment || 'preview',
          buildCommand: body.buildCommand || 'npm run build',
          outputDirectory: body.outputDirectory || 'dist',
          framework: body.framework || undefined,
          branch: body.branch || undefined,
          commitSha: body.commitSha || undefined,
          customDomain: body.customDomain || undefined,
          previewDeployment: body.previewDeployment === 'on',
          workspaceId: body.workspaceId || undefined,
          envVars: parseEnvVars(body.envVars ?? ''),
          injectSecrets: (body.injectSecrets ?? '')
            .split(',')
            .map((secret) => secret.trim())
            .filter(Boolean),
          githubIntegration: body.repositoryUrl
            ? { repositoryUrl: body.repositoryUrl, branch: body.branch || undefined }
            : undefined,
        }),
      });
    }
  } else if (panel === 'env') {
    // scope is optional; the API defaults it to production for pre-scope clients.
    const scope = normalizeEnvScope(body.scope);

    if (intent === 'delete') {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'DELETE',
        body: JSON.stringify({ key: body.key, ...(scope ? { scope } : {}) }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key, value: body.value ?? '', ...(scope ? { scope } : {}) }),
      });
    }
  } else if (panel === 'secrets') {
    if (intent === 'delete') {
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: body.key }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
      });
    }
  } else if (panel === 'debugger') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const dashboard = await apiRequest<any>(request, `/projects/${projectId}/dashboard`).catch(() => null);
    const workspaceId = dashboard?.workspace?.id ?? projectId;
    const state = readDebuggerState(envVars, language);
    const now = new Date().toISOString();

    if (intent === 'save-config') {
      const config = normalizeLaunchConfig(
        {
          id: body.configId || randomUUID(),
          name: body.name,
          type: body.type,
          request: body.request,
          command: body.command,
          program: body.program,
          cwd: body.cwd,
          args: parseDebugArgs(body.args ?? ''),
          env: parseEnvVars(body.env ?? ''),
          stopOnEntry: body.stopOnEntry === 'true',
        },
        language,
      );
      state.launchConfigs = [
        config,
        ...state.launchConfigs.filter((candidate: any) => candidate.id !== config.id),
      ].slice(0, 20);
    } else if (intent === 'delete-config') {
      state.launchConfigs = state.launchConfigs.filter((config: any) => config.id !== body.configId);
    } else if (intent === 'add-breakpoint') {
      const breakpoint = normalizeBreakpoint({
        id: body.breakpointId || randomUUID(),
        filePath: body.filePath,
        line: Number(body.line),
        column: body.column ? Number(body.column) : undefined,
        enabled: body.enabled !== 'false',
        condition: body.condition,
        hitCondition: body.hitCondition,
        logMessage: body.logMessage,
      });
      state.breakpoints = [
        breakpoint,
        ...state.breakpoints.filter((candidate: any) => candidate.id !== breakpoint.id),
      ].slice(0, 200);
    } else if (intent === 'toggle-breakpoint') {
      state.breakpoints = state.breakpoints.map((breakpoint: any) =>
        breakpoint.id === body.breakpointId ? { ...breakpoint, enabled: body.enabled === 'true' } : breakpoint,
      );
    } else if (intent === 'delete-breakpoint') {
      state.breakpoints = state.breakpoints.filter((breakpoint: any) => breakpoint.id !== body.breakpointId);
    } else if (intent === 'add-watch') {
      const watch = normalizeWatchExpression({
        id: body.watchId || randomUUID(),
        expression: body.expression,
        enabled: body.enabled !== 'false',
      });
      state.watches = [watch, ...state.watches.filter((candidate: any) => candidate.id !== watch.id)].slice(0, 80);
    } else if (intent === 'delete-watch') {
      state.watches = state.watches.filter((watch: any) => watch.id !== body.watchId);
    } else if (intent === 'start-session') {
      const config =
        state.launchConfigs.find((candidate: any) => candidate.id === body.configId) ?? state.launchConfigs[0];

      if (!config) {
        throw json(
          { error: copy['apiRuntime.panel.debugConfigurationRequired'], code: 'DEBUG_CONFIGURATION_REQUIRED' },
          { status: 400 },
        );
      }

      const sessionId = randomUUID();
      const command = buildDebugLaunchCommand(config, language);
      const wrapper = `mkdir -p .vibecore/debug && nohup sh -lc ${shellQuote(command)} > .vibecore/debug/${sessionId}.log 2>&1 & echo $!`;

      const result = await apiRequest<{ output?: string; exitCode?: number }>(
        request,
        `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/commands`,
        {
          method: 'POST',
          body: JSON.stringify({ command: 'sh', args: ['-lc', wrapper], timeoutMs: 15_000 }),
        },
      );
      const processId =
        String(result.output ?? '')
          .trim()
          .split(/\s+/)
          .pop() || undefined;

      state.sessions = [
        {
          id: sessionId,
          configId: config.id,
          name: config.name,
          status: result.exitCode && result.exitCode !== 0 ? 'failed' : 'running',
          adapter: 'runtime-command',
          command,
          workspaceId,
          processId,
          startedAt: now,
          updatedAt: now,
          callStack: [],
          variables: [],
          lastOutput: result.output ?? '',
        },
        ...state.sessions,
      ].slice(0, 20);
    } else if (intent === 'stop-session') {
      const session = state.sessions.find((candidate: any) => candidate.id === body.sessionId);

      if (session?.processId) {
        await apiRequest(
          request,
          `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes/${encodeURIComponent(session.processId)}/kill`,
          { method: 'POST' },
        ).catch(() => undefined);
      }

      state.sessions = state.sessions.map((candidate: any) =>
        candidate.id === body.sessionId
          ? { ...candidate, status: 'stopped', stoppedAt: now, updatedAt: now, lastAction: 'stop' }
          : candidate,
      );
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({
        key: DEBUGGER_STATE_ENV_KEY,
        value: JSON.stringify(normalizeDebuggerState(state, language)),
      }),
    });
  } else if (panel === 'collaborators') {
    if (intent === 'comment') {
      await apiRequest(request, `/projects/${projectId}/collaboration/comments`, {
        method: 'POST',
        body: JSON.stringify({
          filePath: body.filePath || undefined,
          line: body.line || undefined,
          body: body.body,
        }),
      });
    } else if (intent === 'share-link') {
      const created = await apiRequest<{ shareLink?: Record<string, unknown>; token?: string }>(
        request,
        `/projects/${projectId}/collaboration/share-links`,
        {
          method: 'POST',
          body: JSON.stringify({
            roleKey: body.roleKey || 'viewer',
            expiresInMinutes: body.expiresInMinutes || 1440,
          }),
        },
      );

      /*
       * The API returns the raw token exactly once (only its hash is persisted, so it can never be
       * listed again). Build the redeemable /projects/share/<token> URL (handled by
       * app/routes/projects.share.$token.tsx → GET /collaboration/share-links/:token) and hand it
       * back so the IDE can show it. NB: /share/<token> is the *chat*-share viewer — a project share
       * token has no HMAC signature and would 404 there.
       */
      const shareUrl = created.token
        ? new URL(`/projects/share/${created.token}`, new URL(request.url).origin).toString()
        : undefined;

      return json({ ok: true, shareLink: { ...(created.shareLink ?? {}), token: created.token, url: shareUrl } });
    } else if (intent === 'terminal-permission') {
      await apiRequest(request, `/projects/${projectId}/collaboration/terminal-permissions`, {
        method: 'POST',
        body: JSON.stringify({ userId: body.userId, allowed: body.allowed === 'true' }),
      });
    } else if (intent === 'ai-sharing') {
      await apiRequest(request, `/projects/${projectId}/collaboration/ai-conversation`, {
        method: 'POST',
        body: JSON.stringify({ shared: body.shared === 'true', mode: body.mode || 'comment' }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/collaborators`, {
        method: 'POST',

        /*
         * Accept either an email (what users actually know) or a raw user id;
         * the API resolves the email to a user server-side.
         */
        body: JSON.stringify({ userId: body.userId, email: body.email, roleKey: body.roleKey ?? 'member' }),
      });
    }
  } else if (panel === 'domains') {
    const project = await apiRequest<{ project: any }>(request, `/projects/${projectId}`).catch(() => ({
      project: undefined,
    }));

    const organizationId = project.project?.organizationId;

    if (!organizationId) {
      return json(
        { error: copy['apiRuntime.panel.domainsOrganizationMissing'], code: 'PROJECT_ORGANIZATION_REQUIRED' },
        {
          status: 400,
        },
      );
    }

    if (intent === 'verify') {
      await apiRequest(request, `/orgs/${organizationId}/domains/${encodeURIComponent(body.domain ?? '')}/verify`, {
        method: 'POST',
      });
    } else if (intent === 'configure') {
      await apiRequest(request, `/orgs/${organizationId}/domains/${encodeURIComponent(body.domain ?? '')}`, {
        method: 'PATCH',
        body: JSON.stringify({
          redirectWww: body.redirectWww === 'true',
          wildcardEnabled: body.wildcardEnabled === 'true',
        }),
      });
    } else {
      await apiRequest(request, `/orgs/${organizationId}/domains`, {
        method: 'POST',
        body: JSON.stringify({
          domain: body.domain,
          redirectWww: true,
          wildcardEnabled: false,
        }),
      });
    }
  } else if (panel === 'settings') {
    if (intent === 'profile') {
      await apiRequest(request, '/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: body.name,
          email: body.email || undefined,
          timezone: body.timezone || undefined,
        }),
      });
    } else if (intent === 'change-password') {
      await apiRequest(request, '/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: body.currentPassword, newPassword: body.newPassword }),
      });
    } else if (intent === 'logout-all') {
      await apiRequest(request, '/auth/logout-all', { method: 'POST' });
    } else if (intent === 'revoke-session') {
      await apiRequest(request, `/auth/sessions/${encodeURIComponent(body.sessionId ?? '')}`, { method: 'DELETE' });
    } else if (intent === 'send-verification') {
      await apiRequest(request, '/auth/send-verification', { method: 'POST' });
    } else if (intent === 'delete-account') {
      await apiRequest(request, '/auth/me', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: body.confirmation }),
      });
      return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
    } else if (
      intent === 'preferences' ||
      intent === 'keybindings' ||
      intent === 'notification' ||
      intent === 'ai-credential-mode' ||
      intent === 'ai-routing'
    ) {
      const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
      const state = readIdeSettingsState(envVars);

      if (intent === 'preferences') {
        state.preferences = {
          ...state.preferences,
          theme: body.theme === 'light' ? 'light' : body.theme === 'system' ? 'system' : 'dark',
          keyboardMode: body.keyboardMode === 'true',
          creditAlertThreshold: Number(body.creditAlertThreshold) || state.preferences.creditAlertThreshold,
        };
      } else if (intent === 'keybindings') {
        const keybindingValues = Object.fromEntries(
          Object.entries(body)
            .filter(([key]) => key.startsWith('keybinding:'))
            .map(([key, value]) => [key.slice('keybinding:'.length), value]),
        );

        state.keybindings = {
          overrides: serializeKeybindingOverrides(defaultProjectKeybindings, keybindingValues),
        };
      } else if (intent === 'notification') {
        const key = body.key;

        if (key && Object.prototype.hasOwnProperty.call(state.notifications, key)) {
          state.notifications = { ...state.notifications, [key]: body.enabled === 'true' };
        }
      } else if (intent === 'ai-credential-mode') {
        const provider = body.provider;

        if (provider && SETTINGS_BYOK_SECRET_KEY_MAP[provider]) {
          state.aiCredentials = {
            ...state.aiCredentials,
            [provider]: {
              ...(state.aiCredentials[provider] ?? {}),
              mode: body.mode === 'byok' ? 'byok' : 'managed',
            },
          };
        }
      } else {
        const supportedProviders = Object.keys(SETTINGS_BYOK_SECRET_KEY_MAP);
        const defaultProvider = supportedProviders.includes(body.defaultProvider) ? body.defaultProvider : 'openai';

        const fallbackProvider =
          supportedProviders.includes(body.fallbackProvider) && body.fallbackProvider !== defaultProvider
            ? body.fallbackProvider
            : 'openrouter';

        const model = typeof body.defaultModel === 'string' ? body.defaultModel.trim().slice(0, 120) : '';

        state.aiRouting = {
          defaultProvider,
          defaultModel: model || `${defaultProvider}:managed-default`,
          fallbackProvider,
          fallbackEnabled: body.fallbackEnabled === 'true',
        };
      }

      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({
          key: IDE_SETTINGS_STATE_ENV_KEY,
          value: JSON.stringify(normalizeIdeSettingsState(state)),
        }),
      });
    } else if (intent === 'save-ai-key') {
      const provider = body.provider;
      const secretKey = provider ? SETTINGS_BYOK_SECRET_KEY_MAP[provider] : undefined;

      if (!secretKey) {
        throw json(
          { error: copy['apiRuntime.panel.unsupportedAiProvider'], code: 'UNSUPPORTED_AI_PROVIDER' },
          { status: 400 },
        );
      }

      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: secretKey, value: body.apiKey ?? '' }),
      });

      const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
      const state = readIdeSettingsState(envVars);
      state.aiCredentials = {
        ...state.aiCredentials,
        [provider]: { ...(state.aiCredentials[provider] ?? {}), mode: 'byok' },
      };
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({
          key: IDE_SETTINGS_STATE_ENV_KEY,
          value: JSON.stringify(normalizeIdeSettingsState(state)),
        }),
      });
    } else if (intent === 'delete-ai-key') {
      const provider = body.provider;
      const secretKey = provider ? SETTINGS_BYOK_SECRET_KEY_MAP[provider] : undefined;

      if (!secretKey) {
        throw json(
          { error: copy['apiRuntime.panel.unsupportedAiProvider'], code: 'UNSUPPORTED_AI_PROVIDER' },
          { status: 400 },
        );
      }

      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: secretKey }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: body.name,
          description: body.description,
          gitRepositoryUrl: body.gitRepositoryUrl || undefined,
          gitDefaultBranch: body.gitDefaultBranch || undefined,
        }),
      });
    }
  } else if (panel === 'database') {
    if (intent === 'create-backup') {
      await apiRequest(request, `/projects/${projectId}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({
          label:
            body.label ||
            formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.databaseBackupName'], {
              timestamp: new Date().toISOString(),
            }),
          kind: 'manual',
          manifest: { scope: 'database', source: 'mobile-ide' },
        }),
      });
    } else if (intent === 'restore-backup') {
      /*
       * Validate + encode the id (matching the 'snapshots' panel restore) so a
       * missing/`/`-bearing value can't build `/snapshots//restore` or alter the path.
       */
      const snapshotId = (body.snapshotId ?? '').trim();

      if (!snapshotId) {
        throw json(
          { error: copy['apiRuntime.panel.backupSnapshotRequired'], code: 'BACKUP_SNAPSHOT_REQUIRED' },
          { status: 400 },
        );
      }

      await apiRequest(request, `/projects/${projectId}/snapshots/${encodeURIComponent(snapshotId)}/restore`, {
        method: 'POST',
      });
    } else if (intent === 'query') {
      /*
       * redirectOn401:false — a failed SQL run must surface as a panel error, NEVER
       * eject the user to /login (which bounced them out of the Database panel to
       * /dashboard). This is a fetcher action serving an IDE panel, not a page load.
       */
      const queryResult = await apiRequest(request, `/projects/${projectId}/databases/query`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({
          key: body.connectionKey,
          query: body.query,
          collection: body.collection || undefined,
          limit: body.limit ? Number(body.limit) : undefined,
        }),
      });

      return json({ ok: true, ...(queryResult as any) });
    } else if (intent === 'provision') {
      // Provision a managed CNPG database for this project (the button-wired path).
      const provisioned = await apiRequest(request, `/projects/${projectId}/database/provision`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ environment: body.environment || undefined }),
      });

      return json({ ok: true, ...(provisioned as any) });
    } else if (intent === 'upsert-secret') {
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
      });
    } else if (intent === 'delete-secret') {
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: body.key }),
      });
    } else if (intent === 'delete-env') {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'DELETE',
        body: JSON.stringify({ key: body.key }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key || 'DATABASE_URL', value: body.value ?? '' }),
      });
    }
  } else if (panel === 'ports') {
    /*
     * Persist the primary port + per-port public/private visibility to
     * VIBECORE_PORTS_STATE (the runtime detects the ports; this is the config).
     */
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`).catch(() => ({ envVars: [] }));
    const state = readPortsState(envVars);
    const port = Number.parseInt(body.port ?? '', 10);

    if (Number.isFinite(port)) {
      if (intent === 'set-primary') {
        state.primaryPort = port;
      } else if (intent === 'set-visibility') {
        state.visibility[String(port)] = body.visibility === 'private' ? 'private' : 'public';
      }
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: PORTS_STATE_ENV_KEY, value: JSON.stringify(state) }),
    });
  } else if (panel === 'object-storage') {
    if (intent === 'status') {
      /*
       * Per-project provisioning status. 404 (flag off) => not enabled; on =>
       * { enabled, provisioned } so the panel can offer the "Enable" CTA.
       */
      try {
        const result = await apiRequest(request, `/projects/${projectId}/object-storage/status`);
        return json({ enabled: true, provisioned: false, ...(result as any) });
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          return json({ enabled: false, provisioned: false });
        }

        throw error;
      }
    } else if (intent === 'list') {
      const search = new URLSearchParams({ delimiter: '/' });

      if (body.prefix) {
        search.set('prefix', body.prefix);
      }

      try {
        const result = await apiRequest(request, `/projects/${projectId}/object-storage/objects?${search.toString()}`);
        return json({ enabled: true, ...(result as any) });
      } catch (error) {
        return objectStorageResultOrDisabled(error);
      }
    } else if (intent === 'ensure-bucket') {
      try {
        const result = await apiRequest(request, `/projects/${projectId}/object-storage/bucket`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        return json({ enabled: true, ok: true, ...(result as any) });
      } catch (error) {
        return objectStorageResultOrDisabled(error);
      }
    } else if (intent === 'delete-bucket') {
      try {
        const result = await apiRequest(request, `/projects/${projectId}/object-storage/bucket`, {
          method: 'DELETE',
        });
        return json({ enabled: true, ok: true, ...(result as any) });
      } catch (error) {
        return objectStorageResultOrDisabled(error);
      }
    } else if (intent === 'upload-url') {
      const key = (body.key ?? '').trim();

      if (!key) {
        throw json({ error: copy['apiRuntime.panel.uploadKeyRequired'] }, { status: 400 });
      }

      try {
        const result = await apiRequest(request, `/projects/${projectId}/object-storage/objects/upload-url`, {
          method: 'POST',
          body: JSON.stringify({ key, contentType: body.contentType || undefined }),
        });
        return json({ enabled: true, ...(result as any) });
      } catch (error) {
        return objectStorageResultOrDisabled(error);
      }
    } else if (intent === 'download-url') {
      const key = (body.key ?? '').trim();

      if (!key) {
        throw json(
          { error: copy['apiRuntime.panel.downloadKeyRequired'], code: 'OBJECT_KEY_REQUIRED' },
          { status: 400 },
        );
      }

      try {
        const result = await apiRequest(
          request,
          `/projects/${projectId}/object-storage/objects/download-url?key=${encodeURIComponent(key)}`,
        );
        return json({ enabled: true, ...(result as any) });
      } catch (error) {
        return objectStorageResultOrDisabled(error);
      }
    } else if (intent === 'move') {
      const from = (body.from ?? '').trim();
      const to = (body.to ?? '').trim();

      if (!from || !to) {
        throw json({ error: copy['apiRuntime.panel.movePathsRequired'], code: 'MOVE_PATHS_REQUIRED' }, { status: 400 });
      }

      try {
        const result = await apiRequest(request, `/projects/${projectId}/object-storage/objects/move`, {
          method: 'POST',
          body: JSON.stringify({ from, to }),
        });
        return json({ enabled: true, ok: true, ...(result as any) });
      } catch (error) {
        return objectStorageResultOrDisabled(error);
      }
    } else if (intent === 'delete-object') {
      const payload = body.prefix ? { prefix: body.prefix } : { key: (body.key ?? '').trim() };

      if (!('prefix' in payload ? payload.prefix : payload.key)) {
        throw json(
          { error: copy['apiRuntime.panel.deleteKeyRequired'], code: 'OBJECT_KEY_OR_PREFIX_REQUIRED' },
          { status: 400 },
        );
      }

      try {
        const result = await apiRequest(request, `/projects/${projectId}/object-storage/objects`, {
          method: 'DELETE',
          body: JSON.stringify(payload),
        });
        return json({ enabled: true, ok: true, ...(result as any) });
      } catch (error) {
        return objectStorageResultOrDisabled(error);
      }
    } else if (intent === 'export') {
      await apiRequest(request, `/projects/${projectId}/export/zip`);
    } else {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key || 'OBJECT_STORAGE_BUCKET', value: body.value ?? '' }),
      });
    }
  } else if (panel === 'skills') {
    /*
     * F#27: installable GitHub-repo skills. `install`/`uninstall`/
     * `enable-installed`/`disable-installed` operate on the InstalledSkill store
     * (project- or workspace-scoped); the legacy `enable`/`disable` intents still
     * toggle the builtin catalog. Errors bubble as the API's status/code so the
     * panel can surface a clear message (e.g. SKILL_REPO_PRIVATE, SKILL_NO_WORKSPACE).
     */
    if (['install', 'uninstall', 'enable-installed', 'disable-installed', 'revoke', 'approve'].includes(intent)) {
      const ownerRepo = (body.ownerRepo ?? '').trim();
      const scope = body.scope === 'workspace' ? 'workspace' : 'project';

      if (!ownerRepo) {
        throw json(
          { error: copy['apiRuntime.panel.repositoryRequired'], code: 'REPOSITORY_REQUIRED' },
          { status: 400 },
        );
      }

      if (intent === 'install') {
        const result = await apiRequest(request, `/projects/${projectId}/skills/install`, {
          method: 'POST',
          body: JSON.stringify({ ownerRepo, scope }),
        });

        return json({ ok: true, ...(result as any) });
      }

      if (intent === 'uninstall') {
        const result = await apiRequest(request, `/projects/${projectId}/skills/installed`, {
          method: 'DELETE',
          body: JSON.stringify({ ownerRepo, scope }),
        });

        return json({ ok: true, ...(result as any) });
      }

      // RPL-SK-001.4 revoke + RPL-SK-001.3 approve.
      if (intent === 'revoke') {
        const result = await apiRequest(request, `/projects/${projectId}/skills/installed/revoke`, {
          method: 'POST',
          body: JSON.stringify({ ownerRepo, scope, reason: (body.reason ?? '').trim() || undefined }),
        });

        return json({ ok: true, ...(result as any) });
      }

      if (intent === 'approve') {
        const result = await apiRequest(request, `/projects/${projectId}/skills/installed/approve`, {
          method: 'POST',
          body: JSON.stringify({ ownerRepo, scope }),
        });

        return json({ ok: true, ...(result as any) });
      }

      const result = await apiRequest(request, `/projects/${projectId}/skills/installed`, {
        method: 'PATCH',
        body: JSON.stringify({ ownerRepo, scope, enabled: intent === 'enable-installed' }),
      });

      return json({ ok: true, ...(result as any) });
    }

    // Per-project skills registry: enable/disable toggles over the builtin catalog.
    const skillId = (body.skillId ?? '').trim();

    if (!skillId) {
      throw json({ error: copy['apiRuntime.panel.skillRequired'], code: 'SKILL_REQUIRED' }, { status: 400 });
    }

    const action = intent === 'disable' ? 'disable' : 'enable';

    const result = await apiRequest(request, `/projects/${projectId}/skills/${encodeURIComponent(skillId)}/${action}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    return json({ ok: true, rowId: skillId, ...(result as any) });
  } else if (panel === 'packages') {
    const [packages, envVars] = await Promise.all([
      apiRequest<any>(request, `/projects/${projectId}/packages`),
      apiRequest(request, `/projects/${projectId}/env-vars`),
    ]);

    const packageManager = normalizePackageManager(body.packageManager || packages.packageManager);
    const packageNames = parsePackageList(body.packages ?? '');
    const workspaceId = packages?.workspace?.id ?? projectId;
    const state = readPackagesState(envVars);
    const now = new Date().toISOString();
    const isInstall = intent === 'install-package' || intent === 'install-all';

    /*
     * Installs go through the dedicated first-class endpoint
     * POST /projects/:projectId/packages/install, which validates each package
     * spec, builds the install argv server-side (no shell-string interpolation),
     * and dispatches it through the SAME per-project runtime shell-exec the
     * terminal uses — scoped to this project's own workspace pod. Audit/outdated
     * are not installs, so they keep the generic terminal-command path.
     */
    const run = isInstall
      ? await runPackageInstall(request, projectId, {
          packageManager,
          packages: packageNames,
          dev: body.devDependency === 'true',
          name: packageRunName(intent, packageManager, language),
          startedAt: now,
          language,

          // Same pod audit/outdated target below — see runPackageInstall.workspaceId.
          workspaceId: packages?.workspace?.id ?? body.workspaceId?.trim() ?? undefined,
        })
      : await runTerminalCommand(
          request,
          workspaceId,
          packagePanelCommand(
            { intent, packageManager, packages: packageNames, dev: body.devDependency === 'true' },
            language,
          ),
          packageRunName(intent, packageManager, language),
          now,
          language,
        );

    state.runs.unshift({
      ...run,
      output: run.output ? run.output.slice(-4000) : '',
      intent,
      packageManager,
      packages: packageNames,
      devDependency: body.devDependency === 'true',
    });
    state.runs = state.runs.slice(0, 12);

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: PACKAGES_STATE_ENV_KEY, value: JSON.stringify(normalizePackagesState(state)) }),
    });
  } else if (panel === 'extensions') {
    /*
     * Extensions are MCP marketplace servers. Each action maps to a real
     * McpInstall mutation so the result is visible here AND in the MCP tab.
     */
    const action = body.extensionAction ?? 'install';

    if (action === 'install') {
      const slug = (body.extension ?? '').trim();

      if (!slug) {
        throw json({ error: copy['apiRuntime.panel.extensionRequired'] }, { status: 400 });
      }

      // Derive a valid alias from the slug (alphanumeric/dash/underscore, ≤64).
      const alias =
        (body.alias ?? slug)
          .toLowerCase()
          .replace(/[^a-z0-9-_]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 64) || 'mcp';

      await apiRequest(request, `/mcp/installs`, {
        method: 'POST',
        body: JSON.stringify({ catalogEntrySlug: slug, alias, config: {} }),
      });
    } else if (action === 'remove') {
      const installId = (body.installId ?? '').trim();

      if (!installId) {
        throw json({ error: copy['apiRuntime.panel.installRequired'] }, { status: 400 });
      }

      await apiRequest(request, `/mcp/installs/${encodeURIComponent(installId)}`, { method: 'DELETE' });
    } else if (action === 'enable' || action === 'disable') {
      const installId = (body.installId ?? '').trim();

      if (!installId) {
        throw json({ error: copy['apiRuntime.panel.installRequired'] }, { status: 400 });
      }

      await apiRequest(request, `/mcp/installs/${encodeURIComponent(installId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: action === 'enable' }),
      });
    } else {
      throw json(
        { error: formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.unsupportedExtensionAction'], { action }) },
        { status: 400 },
      );
    }
  } else if (panel === 'integrations') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const state = readIntegrationsState(envVars);
    const now = new Date().toISOString();
    const intent = body.intent ?? 'default';

    if (intent === 'connect' || intent === 'disconnect') {
      const integrationId = body.integrationId;

      if (!integrationId) {
        throw json(
          { error: copy['apiRuntime.panel.integrationRequired'], code: 'INTEGRATION_REQUIRED' },
          { status: 400 },
        );
      }

      state.integrations[integrationId] = {
        ...(state.integrations[integrationId] ?? {}),
        connected: intent === 'connect',
        status: intent === 'connect' ? 'active' : undefined,
        lastSync: intent === 'connect' ? now : undefined,
        config: { organization: body.organization ?? '' },
      };

      if (intent === 'connect' && body.apiToken) {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: integrationSecretKey(integrationId), value: body.apiToken }),
        });
      }

      if (intent === 'disconnect') {
        /*
         * Remove the stored integration token on disconnect — otherwise the
         * credential lingers in project secrets after the integration is gone.
         */
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'DELETE',
          body: JSON.stringify({ key: integrationSecretKey(integrationId) }),
        }).catch(() => undefined);
      }
    } else if (intent === 'sync') {
      const integrationId = body.integrationId;

      if (!integrationId) {
        throw json(
          { error: copy['apiRuntime.panel.integrationRequired'], code: 'INTEGRATION_REQUIRED' },
          { status: 400 },
        );
      }

      state.integrations[integrationId] = {
        ...(state.integrations[integrationId] ?? {}),
        connected: true,
        status: 'active',
        lastSync: now,
      };
    } else if (intent === 'create-webhook') {
      const id = randomUUID();

      const events = (body.events ?? 'all')
        .split(',')
        .map((event) => event.trim())
        .filter(Boolean);

      state.webhooks.unshift({
        id,
        name: body.name || copy['apiRuntime.panel.projectWebhook'],
        url: body.url,
        events: events.length ? events : ['all'],
        active: true,
        successRate: 100,
        createdAt: now,
      });

      if (body.secret) {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: `INTEGRATION_WEBHOOK_SECRET_${id}`, value: body.secret }),
        });
      }
    } else if (intent === 'toggle-webhook') {
      state.webhooks = state.webhooks.map((webhook: any) =>
        webhook.id === body.webhookId ? { ...webhook, active: String(body.active) === 'true' } : webhook,
      );
    } else if (intent === 'delete-webhook') {
      state.webhooks = state.webhooks.filter((webhook: any) => webhook.id !== body.webhookId);

      /*
       * Delete the webhook's signing secret too — leaving it orphaned in project
       * secrets keeps a live signing key for a webhook that no longer exists.
       */
      if (body.webhookId) {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'DELETE',
          body: JSON.stringify({ key: `INTEGRATION_WEBHOOK_SECRET_${body.webhookId}` }),
        }).catch(() => undefined);
      }
    } else if (intent === 'create-api-key') {
      const id = randomUUID();
      const prefix = body.environment === 'production' ? 'ek_live_' : body.environment === 'ci' ? 'ek_ci_' : 'ek_test_';
      const token = `${prefix}${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 8)}`;

      const expirationDays = Number(body.expiration);

      const expiresAt =
        body.expiration && body.expiration !== 'never' && Number.isFinite(expirationDays) && expirationDays > 0
          ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000).toISOString()
          : undefined;

      state.apiKeys.unshift({
        id,
        name: body.name || copy['apiRuntime.panel.projectApiKey'],
        prefix,
        permissions: (body.permissions ?? 'read,write')
          .split(',')
          .map((permission) => permission.trim())
          .filter(Boolean),
        expiresAt,
        createdAt: now,
      });
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: `INTEGRATION_API_KEY_${id}`, value: token }),
      });
    } else if (intent === 'revoke-api-key') {
      state.apiKeys = state.apiKeys.filter((apiKey: any) => apiKey.id !== body.apiKeyId);
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: `INTEGRATION_API_KEY_${body.apiKeyId}` }),
      });
    } else if (intent === 'create-stream') {
      state.eventStreams.unshift({
        id: randomUUID(),
        name: body.name || copy['apiRuntime.panel.projectEventStream'],
        destination: body.destination || 'AWS Kinesis',
        events: (body.events ?? '*')
          .split(',')
          .map((event) => event.trim())
          .filter(Boolean),
        active: true,
        throughput: 0,
        createdAt: now,
      });
    } else if (intent === 'toggle-stream') {
      state.eventStreams = state.eventStreams.map((stream: any) =>
        stream.id === body.streamId ? { ...stream, active: String(body.active) === 'true' } : stream,
      );
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: INTEGRATIONS_STATE_ENV_KEY, value: JSON.stringify(state) }),
    });
  } else if (panel === 'workflows') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const state = readWorkflowsState(envVars, language);
    const now = new Date().toISOString();
    const workflowId = body.workflowId ? Number(body.workflowId) : undefined;
    const taskId = body.taskId ? Number(body.taskId) : undefined;

    if (intent === 'create-workflow') {
      /*
       * Sub-millisecond entropy so two workflows created in the same ms don't
       * collide on this numeric id (it is the lookup key for update/delete/run).
       */
      const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);

      state.workflows.unshift({
        id,
        projectId,
        name: body.name || copy['apiRuntime.panel.projectWorkflow'],
        executionMode: body.executionMode === 'parallel' ? 'parallel' : 'sequential',
        isRunButton: body.isRunButton === 'true',
        isGenerated: body.isGenerated === 'true',
        isSystem: false,
        enabled: true,
        schedule: defaultWorkflowSchedule(),
        createdAt: now,
        updatedAt: now,
        tasks: [
          {
            id: id + 1,
            orderIndex: 0,
            taskType: 'shell',
            command: body.command || 'npm run dev',
            targetWorkflowId: null,
          },
        ],
      });
    } else if (intent === 'update-workflow') {
      state.workflows = state.workflows.map((workflow: any) =>
        workflow.id === workflowId
          ? {
              ...workflow,
              name: body.name ?? workflow.name,
              executionMode:
                body.executionMode === 'parallel' || body.executionMode === 'sequential'
                  ? body.executionMode
                  : workflow.executionMode,
              enabled: body.enabled === undefined ? workflow.enabled : body.enabled === 'true',
              updatedAt: now,
            }
          : workflow,
      );
    } else if (intent === 'delete-workflow') {
      state.workflows = state.workflows.filter((workflow: any) => workflow.id !== workflowId);
    } else if (intent === 'set-run-button') {
      state.workflows = state.workflows.map((workflow: any) => ({
        ...workflow,
        isRunButton: workflow.id === workflowId,
        updatedAt: workflow.id === workflowId ? now : workflow.updatedAt,
      }));
    } else if (intent === 'set-schedule') {
      /*
       * Arm (or disarm) the REAL scheduler for this workflow.
       *
       * This used to only write a cron string into the env-var blob and compute a
       * display-only nextRunAt — nothing ever fired it. Now the cron is persisted
       * as a ScheduledTask row (kind=WORKFLOW) that the api's scheduler tick
       * claims and executes. The blob is still updated so the panel keeps working
       * if the scheduler API is unavailable, but the row is the truth.
       */
      const scheduleEnabled = body.scheduleEnabled === 'true';
      const cronRaw = typeof body.cron === 'string' ? body.cron.trim() : '';
      const timezone = typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : 'UTC';
      const validation = cronRaw ? validateCron(cronRaw) : { valid: false };

      if (scheduleEnabled && !validation.valid) {
        throw json(
          {
            error: cronRaw ? copy['apiRuntime.panel.scheduleInvalid'] : copy['apiRuntime.panel.scheduleEmpty'],
            code: cronRaw ? 'INVALID_CRON_SCHEDULE' : 'EMPTY_CRON_SCHEDULE',
          },
          { status: 400 },
        );
      }

      const cron = validation.valid ? validation.normalized! : cronRaw || null;
      const enabled = scheduleEnabled && Boolean(validation.valid);
      const workflow = state.workflows.find((candidate: any) => candidate.id === workflowId);

      const existing = await apiRequest<{ tasks?: any[] }>(request, `/projects/${projectId}/scheduled-tasks`)
        .then((response) =>
          (response.tasks ?? []).find(
            (task: any) => task.kind === 'WORKFLOW' && Number(task.workflowId) === Number(workflowId),
          ),
        )
        .catch(() => undefined);

      let scheduled: any;

      if (!cron) {
        // Cleared: remove the armed schedule entirely rather than leaving a ghost row.
        if (existing) {
          await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${existing.id}`, { method: 'DELETE' });
        }
      } else if (existing) {
        scheduled = await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: String(workflow?.name ?? copy['apiRuntime.panel.projectWorkflow']),
            cron,
            timezone,
            enabled,
            machineSize: typeof body.machineSize === 'string' ? body.machineSize : undefined,
          }),
        });
      } else {
        scheduled = await apiRequest(request, `/projects/${projectId}/scheduled-tasks`, {
          method: 'POST',
          body: JSON.stringify({
            kind: 'WORKFLOW',
            workflowId,
            name: String(workflow?.name ?? copy['apiRuntime.panel.projectWorkflow']),
            cron,
            timezone,
            enabled,
            ...(typeof body.machineSize === 'string' ? { machineSize: body.machineSize } : {}),
          }),
        });
      }

      const armed = scheduled?.task;

      state.workflows = state.workflows.map((candidate: any) =>
        candidate.id === workflowId
          ? {
              ...candidate,
              updatedAt: now,
              schedule: {
                enabled: armed ? armed.enabled : enabled,
                cron: armed ? armed.cron : cron,
                timezone,

                // The row's nextRunAt is authoritative; the local computation is a fallback.
                nextRunAt: armed
                  ? armed.nextRunAt
                  : enabled && cron
                    ? computeNextRunFromCron(cron, new Date(now))
                    : null,
                lastRunAt: armed?.lastRunAt ?? candidate.schedule?.lastRunAt ?? null,
              },
              scheduledTaskId: armed?.id ?? null,
            }
          : candidate,
      );
    } else if (intent === 'run-scheduled-now') {
      /*
       * "Run now" on an armed schedule: goes through the SAME executor as a cron
       * tick, so the run lands in the same history with the same logs/billing.
       */
      const taskId = String(body.scheduledTaskId ?? '');

      if (!taskId) {
        throw json({ error: copy['apiRuntime.panel.workflowNotArmed'], code: 'WORKFLOW_NOT_ARMED' }, { status: 400 });
      }

      await apiRequest(request, `/projects/${projectId}/scheduled-tasks/${taskId}/run`, { method: 'POST' });
    } else if (intent === 'add-task') {
      state.workflows = state.workflows.map((workflow: any) => {
        if (workflow.id !== workflowId) {
          return workflow;
        }

        const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];
        const taskType = ['shell', 'packages', 'workflow'].includes(body.taskType ?? '') ? body.taskType : 'shell';

        return {
          ...workflow,
          updatedAt: now,
          tasks: normalizeWorkflowTasks([
            ...tasks,
            {
              /*
               * Sub-millisecond entropy: this numeric id is the per-task lookup
               * key, so a same-ms collision would corrupt the wrong task.
               */
              id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
              orderIndex: tasks.length,
              taskType,
              command: taskType === 'packages' ? body.command || 'pnpm install' : body.command || '',
              targetWorkflowId: body.targetWorkflowId ? Number(body.targetWorkflowId) : null,
            },
          ]),
        };
      });
    } else if (intent === 'update-task') {
      state.workflows = state.workflows.map((workflow: any) => {
        if (workflow.id !== workflowId) {
          return workflow;
        }

        return {
          ...workflow,
          updatedAt: now,
          tasks: normalizeWorkflowTasks(
            (workflow.tasks ?? []).map((task: any) =>
              task.id === taskId
                ? {
                    ...task,
                    taskType: ['shell', 'packages', 'workflow'].includes(body.taskType ?? '')
                      ? body.taskType
                      : task.taskType,
                    command: body.command ?? task.command,
                    targetWorkflowId: body.targetWorkflowId ? Number(body.targetWorkflowId) : null,
                  }
                : task,
            ),
          ),
        };
      });
    } else if (intent === 'delete-task') {
      state.workflows = state.workflows.map((workflow: any) =>
        workflow.id === workflowId
          ? {
              ...workflow,
              updatedAt: now,
              tasks: normalizeWorkflowTasks((workflow.tasks ?? []).filter((task: any) => task.id !== taskId)),
            }
          : workflow,
      );
    } else if (intent === 'move-task') {
      state.workflows = state.workflows.map((workflow: any) => {
        if (workflow.id !== workflowId) {
          return workflow;
        }

        const tasks = normalizeWorkflowTasks(workflow.tasks ?? []);
        const index = tasks.findIndex((task: any) => task.id === taskId);
        const direction = body.direction === 'down' ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(tasks.length - 1, index + direction));

        if (index < 0 || index === nextIndex) {
          return workflow;
        }

        const [moved] = tasks.splice(index, 1);
        tasks.splice(nextIndex, 0, moved);

        return { ...workflow, updatedAt: now, tasks: normalizeWorkflowTasks(tasks) };
      });
    } else if (intent === 'reorder-task') {
      /*
       * Drag-and-drop reorder (Replit parity): move `taskId` to an absolute
       * `toIndex`, clamped to the list bounds. move-task (±1) stays for the
       * keyboard/Up-Down fallback path.
       */
      state.workflows = state.workflows.map((workflow: any) => {
        if (workflow.id !== workflowId) {
          return workflow;
        }

        const tasks = normalizeWorkflowTasks(workflow.tasks ?? []);
        const index = tasks.findIndex((task: any) => task.id === taskId);
        const toIndex = Math.max(0, Math.min(tasks.length - 1, Number(body.toIndex)));

        if (index < 0 || Number.isNaN(toIndex) || index === toIndex) {
          return workflow;
        }

        const [moved] = tasks.splice(index, 1);
        tasks.splice(toIndex, 0, moved);

        return { ...workflow, updatedAt: now, tasks: normalizeWorkflowTasks(tasks) };
      });
    } else if (intent === 'run-workflow') {
      const dashboard = await apiRequest<any>(request, `/projects/${projectId}/dashboard`).catch(() => null);
      const workflow = state.workflows.find((item: any) => item.id === workflowId);

      if (!workflow) {
        throw json({ error: copy['apiRuntime.panel.workflowInvalid'], code: 'INVALID_WORKFLOW' }, { status: 400 });
      }

      const run = await runWorkflowTasks(
        request,
        projectId,
        dashboard?.workspace?.id ?? projectId,
        state,
        workflow,
        now,
        language,
      );

      /*
       * The Run button is a manual trigger; record it on the run so the panel
       * can show how each run was started (vs. a future scheduler tick, which
       * would stamp 'schedule').
       */
      state.runs.unshift({ ...run, trigger: 'manual' });
      state.runs = state.runs.slice(0, 25);
      state.workflows = state.workflows.map((item: any) =>
        item.id === workflow.id
          ? {
              ...item,
              lastRunAt: run.startedAt,
              lastRunStatus: run.status,
              updatedAt: run.finishedAt ?? now,

              // Advance the persisted schedule as the infra scheduler tick would.
              schedule: item.schedule?.enabled
                ? {
                    ...item.schedule,
                    lastRunAt: run.startedAt,
                    nextRunAt: item.schedule.cron
                      ? computeNextRunFromCron(item.schedule.cron, new Date(run.finishedAt ?? now))
                      : item.schedule.nextRunAt,
                  }
                : item.schedule,
            }
          : item,
      );
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({
        key: WORKFLOWS_STATE_ENV_KEY,
        value: JSON.stringify(normalizeWorkflowsState(state, language)),
      }),
    });
  } else if (panel === 'security') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const dashboard = await apiRequest<any>(request, `/projects/${projectId}/dashboard`).catch(() => null);
    const state = readSecurityState(envVars, language);
    const now = new Date().toISOString();

    if (intent === 'settings') {
      const scheduleEnabled = body.scheduleEnabled === 'true';

      const scheduleFrequency = ['daily', 'weekly'].includes(String(body.scheduleFrequency))
        ? String(body.scheduleFrequency)
        : 'weekly';

      state.settings = {
        ...state.settings,
        privacyDetectionEnabled: body.privacyDetectionEnabled === 'true',
        dependencyAuditEnabled: body.dependencyAuditEnabled !== 'false',
        secretScanEnabled: body.secretScanEnabled !== 'false',
        sastEnabled: body.sastEnabled !== 'false',
        scannerProfile: ['workspace-runtime', 'sca', 'secrets', 'sast'].includes(String(body.scannerProfile))
          ? String(body.scannerProfile)
          : 'workspace-runtime',
        schedule: {
          enabled: scheduleEnabled,
          frequency: scheduleFrequency,
          nextRunAt: scheduleEnabled ? nextSecurityScheduleRun(scheduleFrequency, now) : null,
          lastRunAt: state.settings.schedule?.lastRunAt ?? null,
        },
        githubSecuritySyncEnabled: body.githubSecuritySyncEnabled === 'true',
      };
    } else if (intent === 'hide-vulnerability' || intent === 'unhide-vulnerability') {
      state.vulnerabilities = state.vulnerabilities.map((vulnerability: any) =>
        vulnerability.id === body.vulnerabilityId
          ? { ...vulnerability, hidden: intent === 'hide-vulnerability', updatedAt: now }
          : vulnerability,
      );
    } else if (intent === 'scan') {
      const workspaceId = dashboard?.workspace?.id ?? projectId;
      await runSecurityScan(request, projectId, workspaceId, state, now, language);
    }

    /*
     * Fire any due scheduled scan from the action (POST) path. This used to run from
     * the loader (a GET), which executed shell commands and mutated env-vars during a
     * plain panel read. A manual `scan` already ran one above, so skip in that case.
     */
    if (intent !== 'scan' && isSecurityScheduleDue(state, new Date(now))) {
      const workspaceId = dashboard?.workspace?.id ?? projectId;
      await runSecurityScan(request, projectId, workspaceId, state, now, language);
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({
        key: SECURITY_STATE_ENV_KEY,
        value: JSON.stringify(normalizeSecurityState(state, language)),
      }),
    });
  } else if (panel === 'terminal') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const state = readTerminalState(envVars, language);
    const dashboard = await apiRequest<any>(request, `/projects/${projectId}/dashboard`).catch(() => null);
    const workspaceId = dashboard?.workspace?.id ?? projectId;
    const now = new Date().toISOString();

    if (intent === 'add-env') {
      if (body.isSecret === 'true') {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
        });
      } else {
        await apiRequest(request, `/projects/${projectId}/env-vars`, {
          method: 'PUT',
          body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
        });
      }
    } else if (intent === 'delete-env') {
      await apiRequest(
        request,
        body.isSecret === 'true' ? `/projects/${projectId}/secrets` : `/projects/${projectId}/env-vars`,
        {
          method: 'DELETE',
          body: JSON.stringify({ key: body.key }),
        },
      );
    } else if (intent === 'run-script') {
      const script = body.script ?? '';

      const run = await runTerminalCommand(
        request,
        workspaceId,
        script,
        body.name || copy['apiRuntime.panel.terminalScript'],
        now,
        language,
      );
      state.scriptRuns.unshift(run);
      state.scriptRuns = state.scriptRuns.slice(0, 20);
    } else if (intent === 'stop-process') {
      await apiRequest(
        request,
        `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes/${encodeURIComponent(body.processId ?? '')}/kill`,
        { method: 'POST' },
      );
    } else if (intent === 'restart-workspace') {
      await apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/restart`, {
        method: 'POST',
      });
    } else if (intent === 'stop-workspace') {
      await apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/stop`, { method: 'POST' });
    } else if (intent === 'add-ssh') {
      const id = randomUUID();
      state.sshConnections.unshift({
        id,
        name: body.name || `${body.username}@${body.host}`,
        host: body.host,
        port: Number(body.port) || 22,
        username: body.username,
        status: 'disconnected',
        createdAt: now,
      });

      if (body.privateKey) {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: terminalSshSecretKey(id), value: body.privateKey }),
        });
      }
    } else if (intent === 'generate-keypair') {
      /*
       * Server-side key generation: mint a fresh pair, store the private key
       * encrypted (never returned again), surface only the public key +
       * fingerprint. Persist state inline so we can return the public key in
       * the same response (the shared trailing return is just `{ ok: true }`).
       */
      const id = randomUUID();
      const keyType = body.type === 'rsa' ? 'rsa' : 'ed25519';
      const keypair = generateSshKeyPair({ type: keyType, comment: body.comment || body.name || body.username });

      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: terminalSshSecretKey(id), value: keypair.privateKey }),
      });

      state.sshConnections.unshift({
        id,
        name: body.name || `${keypair.type} ${keypair.fingerprint.slice(7, 19)}`,
        host: body.host || '',
        port: Number(body.port) || 22,
        username: body.username || '',
        status: 'disconnected',
        createdAt: now,
        publicKey: keypair.publicKey,
        fingerprint: keypair.fingerprint,
        keyType: keypair.type,
      });

      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({
          key: TERMINAL_STATE_ENV_KEY,
          value: JSON.stringify(normalizeTerminalState(state, language)),
        }),
      });

      return json({
        ok: true,
        connectionId: id,
        publicKey: keypair.publicKey,
        fingerprint: keypair.fingerprint,
        keyType: keypair.type,
        createdAt: now,
      });
    } else if (intent === 'delete-ssh') {
      state.sshConnections = state.sshConnections.filter((connection: any) => connection.id !== body.connectionId);
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: terminalSshSecretKey(body.connectionId ?? '') }),
      }).catch(() => undefined);
    } else if (intent === 'disconnect-ssh') {
      state.sshConnections = state.sshConnections.map((connection: any) =>
        connection.id === body.connectionId ? { ...connection, status: 'disconnected', updatedAt: now } : connection,
      );
    } else if (intent === 'connect-ssh') {
      const connection = state.sshConnections.find((item: any) => item.id === body.connectionId);

      if (!connection) {
        throw json(
          { error: copy['apiRuntime.panel.sshConnectionMissing'], code: 'SSH_CONNECTION_NOT_FOUND' },
          { status: 400 },
        );
      }

      /*
       * Real key-based reachability test, run in the project's own workspace
       * pod with the connection's private key (see ephemeralSshKeyPrelude).
       * IdentitiesOnly=yes so ONLY this connection's key is offered — no leaking
       * of any default identity on the shared platform.
       */
      const command = buildSshConnectScript({
        keyEnvVar: terminalSshSecretKey(connection.id),
        host: connection.host,
        port: Number(connection.port) || 22,
        username: connection.username,
      });

      const run = await runTerminalCommand(request, workspaceId, command, `SSH ${connection.name}`, now, language);
      state.scriptRuns.unshift(run);
      state.scriptRuns = state.scriptRuns.slice(0, 20);
      state.sshConnections = state.sshConnections.map((item: any) =>
        item.id === connection.id
          ? {
              ...item,
              status: run.exitCode === 0 ? 'connected' : 'disconnected',
              lastCheckedAt: run.finishedAt,
              lastError: run.exitCode === 0 ? undefined : run.output.slice(-500),
              updatedAt: run.finishedAt,
            }
          : item,
      );
    } else if (intent === 'git-ssh') {
      /*
       * Real git-over-SSH access test: `git ls-remote` against an SSH git URL
       * using GIT_SSH_COMMAND bound to the connection's ephemeral key. Read-only
       * — proves key auth + git transport without mutating the remote.
       */
      const connection = state.sshConnections.find((item: any) => item.id === body.connectionId);

      if (!connection) {
        throw json(
          { error: copy['apiRuntime.panel.sshConnectionMissing'], code: 'SSH_CONNECTION_NOT_FOUND' },
          { status: 400 },
        );
      }

      const repoUrl = (body.repoUrl ?? '').trim();

      if (!isSshGitUrl(repoUrl)) {
        throw json({ error: copy['apiRuntime.panel.sshUrlInvalid'], code: 'INVALID_SSH_GIT_URL' }, { status: 400 });
      }

      const command = buildGitSshLsRemoteScript({ keyEnvVar: terminalSshSecretKey(connection.id), repoUrl });
      const run = await runTerminalCommand(request, workspaceId, command, `git ls-remote ${repoUrl}`, now, language);
      state.scriptRuns.unshift(run);
      state.scriptRuns = state.scriptRuns.slice(0, 20);
      state.sshConnections = state.sshConnections.map((item: any) =>
        item.id === connection.id
          ? {
              ...item,
              lastCheckedAt: run.finishedAt,
              lastError: run.exitCode === 0 ? undefined : run.output.slice(-500),
              updatedAt: run.finishedAt,
            }
          : item,
      );
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({
        key: TERMINAL_STATE_ENV_KEY,
        value: JSON.stringify(normalizeTerminalState(state, language)),
      }),
    });
  } else if (panel === 'git') {
    const workspaceId = body.workspaceId?.trim() || undefined;

    if (intent === 'commit' || intent === 'commit-push') {
      const files = body.stagedFiles
        ?.split(',')
        .map((file) => file.trim())
        .filter(Boolean);

      await apiRequest(request, `/projects/${projectId}/git/commit`, {
        method: 'POST',
        body: JSON.stringify({
          message: body.message || copy['apiRuntime.panel.updateProjectFiles'],
          files,
          workspaceId,
          authorName: body.authorName?.trim() || undefined,
          authorEmail: body.authorEmail?.trim() || undefined,
        }),
      });

      /*
       * Atomic "Commit & push": push the fresh commit to origin (SSH runs in the
       * per-tenant workspace pod, HTTPS on the api-pod git path — same as `push`).
       */
      if (intent === 'commit-push') {
        const branchName = body.branch || 'main';
        const remoteUrl = await resolveProjectRemoteUrl(request, projectId, workspaceId);

        if (remoteUrl && isSshGitUrl(remoteUrl)) {
          await runWorkspaceSshGit({
            request,
            projectId,
            workspaceId,
            op: 'push',
            branch: branchName,
            remoteUrl,
            message: body.message,
            language,
          });
        } else {
          await apiRequest(request, `/projects/${projectId}/git/push`, {
            method: 'POST',
            body: JSON.stringify({ branch: branchName, workspaceId }),
          });
        }
      }
    } else if (intent === 'push' || intent === 'pull' || intent === 'sync') {
      const branchName = body.branch || 'main';
      const remoteUrl = await resolveProjectRemoteUrl(request, projectId, workspaceId);

      /*
       * Replit "Option A": when the configured origin speaks SSH, run git INSIDE
       * the project's isolated workspace pod with its own key (never on the shared
       * api pod). HTTPS remotes keep using the api-pod git path unchanged, so the
       * existing commit/HTTPS-push flow is untouched. "Sync" = pull then push.
       */
      if (remoteUrl && isSshGitUrl(remoteUrl)) {
        if (intent === 'sync' || intent === 'pull') {
          await runWorkspaceSshGit({
            request,
            projectId,
            workspaceId,
            op: 'pull',
            branch: branchName,
            remoteUrl,
            language,
          });
        }

        if (intent === 'sync' || intent === 'push') {
          await runWorkspaceSshGit({
            request,
            projectId,
            workspaceId,
            op: 'push',
            branch: branchName,
            remoteUrl,
            message: body.message,
            language,
          });
        }
      } else if (intent === 'sync') {
        await apiRequest(request, `/projects/${projectId}/git/pull`, {
          method: 'POST',
          body: JSON.stringify({ branch: branchName, workspaceId }),
        });
        await apiRequest(request, `/projects/${projectId}/git/push`, {
          method: 'POST',
          body: JSON.stringify({ branch: branchName, workspaceId }),
        });
      } else {
        await apiRequest(request, `/projects/${projectId}/git/${intent}`, {
          method: 'POST',
          body: JSON.stringify({ branch: branchName, workspaceId }),
        });
      }
    } else if (intent === 'configure-remote') {
      await apiRequest(request, `/projects/${projectId}/git/remote`, {
        method: 'POST',
        body: JSON.stringify({
          remoteUrl: body.remoteUrl || body.gitRepositoryUrl,
          branch: body.branch || body.gitDefaultBranch || 'main',
          workspaceId,
        }),
      });
    } else if (intent === 'remove-remote') {
      await apiRequest(request, `/projects/${projectId}/git/remote/remove`, {
        method: 'POST',
        body: JSON.stringify({ workspaceId }),
      });
    } else if (intent === 'checkout-branch') {
      await apiRequest(request, `/projects/${projectId}/git/branches/checkout`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch || 'main', create: false, workspaceId }),
      });
    } else if (intent === 'create-branch') {
      await apiRequest(request, `/projects/${projectId}/git/branches/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          branch: body.branch,
          create: true,
          startPoint: body.startPoint || undefined,
          workspaceId,
        }),
      });
    } else if (intent === 'stash') {
      await apiRequest(request, `/projects/${projectId}/git/stash`, {
        method: 'POST',
        body: JSON.stringify({ message: body.message || undefined, workspaceId }),
      });
    } else if (intent === 'apply-stash' || intent === 'pop-stash') {
      await apiRequest(request, `/projects/${projectId}/git/stash/apply`, {
        method: 'POST',
        body: JSON.stringify({ stashRef: body.stashRef, drop: intent === 'pop-stash', workspaceId }),
      });
    } else if (intent === 'cherry-pick') {
      await apiRequest(request, `/projects/${projectId}/git/cherry-pick`, {
        method: 'POST',
        body: JSON.stringify({ sha: body.sha, workspaceId }),
      });
    } else if (intent === 'resolve-conflict') {
      await apiRequest(request, `/projects/${projectId}/git/conflicts/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          filePath: body.filePath,
          strategy: body.strategy === 'theirs' ? 'theirs' : 'ours',
          workspaceId,
        }),
      });
    } else if (intent === 'discard') {
      // Comma-separated paths; empty → discard ALL tracked working-tree changes.
      const filePaths = String(body.filePaths ?? '')
        .split(',')
        .map((path) => path.trim())
        .filter(Boolean);

      await apiRequest(request, `/projects/${projectId}/git/discard`, {
        method: 'POST',
        body: JSON.stringify({ filePaths: filePaths.length ? filePaths : undefined, workspaceId }),
      });
    } else if (intent === 'restore') {
      await apiRequest(request, `/projects/${projectId}/git/restore`, {
        method: 'POST',
        body: JSON.stringify({ sha: body.sha, workspaceId }),
      });
    } else if (intent === 'mark-resolved') {
      await apiRequest(request, `/projects/${projectId}/git/conflicts/mark-resolved`, {
        method: 'POST',
        body: JSON.stringify({ filePath: body.filePath, content: body.content ?? '', workspaceId }),
      });
    } else if (intent === 'pr') {
      await apiRequest(request, `/projects/${projectId}/git/pull-requests`, {
        method: 'POST',
        body: JSON.stringify({
          title: body.title || copy['apiRuntime.panel.projectUpdate'],
          sourceBranch: body.sourceBranch || 'main',
          targetBranch: body.targetBranch || 'main',
          body: body.body,
          workspaceId,
        }),
      });
    }
  } else {
    throw json(
      { error: copy['apiRuntime.panel.unsupportedAction'], code: 'UNSUPPORTED_PANEL_ACTION' },
      { status: 404 },
    );
  }

  return json({ ok: true });
}

type RouteDataResult = {
  type: 'DataWithResponseInit';
  data: unknown;
  init?: number | ResponseInit;
};

function isRouteDataResult(value: unknown): value is RouteDataResult {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'DataWithResponseInit' &&
    'data' in (value as object)
  );
}

function mergeLocaleHeaders(request: Request, initial?: HeadersInit): Headers {
  const localeResolution = resolveRequestLocale(request);
  const headers = localeResponseHeaders(request, localeResolution);

  new Headers(initial).forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie' && headers.has('Set-Cookie')) {
      headers.append(key, value);
    } else {
      headers.set(key, value);
    }
  });

  return headers;
}

function localizeRouteResult(request: Request, result: unknown): unknown {
  if (result instanceof Response) {
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: mergeLocaleHeaders(request, result.headers),
    });
  }

  if (isRouteDataResult(result)) {
    const init = typeof result.init === 'number' ? { status: result.init } : (result.init ?? {});

    return json(result.data, { ...init, headers: mergeLocaleHeaders(request, init.headers) });
  }

  return result;
}

async function runLocalizedRoute<TArgs extends EnterpriseLoaderArgs | EnterpriseActionArgs>(
  args: TArgs,
  handler: (args: TArgs) => Promise<unknown>,
): Promise<unknown> {
  const { request } = args;
  const copy = getApiRuntimeRoutesCopy(resolveRequestLocale(request).language);

  try {
    return localizeRouteResult(request, await handler(args));
  } catch (error) {
    if (isRouteDataResult(error)) {
      throw localizeRouteResult(request, error);
    }

    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      throw localizeRouteResult(request, error);
    }

    console.error('IDE panel route failed:', error);

    const status =
      error instanceof Response
        ? error.status
        : Number((error as { status?: unknown } | undefined)?.status) >= 400 &&
            Number((error as { status?: unknown } | undefined)?.status) <= 599
          ? Number((error as { status?: unknown }).status)
          : 500;

    // Même masquage du 429 que dans panelEnvelopeError — voir BUG-QA-PANEL-429-MASKED-001.
    const message =
      status === 401
        ? copy['apiRuntime.panel.authenticationRequired']
        : status === 403
          ? copy['apiRuntime.panel.forbidden']
          : status === 404
            ? copy['apiRuntime.panel.notFound']
            : status === 429
              ? copy['apiRuntime.panel.quotaExceeded']
              : status >= 500
                ? copy['apiRuntime.panel.backendUnavailable']
                : copy['apiRuntime.panel.loadFailed'];

    throw json(
      { error: message, code: status === 429 ? 'PANEL_QUOTA_EXCEEDED' : 'PANEL_REQUEST_FAILED' },
      { status, headers: mergeLocaleHeaders(request) },
    );
  }
}

export async function loader(args: EnterpriseLoaderArgs) {
  return runLocalizedRoute(args, loaderHandler);
}

export async function action(args: EnterpriseActionArgs) {
  return runLocalizedRoute(args, actionHandler);
}

function parseEnvVars(value: string) {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split('=');

        return [key.trim(), rest.join('=').trim()];
      })
      .filter(([key]) => key),
  );
}

const IDE_SETTINGS_STATE_ENV_KEY = 'VIBECORE_IDE_SETTINGS_STATE';

const SETTINGS_BYOK_SECRET_KEY_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

function defaultIdeSettingsState() {
  return {
    preferences: {
      /*
       * 'system', NOT 'dark'. A project with no saved IDE settings must INHERIT
       * the theme chosen in the user area — that is exactly what
       * resolveProjectThemePreference() in BaseChat documents ("a project with
       * no explicit per-IDE theme override must inherit the theme chosen in the
       * user area, so opening a template in light mode stays light").
       *
       * Hard-coding 'dark' here meant an unset state never reached that path:
       * opening any fresh project forced the IDE dark AND persisted that into
       * localStorage `bolt_theme`, flipping the whole app to dark and
       * overriding an explicit light choice — the precise failure mode the
       * comment over there says the code is meant to avoid.
       */
      theme: 'system',
      keyboardMode: false,
      creditAlertThreshold: 80,
    },
    notifications: {
      agent: true,
      billing: true,
      deployment: true,
      security: true,
      team: true,
      system: true,
    },
    aiCredentials: Object.fromEntries(
      Object.keys(SETTINGS_BYOK_SECRET_KEY_MAP).map((provider) => [provider, { mode: 'managed' }]),
    ),
    aiRouting: {
      defaultProvider: 'openai',
      defaultModel: 'openai:managed-default',
      fallbackProvider: 'openrouter',
      fallbackEnabled: true,
    },
    keybindings: {
      overrides: {},
    },
  };
}

function readIdeSettingsState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === IDE_SETTINGS_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultIdeSettingsState();
  }

  try {
    return normalizeIdeSettingsState(JSON.parse(raw));
  } catch {
    return defaultIdeSettingsState();
  }
}

function normalizeIdeSettingsState(input: any) {
  const fallback = defaultIdeSettingsState();
  const notifications = { ...fallback.notifications, ...(input?.notifications ?? {}) };
  const aiCredentials = { ...fallback.aiCredentials, ...(input?.aiCredentials ?? {}) };
  const providerKeys = Object.keys(SETTINGS_BYOK_SECRET_KEY_MAP);

  const keybindingOverrides =
    input?.keybindings?.overrides && typeof input.keybindings.overrides === 'object'
      ? serializeKeybindingOverrides(defaultProjectKeybindings, input.keybindings.overrides)
      : {};

  const defaultProvider = providerKeys.includes(input?.aiRouting?.defaultProvider)
    ? input.aiRouting.defaultProvider
    : fallback.aiRouting.defaultProvider;
  const fallbackProvider = providerKeys.includes(input?.aiRouting?.fallbackProvider)
    ? input.aiRouting.fallbackProvider
    : fallback.aiRouting.fallbackProvider;
  const defaultModel =
    typeof input?.aiRouting?.defaultModel === 'string' && input.aiRouting.defaultModel.trim()
      ? input.aiRouting.defaultModel.trim().slice(0, 120)
      : `${defaultProvider}:managed-default`;

  return {
    preferences: {
      // Unrecognised/absent normalises to 'system' for the same reason as above.
      theme: ['dark', 'light', 'system'].includes(input?.preferences?.theme) ? input.preferences.theme : 'system',
      keyboardMode: Boolean(input?.preferences?.keyboardMode),
      creditAlertThreshold: Number(input?.preferences?.creditAlertThreshold) || 80,
    },
    notifications: {
      agent: notifications.agent !== false,
      billing: notifications.billing !== false,
      deployment: notifications.deployment !== false,
      security: notifications.security !== false,
      team: notifications.team !== false,
      system: notifications.system !== false,
    },
    aiCredentials: Object.fromEntries(
      providerKeys.map((provider) => [
        provider,
        {
          mode: aiCredentials[provider]?.mode === 'byok' ? 'byok' : 'managed',
        },
      ]),
    ),
    aiRouting: {
      defaultProvider,
      defaultModel,
      fallbackProvider,
      fallbackEnabled: input?.aiRouting?.fallbackEnabled !== false,
    },
    keybindings: {
      overrides: keybindingOverrides,
    },
  };
}

const INTEGRATIONS_STATE_ENV_KEY = 'VIBECORE_INTEGRATIONS_STATE';

function defaultIntegrationsState() {
  return {
    integrations: {},
    webhooks: [],
    apiKeys: [],
    eventStreams: [],
  };
}

function readIntegrationsState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === INTEGRATIONS_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultIntegrationsState();
  }

  try {
    const parsed = JSON.parse(raw);

    return {
      integrations: parsed?.integrations && typeof parsed.integrations === 'object' ? parsed.integrations : {},
      webhooks: Array.isArray(parsed?.webhooks) ? parsed.webhooks : [],
      apiKeys: Array.isArray(parsed?.apiKeys) ? parsed.apiKeys : [],
      eventStreams: Array.isArray(parsed?.eventStreams) ? parsed.eventStreams : [],
    };
  } catch {
    return defaultIntegrationsState();
  }
}

function integrationSecretKey(integrationId: string) {
  return `INTEGRATION_TOKEN_${integrationId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
}

const TERMINAL_STATE_ENV_KEY = 'VIBECORE_TERMINAL_STATE';
const PACKAGES_STATE_ENV_KEY = 'VIBECORE_PACKAGES_STATE';
const DEBUGGER_STATE_ENV_KEY = 'VIBECORE_DEBUGGER_STATE';
const EXTENSIONS_STATE_ENV_KEY = 'VIBECORE_EXTENSIONS_STATE';
const PORTS_STATE_ENV_KEY = 'VIBECORE_PORTS_STATE';

/*
 * GET /api/runtime/workspaces/:id/ports answers with a BARE ARRAY of forwarded
 * ports, while this loader's failure fallback uses `{ports: []}`. The envelope
 * used to spread whatever came back, so the live array became `{0:{port:5173}}`
 * and the panel's reader (which accepts an array or `.ports`) always fell
 * through to empty — the Ports panel listed nothing while the runtime was
 * actively serving. Collapse both shapes onto the `ports` key.
 */
export function normalizeRuntimePorts(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const ports = (payload as { ports?: unknown })?.ports;

  return Array.isArray(ports) ? ports : [];
}

/** Persisted Ports config: primary port + per-port public/private visibility. */
function readPortsState(envVarsResponse: unknown): { primaryPort?: number; visibility: Record<string, string> } {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === PORTS_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return { visibility: {} };
  }

  try {
    const parsed = JSON.parse(raw) as { primaryPort?: number; visibility?: Record<string, string> };

    return {
      primaryPort: typeof parsed.primaryPort === 'number' ? parsed.primaryPort : undefined,
      visibility: parsed.visibility && typeof parsed.visibility === 'object' ? parsed.visibility : {},
    };
  } catch {
    return { visibility: {} };
  }
}

type ProjectPackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

function defaultPackagesState() {
  return {
    runs: [],
  };
}

function readPackagesState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === PACKAGES_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultPackagesState();
  }

  try {
    return normalizePackagesState(JSON.parse(raw));
  } catch {
    return defaultPackagesState();
  }
}

function normalizePackagesState(input: any) {
  return {
    runs: Array.isArray(input?.runs) ? input.runs.slice(0, 12) : [],
  };
}

function readExtensionsState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === EXTENSIONS_STATE_ENV_KEY)?.value;

  const legacyExtensions = String(envVars.find((item: any) => item.key === 'VIBECORE_EXTENSIONS')?.value ?? '')
    .split(',')
    .map((extension) => extension.trim())
    .filter(Boolean);

  try {
    return normalizeExtensionsState({
      ...(typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {}),
      legacyExtensions,
    });
  } catch {
    return normalizeExtensionsState({ legacyExtensions });
  }
}

function normalizeExtensionsState(input: any) {
  const extensions: Record<string, any> = {};
  const legacyExtensions = Array.isArray(input?.legacyExtensions) ? input.legacyExtensions : [];

  for (const extension of legacyExtensions) {
    if (typeof extension !== 'string' || !extension.trim()) {
      continue;
    }

    extensions[extension.trim()] = {
      id: extension.trim(),
      enabled: true,
      installedAt: undefined,
      updatedAt: undefined,
    };
  }

  if (input?.extensions && typeof input.extensions === 'object') {
    for (const [id, value] of Object.entries(input.extensions)) {
      if (!id.trim()) {
        continue;
      }

      extensions[id] = {
        id,
        enabled: (value as any)?.enabled !== false,
        installedAt: typeof (value as any)?.installedAt === 'string' ? (value as any).installedAt : undefined,
        updatedAt: typeof (value as any)?.updatedAt === 'string' ? (value as any).updatedAt : undefined,
      };
    }
  }

  return { extensions };
}

function normalizePackageManager(value: string): ProjectPackageManager {
  const normalized = value.toLowerCase();

  if (normalized === 'pnpm' || normalized === 'yarn' || normalized === 'bun' || normalized === 'npm') {
    return normalized;
  }

  return 'npm';
}

function parsePackageList(value: string) {
  return value
    .split(/[\n, ]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function defaultDebuggerState(language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);

  return {
    launchConfigs: [
      normalizeLaunchConfig(
        {
          id: 'node-inspector-dev',
          name: copy['apiRuntime.panel.nodeInspectorDevelopment'],
          type: 'node',
          request: 'launch',
          command: 'npm run dev',
          cwd: '.',
          stopOnEntry: false,
        },
        language,
      ),
    ],
    breakpoints: [],
    watches: [],
    sessions: [],
  };
}

function readDebuggerState(envVarsResponse: unknown, language?: string | null) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === DEBUGGER_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultDebuggerState(language);
  }

  try {
    return normalizeDebuggerState(JSON.parse(raw), language);
  } catch {
    return defaultDebuggerState(language);
  }
}

function normalizeDebuggerState(input: any, language?: string | null) {
  const fallback = defaultDebuggerState(language);

  const launchConfigs = Array.isArray(input?.launchConfigs)
    ? input.launchConfigs.map((config: any) => normalizeLaunchConfig(config, language)).slice(0, 20)
    : fallback.launchConfigs;

  return {
    launchConfigs: launchConfigs.length ? launchConfigs : fallback.launchConfigs,
    breakpoints: Array.isArray(input?.breakpoints) ? input.breakpoints.map(normalizeBreakpoint).slice(0, 200) : [],
    watches: Array.isArray(input?.watches) ? input.watches.map(normalizeWatchExpression).slice(0, 80) : [],
    sessions: Array.isArray(input?.sessions)
      ? input.sessions.map((session: any) => normalizeDebugSession(session, language)).slice(0, 20)
      : [],
  };
}

function normalizeLaunchConfig(input: any, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);
  const inputName = input?.name;

  const normalizedName =
    inputName === apiRuntimeRoutesEn['apiRuntime.panel.nodeInspectorDevelopment']
      ? copy['apiRuntime.panel.nodeInspectorDevelopment']
      : inputName;

  return {
    id: String(input?.id || randomUUID()),
    name: String(normalizedName || copy['apiRuntime.panel.debugConfiguration']).slice(0, 120),
    type: ['node', 'python', 'shell', 'browser'].includes(input?.type) ? input.type : 'node',
    request: input?.request === 'attach' ? 'attach' : 'launch',
    command: typeof input?.command === 'string' ? input.command.trim().slice(0, 800) : '',
    program: typeof input?.program === 'string' ? input.program.trim().slice(0, 240) : '',
    cwd: typeof input?.cwd === 'string' && input.cwd.trim() ? input.cwd.trim().slice(0, 240) : '.',
    args: Array.isArray(input?.args) ? input.args.map((arg: any) => String(arg).slice(0, 240)).slice(0, 32) : [],
    env: input?.env && typeof input.env === 'object' && !Array.isArray(input.env) ? input.env : {},
    stopOnEntry: Boolean(input?.stopOnEntry),
  };
}

function normalizeBreakpoint(input: any) {
  return {
    id: String(input?.id || randomUUID()),
    filePath: String(input?.filePath || 'src/App.tsx').slice(0, 240),
    line: Math.max(1, Math.floor(Number(input?.line) || 1)),
    column: input?.column ? Math.max(1, Math.floor(Number(input.column) || 1)) : undefined,
    enabled: input?.enabled !== false,
    condition: typeof input?.condition === 'string' ? input.condition.trim().slice(0, 500) : '',
    hitCondition: typeof input?.hitCondition === 'string' ? input.hitCondition.trim().slice(0, 120) : '',
    logMessage: typeof input?.logMessage === 'string' ? input.logMessage.trim().slice(0, 500) : '',
  };
}

function normalizeWatchExpression(input: any) {
  return {
    id: String(input?.id || randomUUID()),
    expression: String(input?.expression || '')
      .trim()
      .slice(0, 500),
    enabled: input?.enabled !== false,
  };
}

function normalizeDebugSession(input: any, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);

  return {
    id: String(input?.id || randomUUID()),
    configId: String(input?.configId || ''),
    name: String(input?.name || copy['apiRuntime.panel.debugSession']).slice(0, 120),

    /*
     * 'exited' fait partie des statuts acceptés : c'est celui que pose la
     * réconciliation quand le pid d'une session a disparu de la liste des
     * processus. L'omettre reclassait ces sessions en 'stopped'.
     */
    status: ['running', 'paused', 'stopped', 'exited', 'failed'].includes(input?.status) ? input.status : 'stopped',
    adapter: String(input?.adapter || 'runtime-command'),
    command: String(input?.command || '').slice(0, 800),
    workspaceId: String(input?.workspaceId || ''),
    processId: input?.processId ? String(input.processId) : undefined,
    startedAt: input?.startedAt ? String(input.startedAt) : undefined,
    stoppedAt: input?.stoppedAt ? String(input.stoppedAt) : undefined,
    updatedAt: input?.updatedAt ? String(input.updatedAt) : undefined,
    lastAction: input?.lastAction ? String(input.lastAction) : undefined,
    lastOutput: input?.lastOutput ? String(input.lastOutput).slice(0, 4000) : '',
    callStack: Array.isArray(input?.callStack) ? input.callStack.slice(0, 100) : [],
    variables: Array.isArray(input?.variables) ? input.variables.slice(0, 200) : [],
  };
}

function parseDebugArgs(value: string) {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 32);
}

function buildDebugLaunchCommand(config: any, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);

  if (config.command) {
    return config.command;
  }

  const args = (config.args ?? []).map(shellQuote).join(' ');

  if (config.type === 'python') {
    if (!config.program) {
      throw json(
        { error: copy['apiRuntime.panel.pythonLaunchInvalid'], code: 'PYTHON_LAUNCH_INVALID' },
        { status: 400 },
      );
    }

    return `python -m debugpy --listen 0.0.0.0:5678 ${config.stopOnEntry ? '--wait-for-client ' : ''}${shellQuote(
      config.program,
    )}${args ? ` ${args}` : ''}`;
  }

  if (config.type === 'shell') {
    if (!config.program) {
      throw json({ error: copy['apiRuntime.panel.shellLaunchInvalid'], code: 'SHELL_LAUNCH_INVALID' }, { status: 400 });
    }

    return `${shellQuote(config.program)}${args ? ` ${args}` : ''}`;
  }

  if (!config.program) {
    throw json({ error: copy['apiRuntime.panel.nodeLaunchInvalid'], code: 'NODE_LAUNCH_INVALID' }, { status: 400 });
  }

  return `node ${config.stopOnEntry ? '--inspect-brk=0.0.0.0:9229' : '--inspect=0.0.0.0:9229'} ${shellQuote(
    config.program,
  )}${args ? ` ${args}` : ''}`;
}

function packageRunName(intent: string, packageManager: ProjectPackageManager, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);

  if (intent === 'audit') {
    return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.packageAudit'], { manager: packageManager });
  }

  if (intent === 'outdated') {
    return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.packageOutdated'], { manager: packageManager });
  }

  if (intent === 'install-package') {
    return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.packageAdd'], { manager: packageManager });
  }

  return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.packageInstall'], { manager: packageManager });
}

function packagePanelCommand(
  input: {
    intent: string;
    packageManager: ProjectPackageManager;
    packages: string[];
    dev: boolean;
  },
  language?: string | null,
) {
  const copy = getApiRuntimeRoutesCopy(language);
  const quotedPackages = input.packages.map(shellQuote).join(' ');

  if (input.intent === 'audit') {
    if (input.packageManager === 'pnpm') {
      return 'pnpm audit --json || true';
    }

    if (input.packageManager === 'yarn') {
      return 'yarn npm audit --json || yarn audit --json || true';
    }

    if (input.packageManager === 'bun') {
      return 'bun audit || true';
    }

    return 'npm audit --json || true';
  }

  if (input.intent === 'outdated') {
    if (input.packageManager === 'pnpm') {
      return 'pnpm outdated --format json || true';
    }

    if (input.packageManager === 'yarn') {
      return 'yarn outdated --json || true';
    }

    if (input.packageManager === 'bun') {
      return 'bun outdated || true';
    }

    return 'npm outdated --json || true';
  }

  if (input.intent === 'install-package') {
    if (!input.packages.length) {
      throw json({ error: copy['apiRuntime.panel.packageRequired'], code: 'PACKAGE_REQUIRED' }, { status: 400 });
    }

    if (input.packageManager === 'pnpm') {
      return `pnpm add ${input.dev ? '-D ' : ''}${quotedPackages}`;
    }

    if (input.packageManager === 'yarn') {
      return `yarn add ${input.dev ? '-D ' : ''}${quotedPackages}`;
    }

    if (input.packageManager === 'bun') {
      return `bun add ${input.dev ? '-d ' : ''}${quotedPackages}`;
    }

    return `npm install ${input.dev ? '--save-dev ' : ''}${quotedPackages}`;
  }

  if (input.packageManager === 'pnpm') {
    return 'pnpm install';
  }

  if (input.packageManager === 'yarn') {
    return 'yarn install';
  }

  if (input.packageManager === 'bun') {
    return 'bun install';
  }

  return 'npm install';
}

function defaultTerminalState() {
  return {
    sshConnections: [],
    scriptRuns: [],
  };
}

function readTerminalState(envVarsResponse: unknown, language?: string | null) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === TERMINAL_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultTerminalState();
  }

  try {
    return normalizeTerminalState(JSON.parse(raw), language);
  } catch {
    return defaultTerminalState();
  }
}

function normalizeTerminalState(input: any, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);

  return {
    sshConnections: Array.isArray(input?.sshConnections)
      ? input.sshConnections.map((connection: any) => ({
          id: String(connection.id || randomUUID()),
          name: String(connection.name || connection.host || copy['apiRuntime.panel.sshConnection']),
          host: String(connection.host || ''),
          port: Number(connection.port) || 22,
          username: String(connection.username || ''),
          status: ['connected', 'connecting', 'disconnected'].includes(connection.status)
            ? connection.status
            : 'disconnected',
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
          lastCheckedAt: connection.lastCheckedAt,
          lastError: connection.lastError,

          // server-generated key metadata (display only; private key lives in a secret)
          publicKey: typeof connection.publicKey === 'string' ? connection.publicKey : undefined,
          fingerprint: typeof connection.fingerprint === 'string' ? connection.fingerprint : undefined,
          keyType: connection.keyType === 'rsa' || connection.keyType === 'ed25519' ? connection.keyType : undefined,
        }))
      : [],
    scriptRuns: Array.isArray(input?.scriptRuns) ? input.scriptRuns.slice(0, 20) : [],
  };
}

function terminalSshSecretKey(connectionId: string) {
  return `TERMINAL_SSH_PRIVATE_KEY_${connectionId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/*
 * SSH key handling on the shared platform — TENANT ISOLATION.
 *
 * The per-connection private key is stored as the project secret
 * `TERMINAL_SSH_PRIVATE_KEY_<id>`, and every project secret is injected into
 * the project's OWN workspace pod env at start (api `/workspaces/start` →
 * `allowedSecrets`). We therefore run all key-based ssh/git INSIDE that
 * per-tenant gVisor-sandboxed pod (never on the shared api pod): the key value
 * is read from the pod env BY NAME, materialized to an ephemeral 0600 file, and
 * deleted on exit. The key value never appears in the command string, process
 * args, or the persisted run output — only the env-var name does. One tenant
 * can never reach another tenant's key because each pod only carries its own
 * project's secrets.
 *
 * Limitation (documented): secrets are injected at pod start, so a key added in
 * the current session is not visible until the workspace restarts — the prelude
 * exits 97 with an actionable message in that case.
 */
const SSH_KEY_OPTS = '-o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10';

/**
 * Shell prelude that materializes the private key held in the pod env var
 * `keyEnvVar` to `$VIBECORE_SSH_KEYFILE` (0600), cleaning it up on exit. The
 * caller appends the actual ssh/git invocation, which references
 * `$VIBECORE_SSH_KEYFILE`. `keyEnvVar` is a constant derived from a uuid
 * (`[A-Z0-9_]`), so inlining it is injection-safe.
 */
export function ephemeralSshKeyPrelude(keyEnvVar: string): string {
  return [
    'set -e',
    'umask 077',
    'VIBECORE_SSH_KEYFILE="$(mktemp)"',
    `trap 'rm -f "$VIBECORE_SSH_KEYFILE"' EXIT INT TERM`,
    `printf '%s\\n' "$${keyEnvVar}" > "$VIBECORE_SSH_KEYFILE"`,
    'if [ ! -s "$VIBECORE_SSH_KEYFILE" ]; then echo "vibecore-ssh: private key not present in the workspace environment — restart the workspace after adding or generating the key, then retry." >&2; exit 97; fi',
  ].join('\n');
}

/** Real key-based reachability test: ssh in with ONLY the connection's key. */
export function buildSshConnectScript(input: {
  keyEnvVar: string;
  host: string;
  port: number;
  username: string;
}): string {
  const inner = [
    'ssh',
    '-i "$VIBECORE_SSH_KEYFILE"',
    SSH_KEY_OPTS,
    '-p',
    shellQuote(String(input.port || 22)),
    shellQuote(`${input.username}@${input.host}`),
    shellQuote('echo vibecore-ssh-connected'),
  ].join(' ');

  return `${ephemeralSshKeyPrelude(input.keyEnvVar)}\n${inner}\n`;
}

/** scp-style (`git@host:path`) or `ssh://` git URL — anything over SSH, not https. */
export function isSshGitUrl(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }

  return /^ssh:\/\/[^/]+\/.+/.test(trimmed) || /^[^@\s/]+@[^:\s/]+:.+/.test(trimmed);
}

/**
 * Real git-over-SSH access test using GIT_SSH_COMMAND bound to the ephemeral
 * key. `git ls-remote` is read-only — it proves key auth + git transport
 * without mutating the remote.
 */
export function buildGitSshLsRemoteScript(input: { keyEnvVar: string; repoUrl: string }): string {
  const gitSshCommand = `ssh -i $VIBECORE_SSH_KEYFILE ${SSH_KEY_OPTS}`;
  const inner = `GIT_SSH_COMMAND="${gitSshCommand}" git ls-remote --heads ${shellQuote(input.repoUrl)}`;

  return `${ephemeralSshKeyPrelude(input.keyEnvVar)}\n${inner}\n`;
}

/*
 * SSH GIT IN THE WORKSPACE POD (Replit "Option A").
 *
 * Real push/pull/fetch over the SSH transport, executed INSIDE the project's own
 * gVisor-sandboxed workspace pod (never on the shared api pod). The working tree
 * is `$VIBECORE_GIT_WORKDIR` (the pod's WORKSPACE_ROOT by default), the project's
 * SSH private key is read from the pod env by NAME only (`keyEnvVar`), and every
 * git invocation uses `GIT_SSH_COMMAND` bound to that ephemeral key. The api pod
 * orchestrates by sending the SCRIPT (which references the env-var name) — the
 * key value never crosses the api boundary.
 *
 * The pod working tree is authoritative for content (it is what the user sees and
 * edits); the SSH remote is authoritative for history. Every op fetches the
 * remote branch first and bases on it, so the push is a real fast-forward and the
 * remote's existing history is preserved — exactly the container-side model Replit
 * uses. The api-pod canonical repo (HTTPS/commit/status) is untouched.
 */
const GIT_SSH_PRELUDE = [
  `export GIT_SSH_COMMAND="ssh -i $VIBECORE_SSH_KEYFILE ${SSH_KEY_OPTS}"`,

  // Run in the pod working tree; WORKSPACE_ROOT is the project root inside the pod.
  'VIBECORE_GIT_WORKDIR="${VIBECORE_GIT_WORKDIR:-${WORKSPACE_ROOT:-/workspace}}"',
  'cd "$VIBECORE_GIT_WORKDIR"',
  'if [ ! -d .git ]; then git init -q; fi',

  /*
   * A committer identity is required for `git commit`; only set when absent so a
   * user-configured identity (e.g. the "commit as" selector) is never clobbered.
   */
  'git config user.email >/dev/null 2>&1 || git config user.email "you@vibecore.local"',
  'git config user.name >/dev/null 2>&1 || git config user.name "Vibecore"',
  'if git remote get-url origin >/dev/null 2>&1; then git remote set-url origin "$URL"; else git remote add origin "$URL"; fi',
].join('\n');

/** Parse the host out of an SSH git URL (scp-like `git@host:path` or `ssh://host/path`). */
export function sshHostFromGitUrl(url: string): string | null {
  const trimmed = (url ?? '').trim();
  const proto = trimmed.match(/^ssh:\/\/(?:[^@/]+@)?([^:/]+)/i);

  if (proto) {
    return proto[1].toLowerCase();
  }

  const scp = trimmed.match(/^[^@\s/]+@([^:\s/]+):/);

  return scp ? scp[1].toLowerCase() : null;
}

/**
 * Bind the project's SSH key to the origin with a safe default: prefer the key
 * whose configured host matches the origin host; otherwise, when exactly one key
 * exists it is unambiguous, so use it. Returns null when the binding is
 * ambiguous (multiple keys, none host-matching) so the caller can ask the user
 * to disambiguate rather than silently offering the wrong identity.
 */
export function selectSshConnectionForOrigin<T extends { host?: string | null }>(
  connections: T[],
  remoteUrl: string,
): T | null {
  const host = sshHostFromGitUrl(remoteUrl);

  if (host) {
    const match = connections.find((connection) => (connection.host ?? '').trim().toLowerCase() === host);

    if (match) {
      return match;
    }
  }

  return connections.length === 1 ? connections[0] : null;
}

/**
 * Push the pod working tree to `origin/<branch>` over SSH. Bases on the remote
 * tip (without disturbing the working tree) so the push fast-forwards; on a brand
 * new branch it creates it. Run entirely inside the workspace pod.
 */
export function buildGitSshPushScript(input: {
  keyEnvVar: string;
  repoUrl: string;
  branch: string;
  message: string;
}): string {
  const inner = [
    `URL=${shellQuote(input.repoUrl)}`,
    `BRANCH=${shellQuote(input.branch)}`,
    GIT_SSH_PRELUDE,

    /*
     * Base the local branch on the remote tip WITHOUT overwriting working-tree
     * files: update-ref + symbolic-ref move HEAD, `reset --mixed` re-points the
     * index while leaving every file on disk as-is. `git add -A` then stages the
     * user's real local changes on top of the remote history.
     *
     * Distinguish a missing remote branch (first push → create it) from a fetch
     * that failed for auth/network reasons while the branch EXISTS: in the latter
     * case `ls-remote` still sees the branch, so we abort instead of silently
     * starting a fresh history that the (non-force) push would then reject anyway —
     * surfacing the real cause (bad/absent key, workspace not restarted, network).
     */
    'if git fetch --no-tags --depth=50 origin "$BRANCH"; then',
    '  git update-ref "refs/heads/$BRANCH" FETCH_HEAD',
    '  git symbolic-ref HEAD "refs/heads/$BRANCH"',
    '  git reset --mixed -q',
    'elif git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then',
    '  echo "vibecore-git: could not fetch existing origin/$BRANCH — check the SSH key is added to the Git host and the workspace was restarted after adding it" >&2; exit 4',
    'else',
    '  git checkout -q -B "$BRANCH"',
    'fi',

    /*
     * Never let a MISSING .gitignore sweep node_modules / build output / .env into
     * the push (the pod often ran `npm install`). When the repo has no .gitignore
     * at all, apply safe excludes for THIS add only via a transient excludesFile —
     * we never write/commit a .gitignore the user didn't author, and an existing
     * .gitignore is always trusted as-is.
     */
    'if [ -f .gitignore ]; then',
    '  git add -A',
    'else',
    '  VIBECORE_GIT_EXCLUDES="$(mktemp)"',
    '  printf "%s\\n" node_modules .env "dist/" "build/" .DS_Store > "$VIBECORE_GIT_EXCLUDES"',
    '  git -c core.excludesFile="$VIBECORE_GIT_EXCLUDES" add -A',
    '  rm -f "$VIBECORE_GIT_EXCLUDES"',
    'fi',
    `if git diff --cached --quiet; then echo "vibecore-git: working tree matches origin/$BRANCH; nothing new to commit"; else git commit -q -m ${shellQuote(
      input.message,
    )}; fi`,
    'git push origin "HEAD:refs/heads/$BRANCH"',
    'echo "vibecore-git: pushed $(git rev-parse --short HEAD) to origin/$BRANCH"',
  ].join('\n');

  return `${ephemeralSshKeyPrelude(input.keyEnvVar)}\n${inner}\n`;
}

/**
 * Pull `origin/<branch>` over SSH into the pod working tree. Fast-forwards when
 * possible; on a fresh tree it materializes the remote. A genuine divergence
 * exits non-zero with an actionable message (real git semantics).
 */
export function buildGitSshPullScript(input: { keyEnvVar: string; repoUrl: string; branch: string }): string {
  const inner = [
    `URL=${shellQuote(input.repoUrl)}`,
    `BRANCH=${shellQuote(input.branch)}`,
    GIT_SSH_PRELUDE,
    'git fetch --no-tags origin "$BRANCH"',
    'if git rev-parse -q --verify HEAD >/dev/null 2>&1; then',
    '  git merge --ff-only FETCH_HEAD || { echo "vibecore-git: cannot fast-forward — local commits diverge from origin/$BRANCH; resolve before pulling" >&2; exit 3; }',
    'else',
    '  git update-ref "refs/heads/$BRANCH" FETCH_HEAD',
    '  git symbolic-ref HEAD "refs/heads/$BRANCH"',
    '  git reset --hard -q FETCH_HEAD',
    'fi',
    'echo "vibecore-git: pulled origin/$BRANCH ($(git rev-parse --short HEAD))"',
  ].join('\n');

  return `${ephemeralSshKeyPrelude(input.keyEnvVar)}\n${inner}\n`;
}

/** Read-only `git fetch` of `origin/<branch>` over SSH, in the pod. */
export function buildGitSshFetchScript(input: { keyEnvVar: string; repoUrl: string; branch: string }): string {
  const inner = [
    `URL=${shellQuote(input.repoUrl)}`,
    `BRANCH=${shellQuote(input.branch)}`,
    GIT_SSH_PRELUDE,
    'git fetch --no-tags origin "$BRANCH"',
    'echo "vibecore-git: fetched origin/$BRANCH ($(git rev-parse --short FETCH_HEAD))"',
  ].join('\n');

  return `${ephemeralSshKeyPrelude(input.keyEnvVar)}\n${inner}\n`;
}

/**
 * The authoritative remote for a push/pull. A non-primary workspace can override
 * the project-level remote (api parity: Workspace.gitRepositoryUrl wins when set),
 * so resolve the workspace record first, then fall back to the project record.
 */
async function resolveProjectRemoteUrl(
  request: Request,
  projectId: string,
  workspaceId?: string,
): Promise<string | null> {
  if (workspaceId) {
    const workspaces = await apiRequest<{ workspaces?: Array<Record<string, unknown>> }>(
      request,
      `/projects/${projectId}/workspaces`,
    ).catch(() => null);

    const match = workspaces?.workspaces?.find((workspace) => workspace?.id === workspaceId);
    const url = (match as { gitRepositoryUrl?: unknown } | undefined)?.gitRepositoryUrl;

    if (typeof url === 'string' && url.trim()) {
      return url.trim();
    }
  }

  const project = await apiRequest<{ project?: { gitRepositoryUrl?: unknown } }>(
    request,
    `/projects/${projectId}`,
  ).catch(() => null);

  const url = project?.project?.gitRepositoryUrl;

  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

/** Concrete workspace to run pod commands in: the requested one, else the primary (oldest). */
async function resolveSshGitWorkspaceId(
  request: Request,
  projectId: string,
  requested?: string,
): Promise<string | undefined> {
  if (requested) {
    return requested;
  }

  const workspaces = await apiRequest<{ workspaces?: Array<Record<string, unknown>> }>(
    request,
    `/projects/${projectId}/workspaces`,
  ).catch(() => null);

  const list = Array.isArray(workspaces?.workspaces) ? workspaces!.workspaces! : [];
  const ordered = [...list].sort((a, b) => String(a?.createdAt ?? '').localeCompare(String(b?.createdAt ?? '')));
  const id = (ordered[0]?.id ?? list[0]?.id) as unknown;

  return typeof id === 'string' ? id : undefined;
}

/** SSH connections (id/host/...) configured for this project, from terminal state. */
async function loadProjectSshConnections(request: Request, projectId: string) {
  const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`).catch(() => ({}));

  return readTerminalState(envVars).sshConnections as Array<{ id: string; host?: string; name?: string }>;
}

/**
 * Run a git push/pull/fetch over SSH INSIDE the project's isolated workspace pod
 * (Replit "Option A"). Resolves the workspace and the host-bound SSH key, then
 * executes the materialize-key → GIT_SSH_COMMAND → git script via the workspace
 * agent. The private key never crosses the api pod — only its env-var name does.
 */
async function runWorkspaceSshGit(input: {
  request: Request;
  projectId: string;
  workspaceId?: string;
  op: 'push' | 'pull' | 'fetch';
  branch: string;
  remoteUrl: string;
  message?: string;
  language?: string | null;
}): Promise<{ output: string }> {
  const copy = getApiRuntimeRoutesCopy(input.language);
  const workspaceId = await resolveSshGitWorkspaceId(input.request, input.projectId, input.workspaceId);

  if (!workspaceId) {
    throw json({ error: copy['apiRuntime.panel.workspaceRequired'], code: 'WORKSPACE_REQUIRED' }, { status: 409 });
  }

  const connections = await loadProjectSshConnections(input.request, input.projectId);

  if (connections.length === 0) {
    throw json({ error: copy['apiRuntime.panel.sshKeyRequired'], code: 'SSH_KEY_REQUIRED' }, { status: 400 });
  }

  const connection = selectSshConnectionForOrigin(connections, input.remoteUrl);

  if (!connection) {
    throw json(
      {
        error: formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.sshKeyAmbiguous'], {
          host: sshHostFromGitUrl(input.remoteUrl) ?? 'unknown',
        }),
        code: 'SSH_KEY_AMBIGUOUS',
      },
      { status: 400 },
    );
  }

  const keyEnvVar = terminalSshSecretKey(connection.id);

  const script =
    input.op === 'push'
      ? buildGitSshPushScript({
          keyEnvVar,
          repoUrl: input.remoteUrl,
          branch: input.branch,
          message: input.message?.trim() || copy['apiRuntime.panel.updateFromWorkspace'],
        })
      : input.op === 'pull'
        ? buildGitSshPullScript({ keyEnvVar, repoUrl: input.remoteUrl, branch: input.branch })
        : buildGitSshFetchScript({ keyEnvVar, repoUrl: input.remoteUrl, branch: input.branch });

  const run = await runTerminalCommand(
    input.request,
    workspaceId,
    script,
    `git ${input.op} ${input.remoteUrl}`,
    new Date().toISOString(),
    input.language,
  );

  if (run.exitCode !== 0) {
    console.error('Git over SSH failed:', { operation: input.op, exitCode: run.exitCode, output: run.output });
    throw json(
      {
        error: formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.sshOperationFailed'], {
          operation: input.op,
          exitCode: run.exitCode,
        }),
        code: 'GIT_SSH_FAILED',
      },
      { status: 400 },
    );
  }

  return { output: run.output };
}

async function runTerminalCommand(
  request: Request,
  workspaceId: string,
  script: string,
  name: string,
  startedAt: string,
  language?: string | null,
) {
  const copy = getApiRuntimeRoutesCopy(language);
  const command = script.trim();

  if (!command) {
    throw json({ error: copy['apiRuntime.panel.scriptRequired'], code: 'SCRIPT_REQUIRED' }, { status: 400 });
  }

  const finishedAt = new Date().toISOString();

  try {
    const result = await apiRequest<{ exitCode?: number; output?: string }>(
      request,
      `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/commands`,
      {
        method: 'POST',
        body: JSON.stringify({ command: 'sh', args: ['-lc', command], timeoutMs: 120_000 }),
      },
    );

    return {
      id: randomUUID(),
      name,
      script: command,
      exitCode: result.exitCode ?? 0,
      status: result.exitCode && result.exitCode !== 0 ? 'failed' : 'succeeded',
      output: result.output ?? '',
      startedAt,
      finishedAt,
    };
  } catch (error) {
    console.error('Runtime command failed:', error);

    return {
      id: randomUUID(),
      name,
      script: command,
      exitCode: 1,
      status: 'failed',
      output: panelErrorMessage(error, language),
      startedAt,
      finishedAt,
    };
  }
}

/*
 * Execute a dependency install through the dedicated first-class endpoint
 * POST /projects/:projectId/packages/install (server-side command builder +
 * per-project runtime dispatch). Returns the same run-record shape as
 * runTerminalCommand so the Packages panel renders install output identically
 * to audit/outdated runs.
 */
async function runPackageInstall(
  request: Request,
  projectId: string,
  input: {
    packageManager: ProjectPackageManager;
    packages: string[];
    dev: boolean;
    name: string;
    startedAt: string;
    language?: string | null;

    /*
     * The workspace the panel resolved and is displaying. Audit/outdated already
     * ran against it via runTerminalCommand; install used to omit it entirely,
     * so the API fell back to the deterministic per-user workspace id and every
     * install 502'd whenever that was not the project's active pod.
     */
    workspaceId?: string;
  },
) {
  const finishedAt = () => new Date().toISOString();

  try {
    const result = await apiRequest<{
      command?: string;
      exitCode?: number;
      output?: string;
      success?: boolean;
    }>(request, `/projects/${encodeURIComponent(projectId)}/packages/install`, {
      method: 'POST',
      body: JSON.stringify({
        packages: input.packages,
        dev: input.dev,
        packageManager: input.packageManager,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      }),
    });

    return {
      id: randomUUID(),
      name: input.name,
      script: result.command ?? `${input.packageManager} install`,
      exitCode: result.exitCode ?? 0,
      status: result.success === false || (result.exitCode && result.exitCode !== 0) ? 'failed' : 'succeeded',
      output: result.output ?? '',
      startedAt: input.startedAt,
      finishedAt: finishedAt(),
    };
  } catch (error) {
    console.error('Package installation failed:', error);

    return {
      id: randomUUID(),
      name: input.name,
      script: `${input.packageManager} install`,
      exitCode: 1,
      status: 'failed',
      output: panelErrorMessage(error, input.language),
      startedAt: input.startedAt,
      finishedAt: finishedAt(),
    };
  }
}

async function runSecurityScan(
  request: Request,
  projectId: string,
  workspaceId: string,
  state: any,
  now: string,
  language?: string | null,
) {
  const copy = getApiRuntimeRoutesCopy(language);
  const scannerProfile = state.settings.scannerProfile ?? 'workspace-runtime';

  const runDependencyAudit =
    state.settings.dependencyAuditEnabled && ['workspace-runtime', 'sca'].includes(scannerProfile);

  const runSecretScan = state.settings.secretScanEnabled && ['workspace-runtime', 'secrets'].includes(scannerProfile);
  const runSastScan = state.settings.sastEnabled && ['workspace-runtime', 'sast'].includes(scannerProfile);

  const auditCommand = runDependencyAudit ? 'npm audit --json || true' : 'node -e "console.log(\\"{}\\")"';

  const auditRun = await runTerminalCommand(
    request,
    workspaceId,
    auditCommand,
    copy['apiRuntime.panel.securityDependencyAudit'],
    now,
    language,
  );

  const findings = vulnerabilitiesFromAuditOutput(auditRun.output, now, language);

  if (runSecretScan) {
    const secretRun = await runTerminalCommand(
      request,
      workspaceId,
      "grep -RInE '(api[_-]?key|secret|password|token)\\s*[:=]' . --exclude-dir=node_modules --exclude-dir=.git | head -50 || true",
      copy['apiRuntime.panel.securitySecretScan'],
      now,
      language,
    );
    findings.push(
      ...vulnerabilitiesFromSecretScan(secretRun.output, now).map((finding) => ({
        ...finding,
        title: copy['apiRuntime.panel.securitySecretFinding'],
        recommendation: copy['apiRuntime.panel.securitySecretAdvice'],
      })),
    );
  }

  if (runSastScan) {
    const sastRun = await runTerminalCommand(
      request,
      workspaceId,
      "grep -RInE '(dangerouslySetInnerHTML|eval\\(|new Function\\(|innerHTML\\s*=|document\\.write\\(|child_process|exec\\(|spawn\\(|cors\\(|Access-Control-Allow-Origin)' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build | head -80 || true",
      copy['apiRuntime.panel.securityStaticScan'],
      now,
      language,
    );
    findings.push(...vulnerabilitiesFromSastOutput(sastRun.output, now, language));
  }

  const existingById = new Map(state.vulnerabilities.map((item: any) => [item.id, item]));
  state.vulnerabilities = findings.map((finding) => ({ ...(existingById.get(finding.id) ?? {}), ...finding }));
  state.scans.unshift({
    id: randomUUID(),
    scanType: 'full',
    scanner: scannerProfile,
    status: auditRun.status === 'succeeded' ? 'completed' : 'failed',
    startedAt: now,
    completedAt: new Date().toISOString(),
    summary: formatApiRuntimeRoutesCopy(
      copy[
        findings.length === 1
          ? 'apiRuntime.panel.securityFindingCount_one'
          : 'apiRuntime.panel.securityFindingCount_other'
      ],
      { count: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(findings.length) },
    ),
    exitCode: auditRun.exitCode,
    counts: securitySeverityCounts(findings),
    sources: securitySourceCounts(findings),
    trigger: isSecurityScheduleDue(state, new Date(now)) ? 'scheduled' : 'manual',
  });
  state.scans = state.scans.slice(0, 20);

  if (state.settings.schedule?.enabled) {
    state.settings.schedule.lastRunAt = now;
    state.settings.schedule.nextRunAt = nextSecurityScheduleRun(state.settings.schedule.frequency, now);
  }

  return state;
}

const WORKFLOWS_STATE_ENV_KEY = 'VIBECORE_WORKFLOWS_STATE';

const SECURITY_STATE_ENV_KEY = 'VIBECORE_SECURITY_STATE';

function defaultSecurityState() {
  return {
    settings: {
      privacyDetectionEnabled: true,
      dependencyAuditEnabled: true,
      secretScanEnabled: true,
      sastEnabled: true,
      scannerProfile: 'workspace-runtime',
      schedule: {
        enabled: false,
        frequency: 'weekly',
        nextRunAt: null,
        lastRunAt: null,
      },
      githubSecuritySyncEnabled: false,
    },
    scans: [],
    vulnerabilities: [],
  };
}

function readSecurityState(envVarsResponse: unknown, language?: string | null) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === SECURITY_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultSecurityState();
  }

  try {
    return normalizeSecurityState(JSON.parse(raw), language);
  } catch {
    return defaultSecurityState();
  }
}

function normalizeSecurityState(input: any, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);
  const fallback = defaultSecurityState();

  const localizedSecurityText = (value: unknown, key: keyof ApiRuntimeRoutesCopy) =>
    value === apiRuntimeRoutesEn[key] ? copy[key] : value;

  return {
    settings: {
      privacyDetectionEnabled: input?.settings?.privacyDetectionEnabled !== false,
      dependencyAuditEnabled: input?.settings?.dependencyAuditEnabled !== false,
      secretScanEnabled: input?.settings?.secretScanEnabled !== false,
      sastEnabled: input?.settings?.sastEnabled !== false,
      scannerProfile: ['workspace-runtime', 'sca', 'secrets', 'sast'].includes(input?.settings?.scannerProfile)
        ? input.settings.scannerProfile
        : fallback.settings.scannerProfile,
      schedule: {
        enabled: Boolean(input?.settings?.schedule?.enabled),
        frequency: ['daily', 'weekly'].includes(input?.settings?.schedule?.frequency)
          ? input.settings.schedule.frequency
          : fallback.settings.schedule.frequency,
        nextRunAt: input?.settings?.schedule?.nextRunAt ? String(input.settings.schedule.nextRunAt) : null,
        lastRunAt: input?.settings?.schedule?.lastRunAt ? String(input.settings.schedule.lastRunAt) : null,
      },
      githubSecuritySyncEnabled: Boolean(input?.settings?.githubSecuritySyncEnabled),
    },
    scans: Array.isArray(input?.scans)
      ? input.scans.slice(0, 20).map((scan: any) => ({
          id: String(scan.id || randomUUID()),
          scanType: String(scan.scanType || 'full'),
          scanner: String(scan.scanner || 'workspace-runtime'),
          status: ['queued', 'running', 'completed', 'failed'].includes(scan.status) ? scan.status : 'completed',
          startedAt: scan.startedAt ? String(scan.startedAt) : undefined,
          completedAt: scan.completedAt ? String(scan.completedAt) : undefined,
          summary: scan.summary ? String(scan.summary) : undefined,
          exitCode: Number.isFinite(Number(scan.exitCode)) ? Number(scan.exitCode) : undefined,
          counts: scan.counts && typeof scan.counts === 'object' ? scan.counts : undefined,
          sources: scan.sources && typeof scan.sources === 'object' ? scan.sources : undefined,
        }))
      : fallback.scans,
    vulnerabilities: Array.isArray(input?.vulnerabilities)
      ? input.vulnerabilities.map((vulnerability: any) => ({
          id: String(vulnerability.id || randomUUID()),
          packageName: String(vulnerability.packageName || vulnerability.title || 'workspace'),
          title: String(
            vulnerability.title === `${vulnerability.packageName} dependency advisory`
              ? formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.securityDependencyAdvisory'], {
                  name: vulnerability.packageName,
                })
              : localizedSecurityText(
                  localizedSecurityText(
                    localizedSecurityText(
                      localizedSecurityText(vulnerability.title, 'apiRuntime.panel.securitySecretFinding'),
                      'apiRuntime.panel.securityCommandFinding',
                    ),
                    'apiRuntime.panel.securityDomFinding',
                  ),
                  'apiRuntime.panel.securityReviewFinding',
                ) ||
                  vulnerability.packageName ||
                  copy['apiRuntime.panel.securityFinding'],
          ),
          severity: ['critical', 'high', 'moderate', 'low', 'info'].includes(vulnerability.severity)
            ? vulnerability.severity
            : 'info',
          status: ['open', 'fixed', 'ignored'].includes(vulnerability.status) ? vulnerability.status : 'open',
          hidden: Boolean(vulnerability.hidden),
          source: String(vulnerability.source || 'workspace-runtime'),
          details: String(vulnerability.details || ''),
          recommendation: vulnerability.recommendation
            ? String(
                localizedSecurityText(
                  localizedSecurityText(
                    localizedSecurityText(
                      localizedSecurityText(
                        localizedSecurityText(vulnerability.recommendation, 'apiRuntime.panel.securitySecretAdvice'),
                        'apiRuntime.panel.securityUpdateRemediation',
                      ),
                      'apiRuntime.panel.securityPinRemediation',
                    ),
                    'apiRuntime.panel.securityCommandAdvice',
                  ),
                  vulnerability.recommendation === apiRuntimeRoutesEn['apiRuntime.panel.securityDomAdvice']
                    ? 'apiRuntime.panel.securityDomAdvice'
                    : 'apiRuntime.panel.securityReviewAdvice',
                ),
              )
            : undefined,
          createdAt: vulnerability.createdAt,
          updatedAt: vulnerability.updatedAt,
        }))
      : fallback.vulnerabilities,
  };
}

function vulnerabilitiesFromAuditOutput(output: string, timestamp: string, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);

  try {
    const parsed = JSON.parse(output || '{}');

    const vulnerabilities =
      parsed?.vulnerabilities && typeof parsed.vulnerabilities === 'object' ? parsed.vulnerabilities : {};

    return Object.entries(vulnerabilities).map(([name, value]: [string, any]) => ({
      id: `npm:${name}`,
      packageName: name,
      title: formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.securityDependencyAdvisory'], { name }),
      severity: normalizeSeverity(value?.severity),
      status: 'open',
      hidden: false,
      source: 'npm-audit',
      details: formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.securityAuditDetails'], {
        paths: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(value?.via?.length ?? 0),
        effects: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(value?.effects?.length ?? 0),
      }),
      recommendation: value?.fixAvailable
        ? copy['apiRuntime.panel.securityUpdateRemediation']
        : copy['apiRuntime.panel.securityPinRemediation'],
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  } catch {
    return [];
  }
}

function vulnerabilitiesFromSastOutput(output: string, timestamp: string, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((line, index) => {
      const isCommandExecution = /\b(child_process|exec\(|spawn\(|new Function\(|eval\()/i.test(line);
      const isDomSink = /(dangerouslySetInnerHTML|innerHTML\s*=|document\.write\()/i.test(line);

      return {
        id: `sast:${index}:${line.slice(0, 100)}`,
        packageName: 'workspace',
        title: isCommandExecution
          ? copy['apiRuntime.panel.securityCommandFinding']
          : isDomSink
            ? copy['apiRuntime.panel.securityDomFinding']
            : copy['apiRuntime.panel.securityReviewFinding'],
        severity: isCommandExecution ? 'high' : isDomSink ? 'moderate' : 'low',
        status: 'open',
        hidden: false,
        source: 'sast',
        details: line,
        recommendation: isCommandExecution
          ? copy['apiRuntime.panel.securityCommandAdvice']
          : isDomSink
            ? copy['apiRuntime.panel.securityDomAdvice']
            : copy['apiRuntime.panel.securityReviewAdvice'],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
}

function securitySeverityCounts(findings: Array<{ severity?: string }>) {
  return ['critical', 'high', 'moderate', 'low', 'info'].reduce<Record<string, number>>((acc, severity) => {
    acc[severity] = findings.filter((finding) => finding.severity === severity).length;
    return acc;
  }, {});
}

function securitySourceCounts(findings: Array<{ source?: string }>) {
  return findings.reduce<Record<string, number>>((acc, finding) => {
    const source = finding.source || 'workspace-runtime';
    acc[source] = (acc[source] ?? 0) + 1;

    return acc;
  }, {});
}

function nextSecurityScheduleRun(frequency: string, fromIso: string) {
  const next = new Date(fromIso);
  next.setUTCDate(next.getUTCDate() + (frequency === 'daily' ? 1 : 7));
  next.setUTCHours(3, 0, 0, 0);

  return next.toISOString();
}

function normalizeSeverity(value: unknown) {
  const severity = String(value ?? 'info').toLowerCase();

  return ['critical', 'high', 'moderate', 'low', 'info'].includes(severity) ? severity : 'info';
}

/*
 * A freshly provisioned workspace has the project's SOURCE but no
 * `node_modules`, so the Run button's `npm run dev` died on every brand-new
 * project with `sh: vite: not found` (exit 127) — the workflow panel simply
 * never worked out of the box. Install first, and only when the directory is
 * actually missing so re-runs stay fast and work offline.
 */
const RUN_BUTTON_DEV_COMMAND = 'npm run dev';
const RUN_BUTTON_INSTALL_COMMAND = '[ -d node_modules ] || npm install --no-audit --no-fund';

export function defaultWorkflowsState(language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);

  return {
    workflows: [
      {
        id: 1001,
        projectId: null,
        name: copy['apiRuntime.panel.runDevelopmentServer'],
        executionMode: 'sequential',
        isRunButton: true,
        isGenerated: true,
        isSystem: true,
        enabled: true,
        schedule: defaultWorkflowSchedule(),
        tasks: [
          {
            id: 1002,
            orderIndex: 0,
            taskType: 'shell',
            command: RUN_BUTTON_INSTALL_COMMAND,
            targetWorkflowId: null,
          },
          {
            id: 1003,
            orderIndex: 1,
            taskType: 'shell',
            command: RUN_BUTTON_DEV_COMMAND,
            targetWorkflowId: null,
          },
        ],
      },
    ],
    runs: [],
  };
}

/**
 * Repair the seeded Run-button workflow of projects created BEFORE the install
 * step existed. Their `VIBECORE_WORKFLOWS_STATE` is already persisted, so the
 * new default alone would never reach them and their Run button would keep
 * failing forever.
 *
 * Deliberately narrow: only the system-owned Run-button workflow, and only when
 * its steps are still exactly the single bare `npm run dev`. A workflow the user
 * has edited — even by adding one step — is left untouched.
 */
export function withRunButtonInstallStep(workflow: any) {
  if (!workflow?.isSystem || !workflow?.isRunButton) {
    return workflow;
  }

  const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];

  if (tasks.length !== 1 || String(tasks[0]?.command ?? '').trim() !== RUN_BUTTON_DEV_COMMAND) {
    return workflow;
  }

  return {
    ...workflow,
    tasks: [
      { id: 1002, orderIndex: 0, taskType: 'shell', command: RUN_BUTTON_INSTALL_COMMAND, targetWorkflowId: null },
      { ...tasks[0], orderIndex: 1 },
    ],
  };
}

export function readWorkflowsState(envVarsResponse: unknown, language?: string | null) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === WORKFLOWS_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultWorkflowsState(language);
  }

  try {
    return normalizeWorkflowsState(JSON.parse(raw), language);
  } catch {
    return defaultWorkflowsState(language);
  }
}

function normalizeWorkflowsState(input: any, language?: string | null) {
  const copy = getApiRuntimeRoutesCopy(language);
  const fallback = defaultWorkflowsState(language);
  const workflows = Array.isArray(input?.workflows) ? input.workflows : fallback.workflows;

  return {
    workflows: workflows.map(withRunButtonInstallStep).map((workflow: any, index: number) => ({
      id: Number(workflow.id) || Date.now() + index,
      projectId: workflow.projectId ?? null,
      name: String(
        workflow.name === apiRuntimeRoutesEn['apiRuntime.panel.runDevelopmentServer']
          ? copy['apiRuntime.panel.runDevelopmentServer']
          : workflow.name || copy['apiRuntime.panel.projectWorkflow'],
      ),
      executionMode: workflow.executionMode === 'parallel' ? 'parallel' : 'sequential',
      isRunButton: Boolean(workflow.isRunButton),
      isGenerated: Boolean(workflow.isGenerated),
      isSystem: Boolean(workflow.isSystem),
      enabled: workflow.enabled !== false,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      lastRunAt: workflow.lastRunAt,
      lastRunStatus: workflow.lastRunStatus,
      schedule: normalizeWorkflowSchedule(workflow.schedule, new Date()),
      tasks: normalizeWorkflowTasks(Array.isArray(workflow.tasks) ? workflow.tasks : []),
    })),
    runs: Array.isArray(input?.runs) ? input.runs.slice(0, 25) : [],
  };
}

function normalizeWorkflowTasks(tasks: any[]) {
  return tasks
    .map((task, index) => ({
      id: Number(task.id) || Date.now() + index,
      orderIndex: Number.isFinite(Number(task.orderIndex)) ? Number(task.orderIndex) : index,
      taskType: ['shell', 'packages', 'workflow'].includes(task.taskType) ? task.taskType : 'shell',
      command: typeof task.command === 'string' ? task.command : '',
      targetWorkflowId: task.targetWorkflowId ? Number(task.targetWorkflowId) : null,
    }))
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((task, index) => ({ ...task, orderIndex: index }));
}

/**
 * Run a workflow's ordered steps SEQUENTIALLY (or in parallel) inside the
 * project's own isolated workspace pod.
 *
 * The actual per-step shell exec is delegated to the SAME authorized runtime
 * command dispatch (`POST /api/runtime/workspaces/:id/commands`) used by the
 * terminal and package tasks. The API validates that `workspaceId` belongs to
 * this project and that the caller holds `workspaces:write` before running
 * anything, so tenant isolation is enforced at the dispatch boundary — this
 * orchestrator only sequences the already-authorized calls.
 */
async function runWorkflowTasks(
  request: Request,
  projectId: string,
  workspaceId: string,
  state: WorkflowStateLike,
  workflow: WorkflowLike,
  startedAt: string,
  language?: string | null,
) {
  const copy = getApiRuntimeRoutesCopy(language);

  const run = await runWorkflowSteps({
    state,
    workflow,
    startedAt,
    now: () => new Date().toISOString(),
    makeId: () => randomUUID(),
    execCommand: (command) =>
      apiRequest<{ exitCode?: number; output?: string }>(
        request,
        `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/commands`,
        {
          method: 'POST',
          body: JSON.stringify({ command: 'sh', args: ['-lc', command], timeoutMs: 120_000 }),
        },
      ),
  });

  const localizeMessage = (message: string) => {
    if (message === 'Workflow is disabled.') {
      return copy['apiRuntime.panel.workflowDisabled'];
    }

    if (message === 'Nested workflow depth limit reached') {
      return copy['apiRuntime.panel.workflowDepthLimit'];
    }

    if (message === 'Workflow task has no command') {
      return copy['apiRuntime.panel.workflowTaskCommandMissing'];
    }

    const target = message.match(/^Target workflow (.*) was not found$/u);

    if (target) {
      return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.workflowTargetMissing'], { target: target[1] });
    }

    const nested = message.match(/^Nested workflow "(.*)" failed$/u);

    if (nested) {
      return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.workflowNestedFailed'], { name: nested[1] });
    }

    const exit = message.match(/^Command exited with (\d+)$/u);

    if (exit) {
      return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.workflowCommandFailed'], { exitCode: exit[1] });
    }

    return message;
  };

  return {
    ...run,
    logs: run.logs.map((entry) => ({ ...entry, message: localizeMessage(entry.message) })),
    steps: run.steps.map((step) => ({ ...step, outputTail: localizeMessage(step.outputTail) })),
  };
}
