import type { CommandEvent, RuntimeAdapter } from '@vibecore/runtime-contract';
import { RuntimeError } from '@vibecore/runtime-contract';
import { useEffect, useMemo, type PropsWithChildren } from 'react';
import { createRuntimeAdapter, getRuntimeMode, RuntimeAdapterProvider } from '~/lib/runtime/RuntimeAdapterProvider';
import { isTransientRuntimeError, withRuntimeRetry } from '~/lib/runtime/retry';
import { workspaceQuotaPrompt } from '~/lib/runtime/workspace-quota';
import { reseedWorkspacePreservingOnFailure, shouldReattachWarmWorkspace } from '~/lib/runtime/workspace-reattach';
import { hasLivePreviewPort } from '~/lib/runtime/workspace-status';
import { workbenchStore } from '~/lib/stores/workbench';

/**
 * Workspace ids (sessionId = workspaceId ?? projectId) this client page-session
 * has already cold-seeded. A remount (StrictMode double-mount, route-return) finds
 * its id here and reattaches to the still-running pod instead of wiping+reseeding;
 * a genuinely new page-session (fresh load, possibly with cross-device edits) has
 * no entry and cold-seeds. Module scope so it survives provider remounts within
 * the same page load, and is naturally empty on a full reload.
 */
const seededWorkspaceSessions = new Set<string>();

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

        /*
         * Reattach fast-path (#1). On a warm reopen the pod is often still up and
         * serving (the inactivity GC hasn't reaped it). The previous EVERY-mount
         * behaviour — stop preview → delete the WHOLE tree (incl. node_modules) →
         * reseed from storage → cold dev-server start — wiped the exact state the
         * (d) preview short-circuit needs and killed the live app on every reopen /
         * route-return / StrictMode remount. When the pod is warm AND this page-
         * session already seeded it AND a port is genuinely serving, adopt it AS-IS:
         * skip stop+wipe+reseed and only re-wire below (loadRuntimeFiles +
         * startPreviewServer, which then short-circuits to the live preview). If ANY
         * signal is unknown/false we fall through to the safe cold wipe+reseed.
         *
         * Probe the runtime's live ports first so hasLivePreviewPort sees the warm
         * pod's forwarded dev-server port (listPorts repopulates the previews store).
         */
        const sessionAlreadySeeded = seededWorkspaceSessions.has(sessionId);
        await workbenchStore.refreshRuntimePorts().catch(() => undefined);

        if (cancelled) {
          await stopRemoteWorkspace(runtime, activeWorkspaceId ?? session.id);
          return;
        }

        const reattachWarmWorkspace = shouldReattachWarmWorkspace({
          reused: session.reused === true,
          seededThisSession: sessionAlreadySeeded,
          hasLivePort: hasLivePreviewPort(workbenchStore.previews.get()),

          /*
           * Storage-freshness (cross-device staleness) is NOT cheaply knowable
           * here: the project-storage export endpoint exposes no reliable updatedAt
           * and the pod's last-seed time isn't tracked. We therefore rely on the
           * same-page-session marker, which is correct for the dominant StrictMode/
           * route-return remount case; a genuinely new page-session (a fresh load,
           * possibly with cross-device edits) has no marker and reseeds. Left
           * undefined (treated as "not newer") rather than invented.
           */
        });

        if (reattachWarmWorkspace) {
          workbenchStore.appendWorkspaceLog('Reattached warm workspace (skipped reseed)');
        } else {
          await workbenchStore.stopPreviewServer().catch((error) => {
            workbenchStore.appendWorkspaceLog(
              error instanceof Error
                ? `Previous preview cleanup skipped: ${error.message}`
                : 'Previous preview cleanup skipped',
            );
          });

          try {
            await persistedFilesHydration;

            /*
             * Non-destructive reseed: fetch + VALIDATE the storage archive BEFORE
             * clearing the pod, so a failed export/import never leaves the pod
             * wiped-but-unseeded (a reopen that momentarily destroyed the user's
             * files). The wipe already preserves node_modules/.git (excluded from
             * the runtime listing), so the whole path is now safe on failure.
             *
             * The agent can be briefly unreachable right after a (re)provision —
             * slow gVisor startup under node CPU contention, or Service Endpoints
             * lag — so each remote step retries through that window instead of
             * failing on the first error (which previously tore the pod down).
             */
            await reseedWorkspacePreservingOnFailure({
              fetchArchive: () =>
                withRuntimeRetry(() => fetchProjectStorageArchive(projectId), {
                  attempts: 5,
                  baseDelayMs: 1500,
                }),
              clearTree: () =>
                clearRuntimeProjectTree(runtime).catch((error) => {
                  workbenchStore.appendWorkspaceLog(
                    error instanceof Error
                      ? `Project workspace cleanup skipped: ${error.message}`
                      : 'Project workspace cleanup skipped',
                  );
                }),
              applyArchive: (archive) =>
                withRuntimeRetry(() => applyProjectStorageArchive(runtime, archive), {
                  attempts: 5,
                  baseDelayMs: 1500,
                }),
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
           * Mark seeded only AFTER a successful cold seed (a failed seed returns
           * above, so a retry still reseeds), so a later remount within this page-
           * session reattaches to a genuinely-seeded, warm pod.
           */
          seededWorkspaceSessions.add(sessionId);
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

        /*
         * Re-check after the (network) awaits above: cleanup may have fired
         * during them (rapid project switch / unmount / StrictMode remount).
         * Without this, the watchLogs socket and the keepalive heartbeat below
         * are created AFTER cleanup ran (when stopLogs/heartbeat were still
         * undefined), so they leak for the life of the page and the heartbeat
         * keeps the abandoned workspace billable.
         */
        if (cancelled) {
          await stopRemoteWorkspace(runtime, activeWorkspaceId ?? session.id).catch(() => undefined);
          return;
        }

        void workbenchStore.startPreviewServer().catch((error) => {
          workbenchStore.appendWorkspaceLog(
            error instanceof Error ? `Preview auto-start skipped: ${error.message}` : 'Preview auto-start skipped',
          );
        });

        if ('watchLogs' in runtime && typeof runtime.watchLogs === 'function') {
          stopLogs = await runtime.watchLogs((event: CommandEvent) => workbenchStore.appendWorkspaceLog(event));

          // watchLogs opens a socket; if cleanup raced this await, tear it down now.
          if (cancelled) {
            stopLogs?.();
            stopLogs = undefined;
            await stopRemoteWorkspace(runtime, activeWorkspaceId ?? session.id).catch(() => undefined);

            return;
          }
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

        const quotaPrompt = workspaceQuotaPrompt(error);

        if (quotaPrompt) {
          workbenchStore.quotaWarning.set(quotaPrompt.warning);
          workbenchStore.billingUpgradePrompt.set(quotaPrompt.upgrade);
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

/**
 * Fetch + VALIDATE the authoritative project-storage archive. Throws on a failed
 * export or an empty archive so the caller can bail BEFORE wiping the pod (see
 * reseedWorkspacePreservingOnFailure) — a corrupt/empty archive must never be
 * treated as "the project has no files" and used to blank the workspace.
 */
async function fetchProjectStorageArchive(projectId: string): Promise<Uint8Array> {
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

  return archive;
}

async function applyProjectStorageArchive(runtime: RuntimeAdapter, archive: Uint8Array) {
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
