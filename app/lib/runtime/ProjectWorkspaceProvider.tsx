import type { CommandEvent, RuntimeAdapter } from '@vibecore/runtime-contract';
import { RuntimeError } from '@vibecore/runtime-contract';
import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { createRuntimeAdapter, getRuntimeMode, RuntimeAdapterProvider } from '~/lib/runtime/RuntimeAdapterProvider';
import { isTransientRuntimeError, withRuntimeRetry } from '~/lib/runtime/retry';
import { workbenchStore } from '~/lib/stores/workbench';

export interface ProjectWorkspaceProviderProps extends PropsWithChildren {
  projectId: string;

  /*
   * The workspace the IDE is currently scoped to. When provided we seed the
   * runtime adapter with this id so every runtime call is bound to the correct
   * working tree. Falling back to projectId keeps the legacy single-workspace
   * assumption intact for callers that have not migrated yet.
   */
  workspaceId?: string;
  adapter?: RuntimeAdapter;
  initialError?: string;
}

export function ProjectWorkspaceProvider({
  projectId,
  workspaceId,
  adapter,
  initialError,
  children,
}: ProjectWorkspaceProviderProps) {
  const runtime = useMemo(
    () => adapter ?? createRuntimeAdapter(getRuntimeMode(), { projectId, workspaceId }),
    [adapter, projectId, workspaceId],
  );

  useEffect(() => {
    let cancelled = false;
    let stopLogs: (() => void) | undefined;
    let activeWorkspaceId: string | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    async function startWorkspace() {
      workbenchStore.configureRuntime(runtime);
      workbenchStore.configureProject(projectId);
      workbenchStore.workspaceLoading.set(true);
      workbenchStore.workspaceError.set(undefined);
      workbenchStore.workspaceLogs.set([]);
      workbenchStore.quotaWarning.set(undefined);
      workbenchStore.billingUpgradePrompt.set(undefined);
      workbenchStore.setSelectedFile(undefined);
      workbenchStore.currentView.set('code');

      if (initialError) {
        const formattedError = formatProjectApiError(initialError);

        workbenchStore.workspaceError.set(formattedError);
        workbenchStore.appendWorkspaceLog(formattedError);
        workbenchStore.workspaceLoading.set(false);

        return;
      }

      const persistedFilesHydration = workbenchStore.loadProjectStorageFiles().catch((error) => {
        workbenchStore.appendWorkspaceLog(
          error instanceof Error
            ? `Persisted project file hydration skipped: ${error.message}`
            : 'Persisted project file hydration skipped',
        );

        return false;
      });

      try {
        await runtime.boot();

        /*
         * When the IDE is scoped to a specific workspace, key the runtime
         * session on the workspace id so its files, ports, and logs come from
         * the matching working tree instead of the project's default checkout.
         */
        const sessionId = workspaceId ?? projectId;

        const session = await runtime.startWorkspace({
          id: sessionId,
          metadata: { projectId, workspaceId },
        });
        activeWorkspaceId = session.id;

        if (cancelled) {
          await stopRemoteWorkspace(runtime, session.id);
          return;
        }

        workbenchStore.workspaceStatus.set(session);
        await workbenchStore.stopPreviewServer().catch((error) => {
          workbenchStore.appendWorkspaceLog(
            error instanceof Error
              ? `Previous preview cleanup skipped: ${error.message}`
              : 'Previous preview cleanup skipped',
          );
        });
        await clearRuntimeProjectTree(runtime).catch((error) => {
          workbenchStore.appendWorkspaceLog(
            error instanceof Error
              ? `Project workspace cleanup skipped: ${error.message}`
              : 'Project workspace cleanup skipped',
          );
        });

        try {
          await persistedFilesHydration;

          /*
           * The agent can be briefly unreachable right after a (re)provision —
           * slow gVisor startup under node CPU contention, or Service Endpoints
           * lag — so the first seed call often hits a transient 502/agent-not-
           * reachable. Retry through that window instead of failing on the first
           * error (which previously tore the pod down).
           */
          await withRuntimeRetry(() => seedRuntimeFromProjectStorage(projectId, runtime), {
            attempts: 5,
            baseDelayMs: 1500,
          });
        } catch (error) {
          if (cancelled) {
            return;
          }

          const message = normalizeProjectFileSyncError(error);

          workbenchStore.workspaceError.set(message);
          workbenchStore.appendWorkspaceLog(message);

          /*
           * Only tear the pod down on a NON-transient failure. A transient
           * agent-unreachable that survived the retries is most likely a slow
           * startup that will still come good; killing the pod turns it into a
           * permanent "Crashed runtime" and forces a ~50s cold re-provision.
           * Leave it RUNNING so the keepalive heartbeat holds it and the user can
           * retry without a cold start — genuine orphans are still reaped by the
           * inactivity GC.
           */
          if (activeWorkspaceId && !isTransientRuntimeError(error)) {
            await stopRemoteWorkspace(runtime, activeWorkspaceId).catch(() => undefined);
            activeWorkspaceId = undefined;
          }

          return;
        }

        /*
         * The workspace switched/unmounted while we were seeding — don't wire the
         * previous project's files/preview/log-watcher into the new workspace.
         */
        if (cancelled) {
          await stopRemoteWorkspace(runtime, activeWorkspaceId ?? session.id);
          return;
        }

        await workbenchStore.loadRuntimeFiles('.');
        await workbenchStore.refreshRuntimePorts().catch(() => undefined);
        void workbenchStore.startPreviewServer().catch((error) => {
          workbenchStore.appendWorkspaceLog(
            error instanceof Error ? `Preview auto-start skipped: ${error.message}` : 'Preview auto-start skipped',
          );
        });

        if ('watchLogs' in runtime && typeof runtime.watchLogs === 'function') {
          stopLogs = await runtime.watchLogs((event: CommandEvent) => workbenchStore.appendWorkspaceLog(event));
        }

        /*
         * Keepalive heartbeat. While this project is open, ping the workspace
         * every 60s so the inactivity GC (RUNNING→STOPPED after ~30min idle)
         * doesn't reap the pod out from under a user who is reading code or
         * watching build output without generating file/preview traffic — the
         * only other things that bump lastActiveAt. Remote runtime only (no
         * manager workspace exists in webcontainer mode); the server throttles
         * the underlying write to once / 30s; fire-and-forget.
         */
        if (
          getRuntimeMode() === 'remote-kubernetes' &&
          activeWorkspaceId &&
          'touch' in runtime &&
          typeof (runtime as { touch?: unknown }).touch === 'function'
        ) {
          const heartbeatWorkspaceId = activeWorkspaceId;
          const touchRuntime = runtime as { touch: (workspaceId: string) => Promise<void> };
          heartbeat = setInterval(() => {
            void touchRuntime.touch(heartbeatWorkspaceId).catch(() => undefined);
          }, 60_000);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof RuntimeError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Workspace start failed';
        workbenchStore.workspaceError.set(message);

        /*
         * startWorkspace() may have already provisioned a (billable) remote pod
         * before a later step failed. Without stopping it here the pod stays up
         * until the component unmounts, and a user-triggered retry provisions a
         * second pod against quota. Tear the orphan down so retry starts clean.
         */
        if (activeWorkspaceId) {
          await stopRemoteWorkspace(runtime, activeWorkspaceId).catch(() => undefined);
          activeWorkspaceId = undefined;
        }

        if (error instanceof RuntimeError && error.status === 402) {
          workbenchStore.quotaWarning.set('Workspace quota exceeded');
          workbenchStore.billingUpgradePrompt.set('Upgrade your plan to start more workspaces.');
        }
      } finally {
        if (!cancelled) {
          workbenchStore.workspaceLoading.set(false);
        }
      }
    }

    void startWorkspace();

    return () => {
      cancelled = true;
      stopLogs?.();

      if (heartbeat) {
        clearInterval(heartbeat);
      }

      void workbenchStore.stopPreviewServer().catch(() => undefined);

      /*
       * Do NOT tear the remote workspace down on unmount. A reload / route
       * change / StrictMode remount unmounts this provider, and stopping the pod
       * here meant every reload destroyed the workspace and forced a ~50s cold
       * re-provision on the next mount — and worse, the same-(project,user)
       * deterministic id makes the OLD unmount's stop race the NEW mount's start
       * and kill the freshly-started pod (observed workspace.running →
       * workspace.stopped churn). A genuinely abandoned IN-FLIGHT provision is
       * still cleaned up by the `cancelled` checks inside startWorkspace (which
       * stop the orphan once the start resolves); a fully-started workspace is
       * left RUNNING and reaped by the inactivity GC like any cloud IDE.
       */
      workbenchStore.configureProject(undefined);
    };
  }, [initialError, projectId, workspaceId, runtime]);

  return (
    <RuntimeAdapterProvider adapter={runtime} projectId={projectId}>
      {children}
    </RuntimeAdapterProvider>
  );
}

async function seedRuntimeFromProjectStorage(projectId: string, runtime: RuntimeAdapter) {
  const response = await fetch(`/api/projects/${projectId}/project-action?intent=export`, {
    credentials: 'include',
    headers: { accept: 'application/zip' },
  });

  if (!response.ok) {
    throw new Error(await projectExportFailureMessage(response));
  }

  const archive = new Uint8Array(await response.arrayBuffer());

  if (archive.byteLength === 0) {
    throw new Error('project export returned an empty archive');
  }

  await runtime.importZip(archive, '.');
  workbenchStore.appendWorkspaceLog('Project files synced into workspace runtime');
}

async function projectExportFailureMessage(response: Response) {
  let details = response.statusText;

  try {
    const payload = (await response.clone().json()) as { error?: string; code?: string };
    details = payload.error ?? payload.code ?? details;
  } catch {
    try {
      details = (await response.clone().text()).trim() || details;
    } catch {
      details = response.statusText;
    }
  }

  return `project export returned ${response.status}${details ? `: ${details}` : ''}`;
}

function normalizeProjectFileSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : 'project export failed';
  const lower = message.toLowerCase();

  if (message.includes('401') || message.includes('403') || lower.includes('unauthorized')) {
    return `Project files could not be loaded: ${message}. Your session is missing or expired. Sign in again, then reload the IDE.`;
  }

  if (message.includes('502') || message.includes('503') || lower.includes('fetch failed') || lower.includes('api')) {
    return `Project files could not be loaded: ${message}. Start the full local stack with pnpm run dev so the web app and API run together.`;
  }

  return `Project files could not be loaded: ${message}.`;
}

function formatProjectApiError(message: string) {
  const lower = message.toLowerCase();

  if (message.includes('401') || message.includes('403') || lower.includes('unauthorized')) {
    return `Project API unavailable: ${message}. Your session is missing or expired. Sign in again, then reload the IDE.`;
  }

  if (lower.includes('fetch failed') || lower.includes('connect') || lower.includes('api')) {
    return `Project API unavailable: ${message}. Start the full local stack with pnpm run dev so the web app and API run together.`;
  }

  return `Project API unavailable: ${message}.`;
}

async function clearRuntimeProjectTree(runtime: RuntimeAdapter) {
  const nodes = await runtime.listFiles('.').catch(() => []);

  for (const node of nodes) {
    await runtime.deleteFile(node.path);
  }
}

async function stopRemoteWorkspace(runtime: RuntimeAdapter, workspaceId: string) {
  if (runtime.mode !== 'remote-kubernetes') {
    return;
  }

  await runtime.stopWorkspace(workspaceId).catch((error) => {
    workbenchStore.appendWorkspaceLog(
      error instanceof Error ? `Workspace cleanup skipped: ${error.message}` : 'Workspace cleanup skipped',
    );
  });
}
