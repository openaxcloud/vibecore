import { useEffect } from 'react';
import type { MetaFunction } from 'react-router';
import { useLoaderData, useRevalidator } from 'react-router';
import {
  buildLogsViewModel,
  formatRuntimeLogLine,
  shouldPollLogs,
  type LogsLoaderData,
  type RuntimeLogLevel,
  type RuntimeLogsSnapshot,
} from './projects.$projectId.logs.view';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import type { ProjectRecord } from '~/lib/project-route.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { statusDisplayLabel } from '~/lib/user-facing-labels';

/* Re-fetch the runtime log buffer this often while a workspace is live. */
const LOG_POLL_INTERVAL_MS = 4000;

export const meta: MetaFunction = () => [{ title: 'Project logs - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader(args: EnterpriseLoaderArgs) {
  const projectId = args.params.projectId;

  if (!projectId) {
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const [projectResult, dashboard] = await Promise.all([
    apiRequest<{ project: ProjectRecord }>(args.request, `/projects/${projectId}`),
    apiRequest<LogsLoaderData>(args.request, `/projects/${projectId}/dashboard`),
  ]);

  const workspaceId = dashboard.workspace?.id;

  /*
   * The dashboard record only carries workspace status, never the dev-server
   * stdout/stderr. Pull the real runtime log buffer from the snapshot endpoint
   * so this page shows live application output rather than a static line.
   */
  let runtimeLogs: RuntimeLogsSnapshot | null = null;

  if (workspaceId) {
    runtimeLogs = await apiRequest<RuntimeLogsSnapshot>(
      args.request,
      `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/logs/snapshot`,
    ).catch((error: unknown) => {
      /*
       * apiRequest rejects with a thrown react-router redirect Response (3xx) on
       * an expired session / MFA-required during a page navigation, and with a
       * 5xx Response on server failures. Those must propagate so the framework
       * performs the login redirect (or the error boundary handles the 5xx)
       * instead of being silently degraded into a dead-end inline log banner.
       */
      if (shouldRethrowActionError(error)) {
        throw error;
      }

      return {
        logs: [],
        error: error instanceof Error ? error.message : 'Unable to load runtime logs.',
      };
    });
  }

  return json({ project: projectResult.project, data: { ...dashboard, runtimeLogs } });
}

const LEVEL_CLASSNAMES: Record<RuntimeLogLevel, string> = {
  info: 'text-bolt-elements-textSecondary',
  warn: 'text-[var(--status-warning-text)]',
  error: 'text-[var(--status-error-text)]',
};

export default function ProjectLogsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const view = buildLogsViewModel(data);
  const polling = shouldPollLogs(data.workspace?.status);

  useEffect(() => {
    if (!polling) {
      return undefined;
    }

    const interval = setInterval(() => {
      if (revalidator.state === 'idle') {
        revalidator.revalidate();
      }
    }, LOG_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [polling, revalidator]);

  return (
    <ProjectShell projectId={project.id} title="Logs" description="Live output from your running project.">
      <div className="mb-3 flex items-center gap-3 text-xs text-bolt-elements-textTertiary">
        {data.workspace ? (
          <span>
            Workspace {statusDisplayLabel(data.workspace.status)}
            {polling ? ' · Live updates' : ''}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => revalidator.revalidate()}
          disabled={revalidator.state !== 'idle'}
          className="rounded-md border border-bolt-elements-borderColor px-2 py-1 text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:opacity-50"
        >
          {revalidator.state === 'idle' ? 'Refresh' : 'Refreshing…'}
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 font-mono text-xs text-bolt-elements-textSecondary">
        {view.kind === 'no-workspace' ? (
          <div className="text-bolt-elements-textTertiary">No workspace has been started for this project yet.</div>
        ) : null}
        {view.kind === 'error' ? (
          <div className="text-[var(--status-error-text)]" role="alert">
            Project logs are temporarily unavailable. Retry to reconnect.
          </div>
        ) : null}
        {view.kind === 'empty' ? (
          <div className="text-bolt-elements-textTertiary">No runtime output captured yet.</div>
        ) : null}

        {/* Runtime log lines are frequently identical; index-qualify the key so duplicates don't collide. */}
        {view.kind === 'logs'
          ? view.entries.map((entry, index) => (
              <div
                key={`${index}-${entry.message}`}
                className={`whitespace-pre-wrap break-all ${LEVEL_CLASSNAMES[entry.level] ?? ''}`}
              >
                {formatRuntimeLogLine(entry)}
              </div>
            ))
          : null}
      </div>
    </ProjectShell>
  );
}
