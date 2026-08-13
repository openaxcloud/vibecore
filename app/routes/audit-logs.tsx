import { useMemo } from 'react';
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
import { isReauthRedirect } from '~/lib/route-reauth';
import { userFacingLabel } from '~/lib/user-facing-labels';

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

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

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
          'content-disposition': `attachment; filename="audit-logs-${stamp}.${format}"`,
          'cache-control': 'no-store',
        },
      });
    } catch (error) {
      if (isForbiddenApiResponse(error)) {
        return redirect('/audit-logs?forbidden=1');
      }

      throw error;
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
    auditLogs = result.auditLogs ?? [];
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
  });
}

const auditTimestampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

function formatTimestamp(value?: string) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 'Date unavailable' : auditTimestampFormatter.format(date);
}

const exportLinkClass =
  'inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3';

export default function AuditLogsPage() {
  const { auditLogs, listError, listErrorKind, forbidden } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';

  /*
   * Distinct action names drive a client-side action filter over the already
   * loaded page. This keeps the loader a single API round-trip while giving the
   * common "show me only role.update events" narrowing without a new endpoint.
   */
  const actions = useMemo(
    () => Array.from(new Set(auditLogs.map((row) => row.action).filter(Boolean))).sort() as string[],
    [auditLogs],
  );

  if (listError) {
    return (
      <EnterpriseFormPage
        title="Audit logs"
        description="Review and export security-relevant organization events to CSV or JSON."
      >
        {retrying ? (
          <AsyncPanelSkeleton label="Loading audit logs" rows={6} />
        ) : (
          <AsyncPanelError
            title={listErrorKind === 'permission' ? 'Audit logs are restricted' : 'Audit logs could not load'}
            description={
              listErrorKind === 'permission'
                ? 'Ask an organization administrator for access to the organization audit trail.'
                : 'Events and exports are hidden because the latest request failed. No audit data was changed.'
            }
            onRetry={revalidator.revalidate}
            retryLabel="Reload audit logs"
            tone={listErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </EnterpriseFormPage>
    );
  }

  return (
    <EnterpriseFormPage
      title="Audit logs"
      description="Review and export security-relevant organization events to CSV or JSON. Route deliveries to a SIEM from the SIEM webhooks page."
      error={
        forbidden
          ? 'You do not have permission to export audit logs. Ask an organization admin for audit log export access.'
          : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Export</h2>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Download the full audit trail. Your signed-in account is used to prepare the export securely.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className={exportLinkClass} href="/audit-logs?export=csv" download data-testid="audit-export-csv">
              <span className="i-ph:file-csv" aria-hidden />
              Export CSV
            </a>
            <a className={exportLinkClass} href="/audit-logs?export=json" download data-testid="audit-export-json">
              <span className="i-ph:file-text" aria-hidden />
              Export JSON
            </a>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Recent events</h2>
            {actions.length > 0 ? (
              <label className="ml-auto flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                Action
                <select
                  className="min-h-[44px] rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs outline-none focus:border-bolt-elements-focus"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    document.querySelectorAll<HTMLTableRowElement>('[data-audit-row]').forEach((row) => {
                      row.hidden = value !== '' && row.dataset.action !== value;
                    });
                  }}
                  data-testid="audit-action-filter"
                >
                  <option value="">All actions</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {userFacingLabel(action, 'Recorded action')}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {auditLogs.length === 0 ? (
            <p className="rounded-md border border-bolt-elements-borderColor px-3 py-4 text-sm text-bolt-elements-textSecondary">
              No audit events recorded yet for this organization.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-bolt-elements-borderColor">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Resource</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((row, index) => (
                    <tr
                      key={`${row.createdAt ?? ''}-${row.action ?? ''}-${index}`}
                      data-audit-row
                      data-action={row.action ?? ''}
                      className="border-t border-bolt-elements-borderColor align-top"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-bolt-elements-textSecondary">
                        {formatTimestamp(row.createdAt)}
                      </td>
                      <td className="px-3 py-2 font-medium text-bolt-elements-textPrimary">
                        {row.action ? userFacingLabel(row.action, 'Recorded action') : '—'}
                      </td>
                      <td className="px-3 py-2 text-bolt-elements-textSecondary">
                        {row.resourceType ? userFacingLabel(row.resourceType, 'Resource') : '—'}
                      </td>
                      <td className="px-3 py-2 text-bolt-elements-textSecondary">
                        {row.actorUserId ? 'Organization member' : 'System'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-bolt-elements-textSecondary">
                        {row.ipAddress ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-bolt-elements-textSecondary">
          <a className="underline hover:text-bolt-elements-textPrimary" href="/organization-siem">
            Configure SIEM webhooks
          </a>
        </p>
      </div>
    </EnterpriseFormPage>
  );
}
