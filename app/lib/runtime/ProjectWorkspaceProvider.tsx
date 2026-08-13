import type { CommandEvent, RuntimeAdapter } from '@vibecore/runtime-contract';
import { useEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { clientStoresServicesText } from '~/lib/i18n/catalogs/client-stores-services';
import { createRuntimeAdapter, getRuntimeMode, RuntimeAdapterProvider } from '~/lib/runtime/RuntimeAdapterProvider';
import { isTransientRuntimeError, withRuntimeRetry } from '~/lib/runtime/retry';
import { fetchAnyPortServing } from '~/lib/runtime/serving-ports';
import { workspaceQuotaPrompt } from '~/lib/runtime/workspace-quota';
import {
  hasAdoptablePreviewPort,
  reseedWorkspacePreservingOnFailure,
  shouldReattachWarmWorkspace,
} from '~/lib/runtime/workspace-reattach';
import { readSeedMarker, writeSeedMarker } from '~/lib/runtime/workspace-seed-marker';
import { workbenchStore } from '~/lib/stores/workbench';

/*
 * BUG-RUNTIME-DIVERGENCE (option A, signal 3) — révision des FICHIERS persistés.
 *
 * Lisait auparavant l'ETag de l'ide-state, c'est-à-dire `ideState.version`, que
 * les écritures d'INTERFACE incrémentent : ouvrir un onglet ou déplacer le
 * curseur la fait avancer. Mesuré en réel : 5 → 9 en une seule session, sans
 * qu'un seul fichier ait changé. La comparaison concluait donc « le stockage a
 * bougé » à presque chaque réouverture et forçait le reseed — le symptôme même
 * qu'on cherche à corriger.
 *
 * `GET /files-revision` ne dépend que des chemins, dates et tailles (voir
 * `projectFilesRevision` côté API). Renvoie `undefined` en cas d'échec, pour que
 * l'appelant retombe sur le comportement antérieur plutôt que de provoquer un
 * reseed injustifié.
 */
export async function fetchPersistedProjectRevision(projectId: string): Promise<string | undefined> {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files-revision`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return undefined;
    }

    const body = (await response.json()) as { revision?: unknown };

    return typeof body.revision === 'string' && body.revision.length > 0 ? body.revision : undefined;
  } catch {
    return undefined;
  }
}

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
  const { i18n } = useTranslation();
  const languageRef = useRef(i18n.resolvedLanguage ?? i18n.language);
  languageRef.current = i18n.resolvedLanguage ?? i18n.language;

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
        console.error('Persisted project file hydration failed:', error);
        workbenchStore.appendWorkspaceLog(
          clientStoresServicesText('clientRuntime.workspace.persistedHydrationSkipped'),
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
         * Probe the runtime's live ports first so the adoptable-port check sees the warm
         * pod's forwarded dev-server port (listPorts repopulates the previews store).
         */
        /*
         * Signal 1 — marqueur DURABLE. Une `Map` de portée module est vide à
         * chaque chargement de page, donc `seededThisSession` était toujours
         * faux à la réouverture : la réouverture reseedait quoi qu'il arrive.
         */
        const seedMarker = readSeedMarker(sessionId, Date.now());
        const sessionAlreadySeeded = seedMarker !== undefined;
        const seededRevision = seedMarker?.revision;

        /*
         * Signal 2 — l'échec de la sonde n'est plus avalé. « La sonde a échoué »
         * et « le pod n'écoute rien » menaient tous deux à `hasLivePort: false`
         * et étaient donc indiscernables.
         */
        let portProbeSucceeded = true;

        try {
          await workbenchStore.refreshRuntimePorts();
        } catch (error) {
          portProbeSucceeded = false;
          console.error('Runtime port probe failed before the reattach decision:', error);
        }

        if (cancelled) {
          await stopRemoteWorkspace(runtime, activeWorkspaceId ?? session.id);
          return;
        }

        /*
         * Read the current persisted files revision so the warm-reattach decision
         * can tell "the pod is still current" from "the persisted files changed
         * since this pod was seeded". Fetched on every mount: on a warm remount it
         * gates reattach-vs-reseed; on a cold seed it is the revision we record as
         * the seeded baseline (one lightweight GET, dwarfed by the reseed itself).
         */
        const currentRevision = await fetchPersistedProjectRevision(projectId);

        if (cancelled) {
          await stopRemoteWorkspace(runtime, activeWorkspaceId ?? session.id);
          return;
        }

        /*
         * Le signal « un port sert » vient du SERVEUR, pas du magasin client.
         *
         * Mesuré à l'écran : `previews` est VIDE au montage alors que le serveur
         * répond `serving: true` au même instant. `setRuntime()` remet le magasin
         * à `[]` à chaque configuration de l'adaptateur et relance `watchPorts`
         * en fire-and-forget ; la décision tombe dans cette fenêtre
         * d'hydratation. Interroger la source d'autorité supprime la course.
         *
         * Ce signal reste observationnel — il ne conditionne plus l'adoption
         * (voir `shouldReattachWarmWorkspace`) — mais il doit être JUSTE : c'est
         * lui qu'on lit dans la trace pour diagnostiquer une réouverture.
         */
        const portsFromStore = hasAdoptablePreviewPort(workbenchStore.previews.get());
        const portsFromServer = await fetchAnyPortServing(projectId);
        const canAdoptPort = portsFromServer ?? portsFromStore;

        const reattachWarmWorkspace = shouldReattachWarmWorkspace({
          reused: session.reused === true,
          seededThisSession: sessionAlreadySeeded,
          hasLivePort: canAdoptPort,
          portProbeSucceeded,

          /*
           * The persisted files changed after this pod was seeded (another tab or
           * device edited the project, or the Agent persisted new files, while the
           * warm pod kept the old tree). When KNOWN newer, reattaching would serve
           * a stale runtime — so reseed. Only asserted when BOTH revisions are
           * known; if either is undefined (fetch failed, or first seed of this
           * session) it stays undefined and the marker-only behaviour applies.
           */
          storageNewerThanSeed:
            seededRevision !== undefined && currentRevision !== undefined
              ? currentRevision !== seededRevision
              : undefined,
        });

        /*
         * Trace PERMANENTE des entrées de la décision. L'enquête d'origine a dû
         * déployer une instrumentation ad hoc pour obtenir ces quatre valeurs à
         * l'instant exact du choix : les journaliser une fois par montage coûte
         * une ligne et évite de refaire ce détour au prochain doute.
         */
        console.info('[workspace] reattach decision', {
          reused: session.reused === true,
          seededThisSession: sessionAlreadySeeded,
          hasLivePort: canAdoptPort,
          portProbeSucceeded,
          portsFromStore,
          portsFromServer,
          storeSnapshot: workbenchStore.previews.get().map((preview) => ({
            port: preview.port,
            ready: preview.ready,
            serving: preview.serving,
          })),
          seededRevision,
          currentRevision,
          decision: reattachWarmWorkspace ? 'reattach' : 'reseed',
        });

        if (reattachWarmWorkspace) {
          workbenchStore.appendWorkspaceLog(clientStoresServicesText('clientRuntime.workspace.reattached'));
        } else {
          await workbenchStore.stopPreviewServer().catch((error) => {
            console.error('Previous preview cleanup failed:', error);
            workbenchStore.appendWorkspaceLog(
              clientStoresServicesText('clientRuntime.workspace.previewCleanupSkipped'),
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
                  console.error('Project workspace cleanup failed:', error);
                  workbenchStore.appendWorkspaceLog(clientStoresServicesText('clientRuntime.workspace.cleanupSkipped'));
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
           *
           * La révision est RELUE ici, elle n'est pas celle d'avant le seed.
           * Mesuré en réel : enregistrer la valeur pré-seed créait une seconde
           * boucle auto-entretenue. Le seed et l'hydratation qui le suit font
           * bouger le stockage ; le marqueur portait alors une révision déjà
           * périmée à l'instant où il était écrit, si bien que la réouverture
           * suivante concluait « le stockage a changé » et reseedait — ce qui
           * refaisait bouger le stockage, indéfiniment. Une relecture coûte un
           * GET déjà bon marché, au moment précis où l'état est stabilisé.
           */
          const seededRevisionNow = (await fetchPersistedProjectRevision(projectId)) ?? currentRevision;

          writeSeedMarker(sessionId, seededRevisionNow, Date.now());
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
          console.error('Preview auto-start failed:', error);
          workbenchStore.appendWorkspaceLog(
            clientStoresServicesText('clientRuntime.workspace.previewAutoStartSkipped'),
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

        console.error('Workspace start failed:', error);

        const message = clientStoresServicesText('clientRuntime.workspace.startFailed');
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

        const quotaPrompt = workspaceQuotaPrompt(error, languageRef.current);

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
    throw new Error(
      clientStoresServicesText('clientRuntime.workspace.exportFailed', {
        status: response.status,
      }),
    );
  }

  const archive = new Uint8Array(await response.arrayBuffer());

  if (archive.byteLength === 0) {
    throw new Error(clientStoresServicesText('clientRuntime.workspace.exportEmpty'));
  }

  return archive;
}

async function applyProjectStorageArchive(runtime: RuntimeAdapter, archive: Uint8Array) {
  await runtime.importZip(archive, '.');
  workbenchStore.appendWorkspaceLog(clientStoresServicesText('clientRuntime.workspace.filesSynced'));
}

function normalizeProjectFileSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();

  if (message.includes('401') || message.includes('403') || lower.includes('unauthorized')) {
    return clientStoresServicesText('clientRuntime.workspace.filesAuth');
  }

  if (message.includes('502') || message.includes('503') || lower.includes('fetch failed') || lower.includes('api')) {
    return clientStoresServicesText('clientRuntime.workspace.filesUnavailable');
  }

  return clientStoresServicesText('clientRuntime.workspace.filesFailed');
}

function formatProjectApiError(message: string) {
  const lower = message.toLowerCase();

  if (message.includes('401') || message.includes('403') || lower.includes('unauthorized')) {
    return clientStoresServicesText('clientRuntime.workspace.projectApiAuth');
  }

  if (lower.includes('fetch failed') || lower.includes('connect') || lower.includes('api')) {
    return clientStoresServicesText('clientRuntime.workspace.projectApiUnavailable');
  }

  return clientStoresServicesText('clientRuntime.workspace.projectApiFailed');
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
    console.error('Workspace cleanup failed:', error);
    workbenchStore.appendWorkspaceLog(clientStoresServicesText('clientRuntime.workspace.cleanupSkipped'));
  });
}
