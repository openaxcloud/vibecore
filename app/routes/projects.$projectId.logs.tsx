import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatProjectLogsCopy, getProjectLogsCopy, projectLogsStatusLabel } from '~/lib/i18n/catalogs/project-logs';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import type { ProjectRecord } from '~/lib/project-route.server';
import { isReauthRedirect } from '~/lib/route-reauth';

/* Re-fetch the runtime log buffer this often while a workspace is live. */
const LOG_POLL_INTERVAL_MS = 4000;

export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getProjectLogsCopy(language);
  const title = copy['projectLogs.meta.title'];
  const description = copy['projectLogs.meta.description'];
  const canonical = `https://e-code.ai/projects/${encodeURIComponent(params.projectId ?? '')}/logs`;
  const french = language === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader(args: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(args.request);
  const projectId = args.params.projectId;

  if (!projectId) {
    throw json(
      { ok: false, errorCode: 'projectNotFound' },
      { status: 404, headers: localeResponseHeaders(args.request, localeResolution) },
    );
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
       * an expired session. Authentication responses must propagate so the
       * framework performs the login redirect; runtime failures become a safe,
       * recoverable inline state without forwarding upstream diagnostics.
       */
      if (isReauthRedirect(error) || (error instanceof Response && error.status === 401)) {
        throw error;
      }

      return {
        logs: [],
        unavailable: true,
      };
    });
  }

  return json(
    { language: localeResolution.language, project: projectResult.project, data: { ...dashboard, runtimeLogs } },
    { headers: localeResponseHeaders(args.request, localeResolution) },
  );
}

const LEVEL_CLASSNAMES: Record<RuntimeLogLevel, string> = {
  info: 'text-bolt-elements-textSecondary',
  warn: 'text-[var(--status-warning-text)]',
  error: 'text-[var(--status-error-text)]',
};

export default function ProjectLogsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getProjectLogsCopy(language);
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
    <ProjectShell
      projectId={project.id}
      title={copy['projectLogs.page.title']}
      description={copy['projectLogs.page.description']}
    >
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-3 text-xs text-bolt-elements-textTertiary">
        {data.workspace ? (
          <span className="min-w-0 break-words">
            {formatProjectLogsCopy(copy['projectLogs.workspace.status'], {
              status: projectLogsStatusLabel(data.workspace.status, language),
            })}
            {polling ? ` · ${copy['projectLogs.workspace.live']}` : ''}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => revalidator.revalidate()}
          disabled={revalidator.state !== 'idle'}
          className="min-h-11 min-w-11 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:opacity-50"
          aria-busy={revalidator.state !== 'idle'}
        >
          {revalidator.state === 'idle' ? copy['projectLogs.actions.refresh'] : copy['projectLogs.actions.refreshing']}
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 font-mono text-xs text-bolt-elements-textSecondary">
        {view.kind === 'no-workspace' ? (
          <div className="text-bolt-elements-textTertiary">{copy['projectLogs.state.noWorkspace']}</div>
        ) : null}
        {view.kind === 'error' ? (
          <div className="text-[var(--status-error-text)]" role="alert">
            {copy['projectLogs.state.unavailable']}
          </div>
        ) : null}
        {view.kind === 'empty' ? (
          <div className="text-bolt-elements-textTertiary">{copy['projectLogs.state.empty']}</div>
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
