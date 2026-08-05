import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { getDiskInfo } from '~/lib/.server/disk-info';
import { requireWebSession } from '~/lib/.server/require-session';
import { remainingApiLocaleHeaders, remainingApiRouteMessage } from '~/lib/i18n/catalogs/remaining-api-routes';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

const errorResponse = (request: Request) =>
  json(
    [
      {
        filesystem: remainingApiRouteMessage(request, 'diskFilesystemUnknown'),
        size: 0,
        used: 0,
        available: 0,
        percentage: 0,
        mountpoint: '/',
        timestamp: new Date().toISOString(),
        error: remainingApiRouteMessage(request, 'DISK_INFO_FAILED'),
        code: 'DISK_INFO_FAILED',
      },
    ],
    { status: 500, headers: remainingApiLocaleHeaders(request) },
  );

/**
 * Disk-info is host/container introspection: it returns real filesystem names,
 * mountpoints and capacity and forks a `df`/PowerShell subprocess on every hit.
 * It must NOT be reachable anonymously on a managed deployment (it leaks the
 * container disk topology and is a cheap subprocess-spawn DoS vector). Require a
 * valid web session BEFORE touching getDiskInfo() — requireWebSession fails
 * closed (throws a 401/503 Response), so an unauthenticated caller never reaches
 * the subprocess. Rate limiting + method allowlisting come from withSecurity,
 * matching the other /api routes.
 */
async function diskInfoHandler({ request }: ActionFunctionArgs | LoaderFunctionArgs): Promise<Response> {
  /*
   * requireWebSession throws a 401/503 Response for unauthenticated/unverifiable
   * callers, short-circuiting before any subprocess. withSecurity's catch would
   * otherwise rewrite that into a generic 500, so surface the auth Response as-is.
   */
  try {
    await requireWebSession(request);
  } catch (authResponse) {
    if (authResponse instanceof Response) {
      return authResponse;
    }

    throw authResponse;
  }

  try {
    return json(await getDiskInfo(resolveRequestLocale(request).language), {
      headers: remainingApiLocaleHeaders(request),
    });
  } catch (error) {
    console.error('Failed to get disk info:', error);
    return errorResponse(request);
  }
}

export const loader = withSecurity(diskInfoHandler, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

export const action = withSecurity(diskInfoHandler, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
