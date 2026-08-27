import { type ActionFunctionArgs } from 'react-router';
import { resolveConnectorToken } from '~/lib/connectors/connector-token.server';
import { getApiRuntimeRoutesCopy } from '~/lib/i18n/catalogs/api-runtime-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.supabase.query');

export async function action({ request }: ActionFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);

  const responseHeaders = (initial?: HeadersInit) => {
    const headers = localeResponseHeaders(request, localeResolution);

    new Headers(initial).forEach((value, key) => headers.set(key, value));

    return headers;
  };
  const jsonResponse = (data: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(data), {
      ...init,
      headers: responseHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...init?.headers }),
    });

  if (request.method !== 'POST') {
    return new Response(copy['apiRuntime.generic.methodNotAllowed'], {
      status: 405,
      headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8', Allow: 'POST' }),
    });
  }

  try {
    const authHeader = request.headers.get('Authorization');

    /*
     * Cross-device: prefer the server-decrypted UserConnection token over the
     * Authorization header (which carries the localStorage token). Falls back to
     * the header when the user has no active server connection.
     */
    const serverToken = await resolveConnectorToken(request, 'supabase');
    const upstreamAuth = serverToken ? `Bearer ${serverToken}` : authHeader;

    if (!upstreamAuth) {
      return new Response(copy['apiRuntime.supabase.authorizationRequired'], {
        status: 401,
        headers: responseHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }),
      });
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return jsonResponse(
        { error: { code: 'INVALID_JSON', message: copy['apiRuntime.generic.invalidJson'] } },
        { status: 400 },
      );
    }

    const { projectId, query } = (payload ?? {}) as { projectId?: unknown; query?: unknown };

    if (!projectId || typeof projectId !== 'string' || !query || typeof query !== 'string') {
      return jsonResponse(
        { error: { code: 'QUERY_FIELDS_REQUIRED', message: copy['apiRuntime.supabase.fieldsRequired'] } },
        { status: 400 },
      );
    }

    if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
      return jsonResponse(
        { error: { code: 'INVALID_PROJECT_ID', message: copy['apiRuntime.supabase.invalidProjectId'] } },
        { status: 400 },
      );
    }

    logger.debug('Executing Supabase query', { projectId });

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: upstreamAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      /*
       * Provider error bodies can contain SQL fragments, host names or secret
       * material. The UI only needs the stable code and HTTP status, so never
       * copy the upstream body (or status text) into logs or the response.
       */
      logger.error('SUPABASE_QUERY_UPSTREAM_FAILED', { status: response.status });

      return jsonResponse(
        {
          error: {
            code: 'SUPABASE_QUERY_FAILED',
            status: response.status,
            message: copy['apiRuntime.supabase.upstreamFailure'],
          },
        },
        { status: response.status },
      );
    }

    const result = await response.json();

    return jsonResponse(result);
  } catch (error) {
    logger.error('Query execution error:', error);
    return jsonResponse(
      {
        /*
         * Never leak the server stack trace to the client — it exposes internal
         * file paths and module structure. The full error is logged above.
         */
        error: {
          code: 'QUERY_EXECUTION_FAILED',
          message: copy['apiRuntime.supabase.queryFailed'],
        },
      },
      { status: 500 },
    );
  }
}
