import { useMemo, useState } from 'react';

/**
 * Lignes rendues par page. Assez pour remplir un écran défilable, assez peu
 * pour que le navigateur ne cale pas : le journal peut ramener 2000 lignes.
 */
const AUDIT_LOGS_PAGE_SIZE = 50;
import type { MetaFunction } from 'react-router';
import { useLoaderData, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  firstOrganizationOrNull,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  auditActionLabel,
  auditResourceLabel,
  formatAuditEventCount,
  formatAuditLogsCopy,
  formatAuditTimestamp,
  getAuditLogsCopy,
  resolveAuditLogsLanguage,
  type AuditLogsCopy,
  type AuditLogsLanguage,
} from '~/lib/i18n/catalogs/audit-logs';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

/*
 * A stored audit event, matching the columns the API's `auditEventsToCsv` emits
 * (services/api/src/app.ts). `createdAt` is added by the store when the row is
 * persisted; the rest come from the `AuditEvent` shape in `@vibecore/audit`.
 */
interface AuditLogRow {
  createdAt?: string;
  organizationId?: string;
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

const EXPORT_FORMATS = new Set(['csv', 'json']);

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getAuditLogsCopy(rootData?.language);
  const title = copy['auditLogs.metaTitle'];
  const description = copy['auditLogs.metaDescription'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

function pageUrl(language: AuditLogsLanguage, state?: 'forbidden' | 'exportError'): string {
  const params = new URLSearchParams();

  if (state) {
    params.set(state, '1');
  }

  if (language === 'fr') {
    params.set('lang', 'fr');
  }

  const query = params.toString();

  return query ? `/audit-logs?${query}` : '/audit-logs';
}

function exportUrl(format: 'csv' | 'json', language: AuditLogsLanguage): string {
  const params = new URLSearchParams({ export: format });

  if (language === 'fr') {
    params.set('lang', 'fr');
  }

  return `/audit-logs?${params.toString()}`;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveAuditLogsLanguage(resolveRequestLocale(request).language);
  const copy = getAuditLogsCopy(language);

  let organization: Awaited<ReturnType<typeof firstOrganizationOrNull>>;

  try {
    organization = await firstOrganizationOrNull(request);
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return json({
      orgId: '',
      auditLogs: [],
      listError: true,
      listErrorKind: 'temporary' as const,
      forbidden: false,
      exportError: false,
      language,
    });
  }

  if (!organization) {
    return redirect('/');
  }

  const url = new URL(request.url);
  const exportFormat = url.searchParams.get('export');

  /*
   * Export is served FROM the loader, not a raw browser anchor: the API base
   * URL is server-only (can be an internal cluster host) and the request must
   * carry the session cookie as a bearer token. So we fetch the export here
   * over the same authenticated channel every other loader uses, then stream
   * it back as a downloadable attachment — mirroring the admin audit export
   * (app/routes/admin.$section.tsx). Export is gated on `audit:export` by the
   * API; a 403 surfaces as a friendly page below rather than a file download.
   */
  if (exportFormat && EXPORT_FORMATS.has(exportFormat)) {
    const format = exportFormat === 'csv' ? 'csv' : 'json';

    try {
      const result = await apiRequest<unknown>(request, `/orgs/${organization.id}/audit-logs/export?format=${format}`, {
        redirectOn401: true,
      });

      const body =
        format === 'csv'
          ? typeof result === 'string'
            ? result
            : String(result ?? '')
          : JSON.stringify(result, null, 2);

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

      return new Response(body, {
        headers: {
          'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${copy['auditLogs.export.fileName']}-${stamp}.${format}"`,
          'cache-control': 'no-store',
        },
      });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      if (isForbiddenApiResponse(error)) {
        return redirect(pageUrl(language, 'forbidden'));
      }

      return redirect(pageUrl(language, 'exportError'));
    }
  }

  /*
   * Listing is gated on `org:read` by the API. Export requires the stronger
   * `audit:export`; a member without it still sees the table, and the export
   * buttons yield a friendly 403 page rather than an opaque download error.
   */
  let auditLogs: AuditLogRow[] = [];
  let listError = false;
  let listErrorKind: 'permission' | 'temporary' | null = null;

  try {
    const result = await apiRequest<{ auditLogs?: AuditLogRow[] }>(request, `/orgs/${organization.id}/audit-logs`);
    auditLogs = Array.isArray(result.auditLogs) ? result.auditLogs : [];
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isForbiddenApiResponse(error)) {
      return json({
        orgId: organization.id,
        auditLogs: [],
        listError: true,
        listErrorKind: 'permission' as const,
        forbidden: false,
        exportError: false,
        language,
      });
    }

    listError = true;
    listErrorKind = 'temporary';
  }

  return json({
    orgId: organization.id,
    auditLogs,
    listError,
    listErrorKind,
    forbidden: url.searchParams.get('forbidden') === '1',
    exportError: url.searchParams.get('exportError') === '1',
    language,
  });
}

const exportLinkClass =
  'inline-flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-center text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus';

function IdentifierLabel({ raw, label }: { raw: string | undefined; label: string }) {
  if (raw && raw === label) {
    return <code className="break-all font-mono text-[0.7rem]">{raw}</code>;
  }

  return <>{label}</>;
}

function AuditEventCard({
  row,
  copy,
  language,
}: {
  row: AuditLogRow;
  copy: AuditLogsCopy;
  language: AuditLogsLanguage;
}) {
  const action = auditActionLabel(row.action, language);
  const resource = auditResourceLabel(row.resourceType, language);

  return (
    <li className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
      <dl className="grid min-w-0 gap-3 text-xs">
        <div className="min-w-0">
          <dt className="font-medium text-bolt-elements-textSecondary">{copy['auditLogs.table.time']}</dt>
          <dd className="mt-1 break-words text-bolt-elements-textPrimary">
            {formatAuditTimestamp(row.createdAt, language)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-medium text-bolt-elements-textSecondary">{copy['auditLogs.table.action']}</dt>
          <dd className="mt-1 break-words font-medium text-bolt-elements-textPrimary">
            <IdentifierLabel raw={row.action} label={action} />
          </dd>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <div className="min-w-0">
            <dt className="font-medium text-bolt-elements-textSecondary">{copy['auditLogs.table.resource']}</dt>
            <dd className="mt-1 break-words text-bolt-elements-textPrimary">
              <IdentifierLabel raw={row.resourceType} label={resource} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-medium text-bolt-elements-textSecondary">{copy['auditLogs.table.actor']}</dt>
            <dd className="mt-1 break-words text-bolt-elements-textPrimary">
              {row.actorUserId ? copy['auditLogs.actor.member'] : copy['auditLogs.actor.system']}
            </dd>
          </div>
        </div>
        <div className="min-w-0">
          <dt className="font-medium text-bolt-elements-textSecondary">{copy['auditLogs.table.ip']}</dt>
          <dd className="mt-1 break-all font-mono text-bolt-elements-textPrimary">{row.ipAddress ?? '—'}</dd>
        </div>
      </dl>
    </li>
  );
}

export default function AuditLogsPage() {
  const {
    auditLogs,
    listError,
    listErrorKind,
    forbidden,
    exportError,
    language: loaderLanguage,
  } = useLoaderData<typeof loader>();

  const language = resolveAuditLogsLanguage(loaderLanguage);
  const copy = getAuditLogsCopy(language);
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';
  const [selectedAction, setSelectedAction] = useState('');

  /*
   * Distinct action names drive a client-side action filter over the already
   * loaded page. This keeps the loader a single API round-trip while giving the
   * common "show me only role.update events" narrowing without a new endpoint.
   */
  const actions = useMemo(
    () =>
      Array.from(
        new Set(auditLogs.map((row) => row.action?.trim()).filter((action): action is string => Boolean(action))),
      ).sort((left, right) => auditActionLabel(left, language).localeCompare(auditActionLabel(right, language))),
    [auditLogs, language],
  );
  const visibleLogs = useMemo(
    () => (selectedAction ? auditLogs.filter((row) => row.action === selectedAction) : auditLogs),
    [auditLogs, selectedAction],
  );

  /*
   * Le rendu est PAGINÉ, pas seulement plafonné côté données.
   *
   * Le store borne déjà la requête à 2000 lignes, mais 2000 lignes rendues d'un
   * coup — une carte par ligne en mobile, une rangée de tableau en desktop —
   * suffisent à figer l'onglet pendant plusieurs secondes à l'ouverture de la
   * page. Le plafond de données protège le serveur ; il ne protège pas le
   * navigateur.
   *
   * 50 lignes par page tiennent dans un écran défilable sans coût de mise en
   * page perceptible, et le filtre par action reste appliqué AVANT la
   * pagination — filtrer réduit donc le nombre de pages, comme on s'y attend.
   */
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(visibleLogs.length / AUDIT_LOGS_PAGE_SIZE));

  /*
   * Changer de filtre remet au début : rester en page 7 d'un résultat qui n'en
   * compte plus que 2 afficherait un tableau vide sans rien expliquer.
   */
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * AUDIT_LOGS_PAGE_SIZE;

  const pagedLogs = useMemo(
    () => visibleLogs.slice(pageStart, pageStart + AUDIT_LOGS_PAGE_SIZE),
    [visibleLogs, pageStart],
  );

  if (listError) {
    return (
      <EnterpriseFormPage title={copy['auditLogs.title']} description={copy['auditLogs.description']}>
        {retrying ? (
          <AsyncPanelSkeleton label={copy['auditLogs.load.loading']} rows={6} />
        ) : (
          <AsyncPanelError
            title={
              listErrorKind === 'permission'
                ? copy['auditLogs.load.permissionTitle']
                : copy['auditLogs.load.errorTitle']
            }
            description={
              listErrorKind === 'permission'
                ? copy['auditLogs.load.permissionDescription']
                : copy['auditLogs.load.errorDescription']
            }
            onRetry={revalidator.revalidate}
            retryLabel={copy['auditLogs.load.retry']}
            tone={listErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </EnterpriseFormPage>
    );
  }

  return (
    <EnterpriseFormPage
      title={copy['auditLogs.title']}
      description={copy['auditLogs.description']}
      error={
        forbidden
          ? copy['auditLogs.error.exportForbidden']
          : exportError
            ? copy['auditLogs.error.exportFailed']
            : undefined
      }
    >
      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
              {copy['auditLogs.export.title']}
            </h2>
            <p className="mt-1 break-words text-xs text-bolt-elements-textSecondary">
              {copy['auditLogs.export.description']}
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <a className={exportLinkClass} href={exportUrl('csv', language)} download data-testid="audit-export-csv">
              <span className="i-ph:file-csv" aria-hidden />
              {copy['auditLogs.export.csv']}
            </a>
            <a className={exportLinkClass} href={exportUrl('json', language)} download data-testid="audit-export-json">
              <span className="i-ph:file-text" aria-hidden />
              {copy['auditLogs.export.json']}
            </a>
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
                {copy['auditLogs.recent.title']}
              </h2>
              {auditLogs.length > 0 ? (
                <p className="mt-1 text-xs text-bolt-elements-textSecondary" aria-live="polite">
                  {formatAuditEventCount(visibleLogs.length, language)}
                </p>
              ) : null}
            </div>
            {actions.length > 0 ? (
              <label className="grid min-w-0 gap-1 text-xs text-bolt-elements-textSecondary sm:w-auto sm:min-w-[220px]">
                {copy['auditLogs.filter.action']}
                <select
                  className="min-h-[44px] min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
                  value={selectedAction}
                  onChange={(event) => {
                    setSelectedAction(event.currentTarget.value);

                    /*
                     * Filtrer réduit le nombre de pages : rester en page 7 d'un
                     * résultat qui n'en compte plus que 2 afficherait un tableau
                     * vide sans rien expliquer.
                     */
                    setPage(0);
                  }}
                  data-testid="audit-action-filter"
                >
                  <option value="">{copy['auditLogs.filter.all']}</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {auditActionLabel(action, language)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {auditLogs.length === 0 || visibleLogs.length === 0 ? (
            <p className="rounded-md border border-bolt-elements-borderColor px-3 py-4 text-sm text-bolt-elements-textSecondary">
              {auditLogs.length === 0 ? copy['auditLogs.empty'] : copy['auditLogs.emptyFiltered']}
            </p>
          ) : (
            <>
              <ul className="grid gap-3 md:hidden" aria-label={copy['auditLogs.table.aria']}>
                {pagedLogs.map((row, index) => (
                  <AuditEventCard
                    key={`${row.createdAt ?? ''}-${row.action ?? ''}-${index}`}
                    row={row}
                    copy={copy}
                    language={language}
                  />
                ))}
              </ul>
              <div
                className="hidden overflow-x-auto rounded-md border border-bolt-elements-borderColor md:block"
                tabIndex={0}
                role="region"
                aria-label={copy['auditLogs.table.aria']}
              >
                <table className="w-full min-w-[680px] text-left text-xs">
                  <caption className="sr-only">{copy['auditLogs.table.aria']}</caption>
                  <thead className="bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                    <tr>
                      <th className="px-3 py-2 font-medium">{copy['auditLogs.table.time']}</th>
                      <th className="px-3 py-2 font-medium">{copy['auditLogs.table.action']}</th>
                      <th className="px-3 py-2 font-medium">{copy['auditLogs.table.resource']}</th>
                      <th className="px-3 py-2 font-medium">{copy['auditLogs.table.actor']}</th>
                      <th className="px-3 py-2 font-medium">{copy['auditLogs.table.ip']}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLogs.map((row, index) => {
                      const action = auditActionLabel(row.action, language);
                      const resource = auditResourceLabel(row.resourceType, language);

                      return (
                        <tr
                          key={`${row.createdAt ?? ''}-${row.action ?? ''}-${index}`}
                          className="border-t border-bolt-elements-borderColor align-top"
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-bolt-elements-textSecondary">
                            {formatAuditTimestamp(row.createdAt, language)}
                          </td>
                          <td className="px-3 py-2 font-medium text-bolt-elements-textPrimary">
                            <IdentifierLabel raw={row.action} label={action} />
                          </td>
                          <td className="px-3 py-2 text-bolt-elements-textSecondary">
                            <IdentifierLabel raw={row.resourceType} label={resource} />
                          </td>
                          <td className="px-3 py-2 text-bolt-elements-textSecondary">
                            {row.actorUserId ? copy['auditLogs.actor.member'] : copy['auditLogs.actor.system']}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-bolt-elements-textSecondary">
                            {row.ipAddress ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pageCount > 1 && (
                <nav
                  className="flex flex-wrap items-center justify-between gap-3 pt-1"
                  aria-label={copy['auditLogs.pagination.aria']}
                >
                  {/*
                    `aria-live="polite"` : au changement de page, un lecteur d'écran
                    doit entendre où il se trouve. Sans cela, seul le focus change et
                    la liste se renouvelle en silence.
                  */}
                  <p className="text-xs text-bolt-elements-textSecondary" aria-live="polite">
                    {formatAuditLogsCopy(copy['auditLogs.pagination.status'], {
                      from: formatUserAreaNumber(pageStart + 1, undefined, language),
                      to: formatUserAreaNumber(pageStart + pagedLogs.length, undefined, language),
                      total: formatUserAreaNumber(visibleLogs.length, undefined, language),
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {formatAuditLogsCopy(copy['auditLogs.pagination.page'], {
                        page: formatUserAreaNumber(safePage + 1, undefined, language),
                        pages: formatUserAreaNumber(pageCount, undefined, language),
                      })}
                    </span>
                    {/*
                      44px de haut : cible tactile conforme sur mobile comme sur
                      tablette. `disabled` plutôt que masqué — un bouton qui
                      disparaît fait sauter la mise en page à la première et à la
                      dernière page.
                    */}
                    <button
                      type="button"
                      className="min-h-[44px] rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setPage((current) => Math.max(0, current - 1))}
                      disabled={safePage === 0}
                    >
                      {copy['auditLogs.pagination.previous']}
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                      disabled={safePage >= pageCount - 1}
                    >
                      {copy['auditLogs.pagination.next']}
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </section>

        <p className="text-xs text-bolt-elements-textSecondary">
          <a
            className="underline hover:text-bolt-elements-textPrimary"
            href={language === 'fr' ? '/organization-siem?lang=fr' : '/organization-siem'}
          >
            {copy['auditLogs.siem']}
          </a>
        </p>
      </div>
    </EnterpriseFormPage>
  );
}
