import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { getDiskInfo } from '~/lib/.server/disk-info';
import { requireWebSession } from '~/lib/.server/require-session';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

const errorResponse = (error: unknown) =>
  json(
    [
      {
        filesystem: 'Unknown',
        size: 0,
        used: 0,
        available: 0,
        percentage: 0,
        mountpoint: '/',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    ],
    { status: 500 },
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
    return json(await getDiskInfo());
  } catch (error) {
    console.error('Failed to get disk info:', error);
    return errorResponse(error);
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
