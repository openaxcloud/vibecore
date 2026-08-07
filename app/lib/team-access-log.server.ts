import { apiRequest, isForbiddenApiResponse, json, redirect } from '~/lib/enterprise-api.server';
import type { SupportedLanguage } from '~/lib/i18n/language';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

/*
 * F17: Team access log. A "team" is an organization in this platform, so the
 * team access log is the org's immutable AuditLog trail scoped to the team id.
 * This module is the shared server half behind both the team overview
 * (`teams.$id.tsx`) and the team settings (`teams.$id.settings.tsx`) routes so
 * the panel behaves identically wherever it is surfaced. It mirrors the D4 org
 * audit-log route (`app/routes/audit-logs.tsx`): listing is gated on `org:read`,
 * export on the stronger `audit:export`, and the export is streamed FROM the
 * loader over the session cookie — never a raw anchor to the API host.
 */

/*
 * A stored access-log entry, matching the columns the API's `auditEventsToCsv`
 * emits (services/api/src/app.ts). `createdAt` is added by the store on persist.
 */
export interface TeamAccessLogRow {
  createdAt?: string;
  organizationId?: string;
  actorUserId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface TeamAccessLogData {
  language?: SupportedLanguage;
  teamId: string;
  basePath: string;
  entries: TeamAccessLogRow[];
  listError: boolean;
  forbidden: boolean;
}

const EXPORT_FORMATS = new Set(['csv', 'json']);

/*
 * Resolve the team access log for a route loader. `basePath` is the route's own
 * path (e.g. `/teams/:id` or `/teams/:id/settings`) so the export links and the
 * friendly-403 redirect stay on whichever route rendered the panel. Returns a
 * downloadable `Response` for `?export=csv|json`, otherwise a data payload for
 * the panel. Never throws for auth/permission failures — those surface as a
 * friendly page (redirect for signed-out via apiRequest, forbidden flag for 403).
 */
export async function loadTeamAccessLog(request: Request, teamId: string, basePath: string) {
  const localeResolution = resolveRequestLocale(request);
  const url = new URL(request.url);
  const exportFormat = url.searchParams.get('export');

  if (exportFormat && EXPORT_FORMATS.has(exportFormat)) {
    const format = exportFormat === 'csv' ? 'csv' : 'json';

    try {
      const result = await apiRequest<unknown>(
        request,
        `/teams/${encodeURIComponent(teamId)}/access-log/export?format=${format}`,
        { redirectOn401: true },
      );

      const body =
        format === 'csv'
          ? typeof result === 'string'
            ? result
            : String(result ?? '')
          : JSON.stringify(result, null, 2);

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

      const headers = localeResponseHeaders(request, localeResolution);

      headers.set('content-type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
      headers.set('content-disposition', `attachment; filename="team-access-log-${teamId}-${stamp}.${format}"`);
      headers.set('cache-control', 'no-store');

      return new Response(body, { headers });
    } catch (error) {
      if (isForbiddenApiResponse(error)) {
        return redirect(`${basePath}?forbidden=1`, {
          headers: localeResponseHeaders(request, localeResolution),
        });
      }

      throw error;
    }
  }

  let entries: TeamAccessLogRow[] = [];
  let listError = false;

  try {
    const result = await apiRequest<{ accessLog?: TeamAccessLogRow[] }>(
      request,
      `/teams/${encodeURIComponent(teamId)}/access-log`,
    );
    entries = result.accessLog ?? [];
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json(
        {
          language: localeResolution.language,
          teamId,
          basePath,
          entries: [],
          listError: false,
          forbidden: true,
        } satisfies TeamAccessLogData,
        { headers: localeResponseHeaders(request, localeResolution) },
      );
    }

    listError = true;
  }

  return json(
    {
      language: localeResolution.language,
      teamId,
      basePath,
      entries,
      listError,
      forbidden: url.searchParams.get('forbidden') === '1',
    } satisfies TeamAccessLogData,
    { headers: localeResponseHeaders(request, localeResolution) },
  );
}
