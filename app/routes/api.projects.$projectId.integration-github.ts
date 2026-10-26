import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { getRemainingApiRouteCopy, type RemainingApiRouteKey } from '~/lib/i18n/catalogs/remaining-api-routes';
import { getWebApiRoutesCopy, type WebApiErrorCode } from '~/lib/i18n/catalogs/web-api-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { json } from '~/lib/json-response';

function headers(request: Request) {
  const result = localeResponseHeaders(request, resolveRequestLocale(request));
  result.set('cache-control', 'no-store');

  return result;
}

function failure(request: Request, code: string, status: number, key: RemainingApiRouteKey | WebApiErrorCode) {
  const { language } = resolveRequestLocale(request);
  const remaining = getRemainingApiRouteCopy(language);
  const web = getWebApiRoutesCopy(language);
  const message = key in remaining ? remaining[key as RemainingApiRouteKey] : web[key as WebApiErrorCode];

  return json({ ok: false, code, error: message }, { status, headers: headers(request) });
}

function methodNotAllowed(request: Request) {
  const response = failure(request, 'METHOD_NOT_ALLOWED', 405, 'METHOD_NOT_ALLOWED');
  response.headers.set('allow', 'POST');

  return response;
}

export function loader({ request }: EnterpriseLoaderArgs) {
  return methodNotAllowed(request);
}

function validVerification(
  value: unknown,
): value is { account: { login: string; htmlUrl: string }; verifiedAt: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (('ok' in value && value.ok !== true) || 'error' in value) {
    return false;
  }

  const { account, verifiedAt } = value as { account?: unknown; verifiedAt?: unknown };

  if (!account || typeof account !== 'object' || typeof verifiedAt !== 'string') {
    return false;
  }

  const { login, htmlUrl } = account as { login?: unknown; htmlUrl?: unknown };

  if (typeof login !== 'string' || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login) || login.includes('--')) {
    return false;
  }

  if (htmlUrl !== `https://github.com/${login}`) {
    return false;
  }

  const timestamp = new Date(verifiedAt);

  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === verifiedAt;
}

/** Verify the caller's existing GitHub connection; never create access or save a connected flag. */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed(request);
  }

  if (!params.projectId) {
    return failure(request, 'PROJECT_NOT_FOUND', 404, 'PROJECT_NOT_FOUND');
  }

  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  /*
   * TLS ends at the ingress; Express supplies an HTTP URL. Keep its original
   * Host and only recover the protocol, never trusting x-forwarded-host.
   */
  if (forwardedProtocol === 'http' || forwardedProtocol === 'https') {
    requestUrl.protocol = `${forwardedProtocol}:`;
  }

  if ((origin && origin !== requestUrl.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return failure(request, 'ORIGIN_NOT_ALLOWED', 403, 'PROJECT_ACTION_AUTH_REQUIRED');
  }

  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return failure(request, 'JSON_CONTENT_TYPE_REQUIRED', 415, 'JSON_CONTENT_TYPE_REQUIRED');
  }

  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
      return failure(request, 'INVALID_JSON_PAYLOAD', 400, 'INVALID_JSON_PAYLOAD');
    }
  } catch {
    return failure(request, 'INVALID_JSON_BODY', 400, 'INVALID_JSON_BODY');
  }

  // This read must finish successfully before inspecting any account connection.
  try {
    const projectResult = await apiRequest<{ project?: { id?: unknown } }>(
      request,
      `/projects/${encodeURIComponent(params.projectId)}`,
      { redirectOn401: false },
    );

    if (!projectResult || projectResult.project?.id !== params.projectId) {
      return failure(request, 'PROJECT_ACCESS_UNAVAILABLE', 502, 'PROJECT_ACTION_FAILED');
    }
  } catch (error) {
    const status = error instanceof Response ? error.status : 502;

    if (status === 401) {
      return failure(request, 'AUTH_REQUIRED', 401, 'UNAUTHORIZED');
    }

    if (status === 403) {
      return failure(request, 'PROJECT_FORBIDDEN', 403, 'PROJECT_ACTION_AUTH_REQUIRED');
    }

    if (status === 404) {
      return failure(request, 'PROJECT_NOT_FOUND', 404, 'PROJECT_NOT_FOUND');
    }

    return failure(request, 'PROJECT_ACCESS_UNAVAILABLE', 502, 'PROJECT_ACTION_FAILED');
  }

  try {
    const result = await apiRequest<unknown>(request, '/api/integrations/github/verify', {
      method: 'POST',
      body: JSON.stringify({}),
      redirectOn401: false,
    });

    if (!validVerification(result)) {
      return failure(request, 'PROVIDER_RESPONSE_MALFORMED', 502, 'GITHUB_USER_FAILED');
    }

    return json(
      {
        ok: true,
        account: { login: result.account.login, htmlUrl: result.account.htmlUrl },
        verifiedAt: result.verifiedAt,
      },
      { headers: headers(request) },
    );
  } catch (error) {
    // Never reflect provider messages, response fields, or tokens to the browser.
    if (error instanceof Response) {
      const payload: unknown = await error
        .clone()
        .json()
        .catch(() => null);

      const code = payload && typeof payload === 'object' ? (payload as { code?: unknown }).code : undefined;

      if (code === 'AUTH_REQUIRED') {
        return failure(request, code, 401, 'UNAUTHORIZED');
      }

      if (code === 'CONNECTOR_NOT_LINKED') {
        return failure(request, code, 401, 'GITHUB_TOKEN_MISSING');
      }

      if (code === 'CONNECTOR_NEEDS_RECONNECT') {
        return failure(request, code, 401, 'GITHUB_TOKEN_INVALID');
      }

      if (code === 'CONNECTOR_DISABLED') {
        return failure(request, code, 403, 'GITHUB_UNAVAILABLE');
      }

      if (code === 'PROVIDER_FORBIDDEN') {
        return failure(request, code, 403, 'GITHUB_REQUEST_FAILED');
      }

      if (code === 'PROVIDER_RESPONSE_MALFORMED') {
        return failure(request, code, 502, 'GITHUB_USER_FAILED');
      }

      if (code === 'CONNECTOR_TOKEN_UNAVAILABLE') {
        return failure(request, code, 503, 'GITHUB_UNAVAILABLE');
      }

      if (error.status === 429) {
        return failure(request, 'RATE_LIMIT_EXCEEDED', 429, 'RATE_LIMIT_EXCEEDED');
      }
    }

    return failure(request, 'GITHUB_VERIFICATION_UNAVAILABLE', 502, 'GITHUB_UNAVAILABLE');
  }
}
