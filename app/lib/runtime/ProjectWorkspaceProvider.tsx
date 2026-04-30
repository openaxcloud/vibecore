import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { CommandEvent, FileNode, RuntimeAdapter } from '@vibecore/runtime-contract';
import { RuntimeError } from '@vibecore/runtime-contract';
import { createRuntimeAdapter, getRuntimeMode, RuntimeAdapterProvider } from '~/lib/runtime/RuntimeAdapterProvider';
import { workbenchStore } from '~/lib/stores/workbench';

export interface ProjectWorkspaceProviderProps extends PropsWithChildren {
  projectId: string;
  adapter?: RuntimeAdapter;
}

export function ProjectWorkspaceProvider({ projectId, adapter, children }: ProjectWorkspaceProviderProps) {
  const runtime = useMemo(() => adapter ?? createRuntimeAdapter(getRuntimeMode(), { projectId }), [adapter, projectId]);
  const [logsExpanded, setLogsExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stopLogs: (() => void) | undefined;

    async function startWorkspace() {
      workbenchStore.configureRuntime(runtime);
      workbenchStore.workspaceLoading.set(true);
      workbenchStore.workspaceError.set(undefined);
      workbenchStore.workspaceLogs.set([]);
      workbenchStore.quotaWarning.set(undefined);
      workbenchStore.billingUpgradePrompt.set(undefined);
      workbenchStore.setSelectedFile(undefined);
      workbenchStore.currentView.set('code');

      try {
        await runtime.boot();

        const session = await runtime.startWorkspace({ id: projectId, metadata: { projectId } });

        if (cancelled) {
          return;
        }

        workbenchStore.workspaceStatus.set(session);
        await seedRuntimeFromProjectStorage(projectId, runtime).catch((error) => {
          workbenchStore.appendWorkspaceLog(
            error instanceof Error ? `Project file sync skipped: ${error.message}` : 'Project file sync skipped',
          );
        });
        await workbenchStore.loadRuntimeFiles('.');
        await workbenchStore.refreshRuntimePorts().catch(() => undefined);

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
    };
  }, [projectId, runtime]);

  return (
    <RuntimeAdapterProvider adapter={runtime} projectId={projectId}>
      <ProjectWorkspaceBanner logsExpanded={logsExpanded} onToggleLogs={() => setLogsExpanded((value) => !value)} />
      {children}
    </RuntimeAdapterProvider>
  );
}

async function seedRuntimeFromProjectStorage(projectId: string, runtime: RuntimeAdapter) {
  const existingFiles = await runtime.listFiles('.').catch(() => []);

  if (!isRuntimeTreeEmpty(existingFiles)) {
    return;
  }

  const response = await fetch(`/api/projects/${projectId}/project-action?intent=export`, {
    credentials: 'include',
    headers: { accept: 'application/zip' },
  });

  if (!response.ok) {
    throw new Error(`export returned ${response.status}`);
  }

  const archive = new Uint8Array(await response.arrayBuffer());

  if (archive.byteLength === 0) {
    return;
  }

  await runtime.importZip(archive, '.');
  workbenchStore.appendWorkspaceLog('Project files synced into workspace runtime');
}

function isRuntimeTreeEmpty(nodes: FileNode[]): boolean {
  if (nodes.length === 0) {
    return true;
  }

  return nodes.every((node) => node.type === 'directory' && (!node.children || isRuntimeTreeEmpty(node.children)));
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
