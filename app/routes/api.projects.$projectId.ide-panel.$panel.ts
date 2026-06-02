import { randomUUID } from 'node:crypto';
import {
  apiRequest,
  clearSessionCookie,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { defaultProjectKeybindings, serializeKeybindingOverrides } from '~/lib/keybindings';
import { buildProjectOverviewInsights } from '~/lib/project-overview';

export type IdePanelStatus = 'ok' | 'empty' | 'error';

const OVERVIEW_STREAM_INTERVAL_MS = 15_000;

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

function panelEnvelopeError(panel: string, project: unknown, error: unknown): IdePanelEnvelope<null> {
  const message = error instanceof Error ? error.message : 'Failed to load panel data';
  const status = (error as { status?: number } | undefined)?.status;

  const code =
    status === 401
      ? 'PANEL_AUTH'
      : status === 403
        ? 'PANEL_FORBIDDEN'
        : status === 404
          ? 'PANEL_NOT_FOUND'
          : status && status >= 500
            ? 'PANEL_BACKEND_UNAVAILABLE'
            : 'PANEL_REQUEST_FAILED';

  const retryable = !status || status >= 500 || status === 408 || status === 429;

  return {
    panel,
    project,
    status: 'error',
    data: null,
    error: { code, message, retryable },
  };
}

function panelErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Runtime request failed';
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

async function loadOverviewPanelEnvelope(request: Request, projectId: string, project: unknown) {
  try {
    const [dashboard, packages, collaborators, gitGraph, envVars] = await Promise.all([
      apiRequest(request, `/projects/${projectId}/dashboard`).catch((error) => ({ error: panelErrorMessage(error) })),
      apiRequest(request, `/projects/${projectId}/packages`).catch(() => null),
      apiRequest(request, `/projects/${projectId}/collaboration`).catch(() => ({ collaborators: [] })),
      apiRequest(request, `/projects/${projectId}/git/graph`).catch(() => ({ commits: [] })),
      apiRequest(request, `/projects/${projectId}/env-vars`).catch((error) => ({
        envVars: [],
        error: panelErrorMessage(error),
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
        dashboard: dashboardData as any,
        packages: packageData as any,
        gitGraph: gitGraphData as any,
        collaboration: collaborationData as any,
      }),
      workflowsState: readWorkflowsState(envVars),
      terminalState: readTerminalState(envVars),
      packagesState: readPackagesState(envVars),
    });
  } catch (error) {
    return panelEnvelope('overview', project, {
      overview: buildProjectOverviewInsights({ project: project as any }),
      loadError: panelErrorMessage(error),
      workflowsState: defaultWorkflowsState(),
      terminalState: defaultTerminalState(),
      packagesState: defaultPackagesState(),
    });
  }
}

function encodeServerSentEvent(eventName: string, data: unknown) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamOverviewPanel(request: Request, projectId: string, project: unknown) {
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
          const envelope = await loadOverviewPanelEnvelope(request, projectId, project);

          if (!closed) {
            controller.enqueue(encoder.encode(encodeServerSentEvent('overview', envelope)));
          }
        } catch (error) {
          if (!closed) {
            controller.enqueue(
              encoder.encode(encodeServerSentEvent('error', panelEnvelopeError('overview', project, error))),
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

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;
  const panel = params.panel;

  if (!projectId || !panel) {
    throw json({ error: 'Project panel not found' }, { status: 404 });
  }

  const project = await apiRequest<{ project: unknown }>(request, `/projects/${projectId}`);
  const url = new URL(request.url);

  if (
    panel === 'overview' &&
    (url.searchParams.get('stream') === '1' || request.headers.get('accept')?.includes('text/event-stream'))
  ) {
    return streamOverviewPanel(request, projectId, project.project);
  }

  if (panel === 'overview') {
    return json(await loadOverviewPanelEnvelope(request, projectId, project.project));
  }

  if (panel === 'domains') {
    try {
      const organizationId = (project.project as any)?.organizationId;

      if (!organizationId) {
        throw new Error('Project organization is missing');
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
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'git') {
    try {
      const blameFile = url.searchParams.get('blameFile');
      const diffFile = url.searchParams.get('diffFile');
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

      const [status, branches, graph, stashes] = await Promise.all([
        apiRequest(request, withWorkspace(`/projects/${projectId}/git/status`)),
        apiRequest(request, withWorkspace(`/projects/${projectId}/git/branches`)),
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

      return json(
        panelEnvelope(panel, project.project, {
          ...(status as any),
          ...(branches as any),
          ...(graph as any),
          ...(stashes as any),
          ...(blame as any),
          ...(diff as any),
          workspaces: workspaceList,
          activeWorkspaceId,
          primaryWorkspaceId,
          selectedWorkspaceId,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
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
          ).catch((error) => ({ schemaError: panelErrorMessage(error) }))
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
      return json(panelEnvelopeError(panel, project.project, error));
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
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes`).catch((error) => ({
          error: panelErrorMessage(error),
          processes: [],
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/logs/snapshot`).catch(
          (error) => ({
            error: panelErrorMessage(error),
            logs: [],
          }),
        ),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(activity as any),
          workspaceId,
          runtimeStatus,
          runtimeProcesses,
          runtimeLogs,
          debuggerState: readDebuggerState(envVars),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
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
          message: 'Secret reveal requires explicit user confirmation. Add &confirm=1 once acknowledged.',
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
      return json(panelEnvelopeError(panel, project.project, error));
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
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (['database', 'object-storage', 'monitoring'].includes(panel)) {

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
                  error: panelErrorMessage(error),
                }),
              ),
              apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/ports`).catch(
                (error) => ({
                  error: panelErrorMessage(error),
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
      return json(panelEnvelopeError(panel, project.project, error));
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
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'workflows') {
    try {
      const [dashboard, envVars, activity] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/activity`),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(activity as any),
          workflowsState: readWorkflowsState(envVars),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'security') {
    try {
      const [dashboard, envVars, activity] = await Promise.all([
        apiRequest<any>(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/activity`),
      ]);

      const securityState = readSecurityState(envVars);

      if (isSecurityScheduleDue(securityState, new Date())) {
        await runSecurityScan(
          request,
          projectId,
          dashboard?.workspace?.id ?? projectId,
          securityState,
          new Date().toISOString(),
        );
        await apiRequest(request, `/projects/${projectId}/env-vars`, {
          method: 'PUT',
          body: JSON.stringify({
            key: SECURITY_STATE_ENV_KEY,
            value: JSON.stringify(normalizeSecurityState(securityState)),
          }),
        });
      }

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(activity as any),
          securityState,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'settings') {
    try {
      const [settings, account, sessions, envVars, secrets, aiUsage, organizations] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/settings`),
        apiRequest(request, '/auth/me').catch((error) => ({ error: panelErrorMessage(error) })),
        apiRequest(request, '/auth/sessions').catch((error) => ({ error: panelErrorMessage(error), sessions: [] })),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/secrets`),
        apiRequest(request, '/ai/usage').catch((error) => ({ error: panelErrorMessage(error), usage: [] })),
        apiRequest(request, '/orgs').catch((error) => ({ error: panelErrorMessage(error), organizations: [] })),
      ]);

      const orgs = (organizations as any)?.organizations ?? [];

      const billing = orgs[0]?.id
        ? await apiRequest(request, `/orgs/${orgs[0].id}/billing`).catch((error) => ({
            error: panelErrorMessage(error),
          }))
        : { error: 'No organization available for billing.' };

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
      return json(panelEnvelopeError(panel, project.project, error));
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
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/files`).catch((error) => ({
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes`).catch((error) => ({
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/ports`).catch((error) => ({
          error: panelErrorMessage(error),
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
          terminalState: readTerminalState(envVars),
          workspaces: workspaceCtx.workspaceList,
          primaryWorkspaceId: workspaceCtx.primaryWorkspaceId,
          activeWorkspaceId: workspaceCtx.activeWorkspaceId,
          selectedWorkspaceId: workspaceCtx.selectedWorkspaceId,
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
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
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes`).catch((error) => ({
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/ports`).catch((error) => ({
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/logs/snapshot`).catch(
          (error) => ({
            error: panelErrorMessage(error),
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
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  const endpoint = panelEndpoints[panel];

  if (!endpoint) {
    throw json({ error: 'Unsupported IDE panel' }, { status: 404 });
  }

  try {
    const data = await apiRequest(request, endpoint(projectId));

    return json(panelEnvelope(panel, project.project, data));
  } catch (error) {
    return json(panelEnvelopeError(panel, project.project, error));
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;
  const panel = params.panel;

  if (!projectId || !panel) {
    throw json({ error: 'Project panel not found' }, { status: 404 });
  }

  const body = formObject(await request.formData()) as Record<string, string>;
  const intent = body.intent ?? 'default';

  if (panel === 'snapshots') {
    if (intent === 'restore') {
      await apiRequest(request, `/projects/${projectId}/snapshots/${body.snapshotId}/restore`, { method: 'POST' });
    } else {
      await apiRequest(request, `/projects/${projectId}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({ label: body.label || 'Manual checkpoint', kind: 'manual', manifest: {} }),
      });
    }
  } else if (panel === 'deployments') {
    if (intent === 'cancel') {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/cancel`, { method: 'POST' });
    } else if (intent === 'redeploy') {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/redeploy`, {
        method: 'POST',
      });
    } else if (intent === 'rollback') {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/rollback`, {
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
    if (intent === 'delete') {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'DELETE',
        body: JSON.stringify({ key: body.key }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
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
    const state = readDebuggerState(envVars);
    const now = new Date().toISOString();

    if (intent === 'save-config') {
      const config = normalizeLaunchConfig({
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
      });
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
        throw json({ error: 'Create a launch configuration before starting the debugger.' }, { status: 400 });
      }

      const sessionId = randomUUID();
      const command = buildDebugLaunchCommand(config);
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
      body: JSON.stringify({ key: DEBUGGER_STATE_ENV_KEY, value: JSON.stringify(normalizeDebuggerState(state)) }),
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
       * listed again). Build the redeemable /share/<token> URL and hand it back so the IDE can show it.
       */
      const shareUrl = created.token ? new URL(`/share/${created.token}`, new URL(request.url).origin).toString() : undefined;

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
        body: JSON.stringify({ userId: body.userId, roleKey: body.roleKey ?? 'member' }),
      });
    }
  } else if (panel === 'domains') {
    const project = await apiRequest<{ project: any }>(request, `/projects/${projectId}`);
    const organizationId = project.project?.organizationId;

    if (!organizationId) {
      throw new Error('Project organization is missing');
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
        throw json({ error: 'Unsupported AI provider' }, { status: 400 });
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
        throw json({ error: 'Unsupported AI provider' }, { status: 400 });
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
          label: body.label || `Database backup ${new Date().toISOString()}`,
          kind: 'manual',
          manifest: { scope: 'database', source: 'mobile-ide' },
        }),
      });
    } else if (intent === 'restore-backup') {
      await apiRequest(request, `/projects/${projectId}/snapshots/${body.snapshotId}/restore`, { method: 'POST' });
    } else if (intent === 'query') {
      const queryResult = await apiRequest(request, `/projects/${projectId}/databases/query`, {
        method: 'POST',
        body: JSON.stringify({
          key: body.connectionKey,
          query: body.query,
          collection: body.collection || undefined,
          limit: body.limit ? Number(body.limit) : undefined,
        }),
      });

      return json({ ok: true, ...(queryResult as any) });
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
  } else if (panel === 'object-storage') {
    if (intent === 'export') {
      await apiRequest(request, `/projects/${projectId}/export/zip`);
    } else {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key || 'OBJECT_STORAGE_BUCKET', value: body.value ?? '' }),
      });
    }
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

    const command = packagePanelCommand({
      intent,
      packageManager,
      packages: packageNames,
      dev: body.devDependency === 'true',
    });

    const run = await runTerminalCommand(request, workspaceId, command, packageRunName(intent, packageManager), now);
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
  } else if (panel === 'integrations') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const state = readIntegrationsState(envVars);
    const now = new Date().toISOString();
    const intent = body.intent ?? 'default';

    if (intent === 'connect' || intent === 'disconnect') {
      const integrationId = body.integrationId;

      if (!integrationId) {
        throw json({ error: 'integrationId is required' }, { status: 400 });
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
    } else if (intent === 'sync') {
      const integrationId = body.integrationId;

      if (!integrationId) {
        throw json({ error: 'integrationId is required' }, { status: 400 });
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
        name: body.name || 'Project webhook',
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
    } else if (intent === 'create-api-key') {
      const id = randomUUID();
      const prefix = body.environment === 'production' ? 'ek_live_' : body.environment === 'ci' ? 'ek_ci_' : 'ek_test_';
      const token = `${prefix}${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 8)}`;

      const expiresAt =
        body.expiration && body.expiration !== 'never'
          ? new Date(Date.now() + Number(body.expiration) * 24 * 60 * 60 * 1000).toISOString()
          : undefined;

      state.apiKeys.unshift({
        id,
        name: body.name || 'Project API key',
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
        name: body.name || 'Project event stream',
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
    const state = readWorkflowsState(envVars);
    const now = new Date().toISOString();
    const workflowId = body.workflowId ? Number(body.workflowId) : undefined;
    const taskId = body.taskId ? Number(body.taskId) : undefined;

    if (intent === 'create-workflow') {
      const id = Date.now();

      state.workflows.unshift({
        id,
        projectId,
        name: body.name || 'Project workflow',
        executionMode: body.executionMode === 'parallel' ? 'parallel' : 'sequential',
        isRunButton: body.isRunButton === 'true',
        isGenerated: body.isGenerated === 'true',
        isSystem: false,
        enabled: true,
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
              id: Date.now(),
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
    } else if (intent === 'run-workflow') {
      const dashboard = await apiRequest<any>(request, `/projects/${projectId}/dashboard`).catch(() => null);
      const workflow = state.workflows.find((item: any) => item.id === workflowId);

      if (!workflow) {
        throw json({ error: 'workflowId is invalid' }, { status: 400 });
      }

      const run = await runWorkflowTasks(
        request,
        projectId,
        dashboard?.workspace?.id ?? projectId,
        state,
        workflow,
        now,
      );
      state.runs.unshift(run);
      state.runs = state.runs.slice(0, 25);
      state.workflows = state.workflows.map((item: any) =>
        item.id === workflow.id
          ? { ...item, lastRunAt: run.startedAt, lastRunStatus: run.status, updatedAt: run.finishedAt ?? now }
          : item,
      );
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: WORKFLOWS_STATE_ENV_KEY, value: JSON.stringify(normalizeWorkflowsState(state)) }),
    });
  } else if (panel === 'security') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const dashboard = await apiRequest<any>(request, `/projects/${projectId}/dashboard`).catch(() => null);
    const state = readSecurityState(envVars);
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
      await runSecurityScan(request, projectId, workspaceId, state, now);
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: SECURITY_STATE_ENV_KEY, value: JSON.stringify(normalizeSecurityState(state)) }),
    });
  } else if (panel === 'terminal') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const state = readTerminalState(envVars);
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
      const run = await runTerminalCommand(request, workspaceId, script, body.name || 'Terminal script', now);
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
        throw json({ error: 'SSH connection not found' }, { status: 400 });
      }

      const command = [
        'ssh',
        '-o BatchMode=yes',
        '-o StrictHostKeyChecking=no',
        '-o ConnectTimeout=8',
        '-p',
        shellQuote(String(connection.port || 22)),
        `${shellQuote(`${connection.username}@${connection.host}`)}`,
        shellQuote('echo vibecore-ssh-connected'),
      ].join(' ');

      const run = await runTerminalCommand(request, workspaceId, command, `SSH ${connection.name}`, now);
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
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: TERMINAL_STATE_ENV_KEY, value: JSON.stringify(normalizeTerminalState(state)) }),
    });
  } else if (panel === 'git') {
    const workspaceId = body.workspaceId?.trim() || undefined;

    if (intent === 'commit') {
      const files = body.stagedFiles
        ?.split(',')
        .map((file) => file.trim())
        .filter(Boolean);

      await apiRequest(request, `/projects/${projectId}/git/commit`, {
        method: 'POST',
        body: JSON.stringify({ message: body.message || 'Update project files', files, workspaceId }),
      });
    } else if (intent === 'push') {
      await apiRequest(request, `/projects/${projectId}/git/push`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch || 'main', workspaceId }),
      });
    } else if (intent === 'pull') {
      await apiRequest(request, `/projects/${projectId}/git/pull`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch || 'main', workspaceId }),
      });
    } else if (intent === 'configure-remote') {
      await apiRequest(request, `/projects/${projectId}/git/remote`, {
        method: 'POST',
        body: JSON.stringify({
          remoteUrl: body.remoteUrl || body.gitRepositoryUrl,
          branch: body.branch || body.gitDefaultBranch || 'main',
          workspaceId,
        }),
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
    } else if (intent === 'pr') {
      await apiRequest(request, `/projects/${projectId}/git/pull-requests`, {
        method: 'POST',
        body: JSON.stringify({
          title: body.title || 'Project update',
          sourceBranch: body.sourceBranch || 'main',
          targetBranch: body.targetBranch || 'main',
          body: body.body,
          workspaceId,
        }),
      });
    }
  } else {
    throw json({ error: 'Unsupported IDE panel action' }, { status: 404 });
  }

  return json({ ok: true });
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
      theme: 'dark',
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
      theme: ['dark', 'light', 'system'].includes(input?.preferences?.theme) ? input.preferences.theme : 'dark',
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

function defaultDebuggerState() {
  return {
    launchConfigs: [
      normalizeLaunchConfig({
        id: 'node-inspector-dev',
        name: 'Node inspector: development server',
        type: 'node',
        request: 'launch',
        command: 'npm run dev',
        cwd: '.',
        stopOnEntry: false,
      }),
    ],
    breakpoints: [],
    watches: [],
    sessions: [],
  };
}

function readDebuggerState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === DEBUGGER_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultDebuggerState();
  }

  try {
    return normalizeDebuggerState(JSON.parse(raw));
  } catch {
    return defaultDebuggerState();
  }
}

function normalizeDebuggerState(input: any) {
  const fallback = defaultDebuggerState();

  const launchConfigs = Array.isArray(input?.launchConfigs)
    ? input.launchConfigs.map(normalizeLaunchConfig).slice(0, 20)
    : fallback.launchConfigs;

  return {
    launchConfigs: launchConfigs.length ? launchConfigs : fallback.launchConfigs,
    breakpoints: Array.isArray(input?.breakpoints) ? input.breakpoints.map(normalizeBreakpoint).slice(0, 200) : [],
    watches: Array.isArray(input?.watches) ? input.watches.map(normalizeWatchExpression).slice(0, 80) : [],
    sessions: Array.isArray(input?.sessions) ? input.sessions.map(normalizeDebugSession).slice(0, 20) : [],
  };
}

function normalizeLaunchConfig(input: any) {
  return {
    id: String(input?.id || randomUUID()),
    name: String(input?.name || 'Debug configuration').slice(0, 120),
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

function normalizeDebugSession(input: any) {
  return {
    id: String(input?.id || randomUUID()),
    configId: String(input?.configId || ''),
    name: String(input?.name || 'Debug session').slice(0, 120),
    status: ['running', 'paused', 'stopped', 'failed'].includes(input?.status) ? input.status : 'stopped',
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

function buildDebugLaunchCommand(config: any) {
  if (config.command) {
    return config.command;
  }

  const args = (config.args ?? []).map(shellQuote).join(' ');

  if (config.type === 'python') {
    if (!config.program) {
      throw json({ error: 'Python launch requires a program path or command.' }, { status: 400 });
    }

    return `python -m debugpy --listen 0.0.0.0:5678 ${config.stopOnEntry ? '--wait-for-client ' : ''}${shellQuote(
      config.program,
    )}${args ? ` ${args}` : ''}`;
  }

  if (config.type === 'shell') {
    if (!config.program) {
      throw json({ error: 'Shell launch requires a program path or command.' }, { status: 400 });
    }

    return `${shellQuote(config.program)}${args ? ` ${args}` : ''}`;
  }

  if (!config.program) {
    throw json({ error: 'Node launch requires a program path or command.' }, { status: 400 });
  }

  return `node ${config.stopOnEntry ? '--inspect-brk=0.0.0.0:9229' : '--inspect=0.0.0.0:9229'} ${shellQuote(
    config.program,
  )}${args ? ` ${args}` : ''}`;
}

function packageRunName(intent: string, packageManager: ProjectPackageManager) {
  if (intent === 'audit') {
    return `${packageManager} security audit`;
  }

  if (intent === 'outdated') {
    return `${packageManager} outdated check`;
  }

  if (intent === 'install-package') {
    return `${packageManager} add package`;
  }

  return `${packageManager} install`;
}

function packagePanelCommand(input: {
  intent: string;
  packageManager: ProjectPackageManager;
  packages: string[];
  dev: boolean;
}) {
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
      throw json({ error: 'At least one package is required' }, { status: 400 });
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

function readTerminalState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === TERMINAL_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultTerminalState();
  }

  try {
    return normalizeTerminalState(JSON.parse(raw));
  } catch {
    return defaultTerminalState();
  }
}

function normalizeTerminalState(input: any) {
  return {
    sshConnections: Array.isArray(input?.sshConnections)
      ? input.sshConnections.map((connection: any) => ({
          id: String(connection.id || randomUUID()),
          name: String(connection.name || connection.host || 'SSH connection'),
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

async function runTerminalCommand(
  request: Request,
  workspaceId: string,
  script: string,
  name: string,
  startedAt: string,
) {
  const command = script.trim();

  if (!command) {
    throw json({ error: 'Script is required' }, { status: 400 });
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
    return {
      id: randomUUID(),
      name,
      script: command,
      exitCode: 1,
      status: 'failed',
      output: panelErrorMessage(error),
      startedAt,
      finishedAt,
    };
  }
}

async function runSecurityScan(request: Request, projectId: string, workspaceId: string, state: any, now: string) {
  const scannerProfile = state.settings.scannerProfile ?? 'workspace-runtime';

  const runDependencyAudit =
    state.settings.dependencyAuditEnabled && ['workspace-runtime', 'sca'].includes(scannerProfile);

  const runSecretScan = state.settings.secretScanEnabled && ['workspace-runtime', 'secrets'].includes(scannerProfile);
  const runSastScan = state.settings.sastEnabled && ['workspace-runtime', 'sast'].includes(scannerProfile);

  const auditCommand = runDependencyAudit ? 'npm audit --json || true' : 'node -e "console.log(\\"{}\\")"';
  const auditRun = await runTerminalCommand(request, workspaceId, auditCommand, 'Security dependency audit', now);
  const findings = vulnerabilitiesFromAuditOutput(auditRun.output, now);

  if (runSecretScan) {
    const secretRun = await runTerminalCommand(
      request,
      workspaceId,
      "grep -RInE '(api[_-]?key|secret|password|token)\\s*[:=]' . --exclude-dir=node_modules --exclude-dir=.git | head -50 || true",
      'Security secret scan',
      now,
    );
    findings.push(...vulnerabilitiesFromSecretScan(secretRun.output, now));
  }

  if (runSastScan) {
    const sastRun = await runTerminalCommand(
      request,
      workspaceId,
      "grep -RInE '(dangerouslySetInnerHTML|eval\\(|new Function\\(|innerHTML\\s*=|document\\.write\\(|child_process|exec\\(|spawn\\(|cors\\(|Access-Control-Allow-Origin)' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build | head -80 || true",
      'Security static code scan',
      now,
    );
    findings.push(...vulnerabilitiesFromSastOutput(sastRun.output, now));
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
    summary: `${findings.length} finding${findings.length === 1 ? '' : 's'}`,
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

function readSecurityState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === SECURITY_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultSecurityState();
  }

  try {
    return normalizeSecurityState(JSON.parse(raw));
  } catch {
    return defaultSecurityState();
  }
}

function normalizeSecurityState(input: any) {
  const fallback = defaultSecurityState();

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
          title: String(vulnerability.title || vulnerability.packageName || 'Security finding'),
          severity: ['critical', 'high', 'moderate', 'low', 'info'].includes(vulnerability.severity)
            ? vulnerability.severity
            : 'info',
          status: ['open', 'fixed', 'ignored'].includes(vulnerability.status) ? vulnerability.status : 'open',
          hidden: Boolean(vulnerability.hidden),
          source: String(vulnerability.source || 'workspace-runtime'),
          details: String(vulnerability.details || ''),
          recommendation: vulnerability.recommendation ? String(vulnerability.recommendation) : undefined,
          createdAt: vulnerability.createdAt,
          updatedAt: vulnerability.updatedAt,
        }))
      : fallback.vulnerabilities,
  };
}

function vulnerabilitiesFromAuditOutput(output: string, timestamp: string) {
  try {
    const parsed = JSON.parse(output || '{}');

    const vulnerabilities =
      parsed?.vulnerabilities && typeof parsed.vulnerabilities === 'object' ? parsed.vulnerabilities : {};

    return Object.entries(vulnerabilities).map(([name, value]: [string, any]) => ({
      id: `npm:${name}`,
      packageName: name,
      title: `${name} dependency advisory`,
      severity: normalizeSeverity(value?.severity),
      status: 'open',
      hidden: false,
      source: 'npm-audit',
      details: `${value?.via?.length ?? 0} advisory path(s), ${value?.effects?.length ?? 0} effect(s).`,
      recommendation: value?.fixAvailable
        ? 'Run the package manager update recommended by npm audit.'
        : 'Review advisory and pin a safe dependency version.',
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  } catch {
    return [];
  }
}

function vulnerabilitiesFromSecretScan(output: string, timestamp: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line, index) => ({
      id: `secret:${index}:${line.slice(0, 80)}`,
      packageName: 'workspace',
      title: 'Potential secret in source file',
      severity: 'high',
      status: 'open',
      hidden: false,
      source: 'secret-scan',
      details: line.replace(/=.*/, '=***'),
      recommendation: 'Move credentials into project secrets and rotate exposed values.',
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
}

function vulnerabilitiesFromSastOutput(output: string, timestamp: string) {
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
          ? 'Potential command execution sink'
          : isDomSink
            ? 'Potential unsafe DOM injection sink'
            : 'Static security review item',
        severity: isCommandExecution ? 'high' : isDomSink ? 'moderate' : 'low',
        status: 'open',
        hidden: false,
        source: 'sast',
        details: line,
        recommendation: isCommandExecution
          ? 'Validate inputs, avoid shell interpolation, and restrict command execution to allow-listed operations.'
          : isDomSink
            ? 'Sanitize untrusted HTML and prefer safe rendering primitives.'
            : 'Review the matched source line and document why the pattern is safe.',
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

function isSecurityScheduleDue(state: any, now: Date) {
  if (!state?.settings?.schedule?.enabled || !state.settings.schedule.nextRunAt) {
    return false;
  }

  const nextRunAt = new Date(state.settings.schedule.nextRunAt);

  return !Number.isNaN(nextRunAt.getTime()) && nextRunAt.getTime() <= now.getTime();
}

function normalizeSeverity(value: unknown) {
  const severity = String(value ?? 'info').toLowerCase();

  return ['critical', 'high', 'moderate', 'low', 'info'].includes(severity) ? severity : 'info';
}

function defaultWorkflowsState() {
  return {
    workflows: [
      {
        id: 1001,
        projectId: null,
        name: 'Run development server',
        executionMode: 'sequential',
        isRunButton: true,
        isGenerated: true,
        isSystem: true,
        enabled: true,
        tasks: [
          {
            id: 1002,
            orderIndex: 0,
            taskType: 'shell',
            command: 'npm run dev',
            targetWorkflowId: null,
          },
        ],
      },
    ],
    runs: [],
  };
}

function readWorkflowsState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === WORKFLOWS_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultWorkflowsState();
  }

  try {
    return normalizeWorkflowsState(JSON.parse(raw));
  } catch {
    return defaultWorkflowsState();
  }
}

function normalizeWorkflowsState(input: any) {
  const fallback = defaultWorkflowsState();
  const workflows = Array.isArray(input?.workflows) ? input.workflows : fallback.workflows;

  return {
    workflows: workflows.map((workflow: any, index: number) => ({
      id: Number(workflow.id) || Date.now() + index,
      projectId: workflow.projectId ?? null,
      name: String(workflow.name || 'Project workflow'),
      executionMode: workflow.executionMode === 'parallel' ? 'parallel' : 'sequential',
      isRunButton: Boolean(workflow.isRunButton),
      isGenerated: Boolean(workflow.isGenerated),
      isSystem: Boolean(workflow.isSystem),
      enabled: workflow.enabled !== false,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      lastRunAt: workflow.lastRunAt,
      lastRunStatus: workflow.lastRunStatus,
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

async function runWorkflowTasks(
  request: Request,
  projectId: string,
  workspaceId: string,
  state: any,
  workflow: any,
  startedAt: string,
  depth = 0,
): Promise<any> {
  const run = {
    id: randomUUID(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'running',
    startedAt,
    finishedAt: undefined as string | undefined,
    logs: [] as Array<{ level: string; message: string; timestamp: string }>,
  };

  const tasks = normalizeWorkflowTasks(workflow.tasks ?? []);

  if (!workflow.enabled) {
    run.status = 'skipped';
    run.finishedAt = new Date().toISOString();
    run.logs.push({ level: 'warn', message: 'Workflow is disabled.', timestamp: run.finishedAt });

    return run;
  }

  async function executeTask(task: any) {
    const timestamp = new Date().toISOString();

    if (task.taskType === 'workflow') {
      if (depth >= 3) {
        throw new Error('Nested workflow depth limit reached');
      }

      const target = state.workflows.find((item: any) => item.id === task.targetWorkflowId);

      if (!target) {
        throw new Error(`Target workflow ${task.targetWorkflowId ?? ''} was not found`);
      }

      const nestedRun = await runWorkflowTasks(request, projectId, workspaceId, state, target, timestamp, depth + 1);
      run.logs.push(...nestedRun.logs);

      if (nestedRun.status === 'failed') {
        throw new Error(`Nested workflow "${target.name}" failed`);
      }

      return;
    }

    const command = String(task.command || (task.taskType === 'packages' ? 'pnpm install' : '')).trim();

    if (!command) {
      throw new Error('Workflow task has no command');
    }

    run.logs.push({ level: 'info', message: `$ ${command}`, timestamp });

    const result = await apiRequest<{ exitCode?: number; output?: string }>(
      request,
      `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/commands`,
      {
        method: 'POST',
        body: JSON.stringify({ command: 'sh', args: ['-lc', command], timeoutMs: 120_000 }),
      },
    );

    if (result.output) {
      run.logs.push({
        level: result.exitCode && result.exitCode !== 0 ? 'error' : 'info',
        message: result.output.slice(-4000),
        timestamp: new Date().toISOString(),
      });
    }

    if (result.exitCode && result.exitCode !== 0) {
      throw new Error(`Command exited with ${result.exitCode}`);
    }
  }

  try {
    if (workflow.executionMode === 'parallel') {
      await Promise.all(tasks.map((task) => executeTask(task)));
    } else {
      for (const task of tasks) {
        await executeTask(task);
      }
    }

    run.status = 'succeeded';
  } catch (error) {
    const timestamp = new Date().toISOString();
    run.status = 'failed';
    run.logs.push({
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
      timestamp,
    });
  }

  run.finishedAt = new Date().toISOString();

  return run;
}
