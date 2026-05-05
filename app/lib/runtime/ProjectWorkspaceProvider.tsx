import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { CommandEvent, RuntimeAdapter } from '@vibecore/runtime-contract';
import { RuntimeError } from '@vibecore/runtime-contract';
import { createRuntimeAdapter, getRuntimeMode, RuntimeAdapterProvider } from '~/lib/runtime/RuntimeAdapterProvider';
import { workbenchStore } from '~/lib/stores/workbench';

export interface ProjectWorkspaceProviderProps extends PropsWithChildren {
  projectId: string;
  adapter?: RuntimeAdapter;
  initialError?: string;
}

export function ProjectWorkspaceProvider({
  projectId,
  adapter,
  initialError,
  children,
}: ProjectWorkspaceProviderProps) {
  const runtime = useMemo(() => adapter ?? createRuntimeAdapter(getRuntimeMode(), { projectId }), [adapter, projectId]);
  const [logsExpanded, setLogsExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stopLogs: (() => void) | undefined;
    let activeWorkspaceId: string | undefined;

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

      try {
        await runtime.boot();

        const session = await runtime.startWorkspace({ id: projectId, metadata: { projectId } });
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
          await seedRuntimeFromProjectStorage(projectId, runtime);
        } catch (error) {
          const message = normalizeProjectFileSyncError(error);

          workbenchStore.workspaceError.set(message);
          workbenchStore.appendWorkspaceLog(message);

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
      void workbenchStore.stopPreviewServer().catch(() => undefined);
      void stopRemoteWorkspace(runtime, activeWorkspaceId ?? projectId);
      workbenchStore.configureProject(undefined);
    };
  }, [initialError, projectId, runtime]);

  return (
    <RuntimeAdapterProvider adapter={runtime} projectId={projectId}>
      <ProjectWorkspaceBanner logsExpanded={logsExpanded} onToggleLogs={() => setLogsExpanded((value) => !value)} />
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

function ProjectWorkspaceBanner({ logsExpanded, onToggleLogs }: { logsExpanded: boolean; onToggleLogs: () => void }) {
  const loading = useStore(workbenchStore.workspaceLoading);
  const error = useStore(workbenchStore.workspaceError);
  const status = useStore(workbenchStore.workspaceStatus);
  const logs = useStore(workbenchStore.workspaceLogs);
  const quotaWarning = useStore(workbenchStore.quotaWarning);
  const billingUpgradePrompt = useStore(workbenchStore.billingUpgradePrompt);

  if (!loading && !error && !status && !quotaWarning) {
    return null;
  }

  return (
    <div className="relative z-20 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 text-sm text-bolt-elements-textPrimary">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">Workspace</span>
        <span>{loading ? 'Starting workspace...' : (status?.status ?? 'not started')}</span>
        {status?.status && <span className="sr-only">{`Workspace ${status.status}`}</span>}
        {quotaWarning && <span className="text-bolt-elements-textSecondary">{quotaWarning}</span>}
        {billingUpgradePrompt && <span className="text-bolt-elements-item-contentAccent">{billingUpgradePrompt}</span>}
        {error && <span className="text-red-500">{error}</span>}
        {logs.length > 0 && (
          <button className="underline" type="button" onClick={onToggleLogs}>
            {logsExpanded ? 'Hide logs' : 'Show logs'}
          </button>
        )}
      </div>
      {logsExpanded && logs.length > 0 && (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-bolt-elements-background-depth-1 p-2 text-xs">
          {logs.join('\n')}
        </pre>
      )}
    </div>
  );
}
