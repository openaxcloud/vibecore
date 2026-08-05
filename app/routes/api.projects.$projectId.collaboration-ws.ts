import { apiBaseUrl, apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

function firstForwardedValue(value: string | null) {
  return value?.split(',')[0]?.trim() || undefined;
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/*
 * Read K8s-injected env through globalThis.process.env. Reading `process.env.X`
 * directly is a trap in these SSR routes: vite-plugin-node-polyfills shims
 * `process.env` to `{}` in the SSR bundle, so PUBLIC_API_BASE_URL (set on the
 * web deployment to https://api.e-code.ai) was invisible here. The ticket then
 * fell back to host inference and returned the app host (e-code.ai) for the
 * collaboration WebSocket — which the API service does not serve, so every
 * connect 404'd and live sharing never worked. Mirrors the documented pattern
 * in app/lib/enterprise-api.server.ts.
 */
function runtimeEnv(): Record<string, string | undefined> {
  const maybeProcess = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
    .process;

  return maybeProcess?.env ?? {};
}

function configuredPublicApiBaseUrl() {
  const env = runtimeEnv();
  const configured = env.PUBLIC_API_BASE_URL ?? env.VITE_PUBLIC_API_BASE_URL;

  return configured?.trim() || undefined;
}

function inferredPublicApiBaseUrl(request: Request) {
  const url = new URL(request.url);

  /*
   * Derive the host from the request URL (the original Host header, which the
   * ingress preserves) — NOT from x-forwarded-host. This URL carries a freshly
   * minted collaboration ws-ticket; x-forwarded-host is a free-form
   * client-controllable header (cache-poisoning / ticket-misdirection vector),
   * whereas the Host the browser used to reach us is the correct same-origin
   * basis. configuredPublicApiBaseUrl() still wins over this whenever set.
   */
  const forwardedProto = firstForwardedValue(request.headers.get('x-forwarded-proto'));

  if (forwardedProto === 'http' || forwardedProto === 'https') {
    url.protocol = `${forwardedProto}:`;
  } else if (!isLocalHostname(url.hostname)) {
    url.protocol = 'https:';
  }

  if (url.hostname.startsWith('app.')) {
    url.hostname = `api.${url.hostname.slice(4)}`;
  } else if (isLocalHostname(url.hostname)) {
    return apiBaseUrl();
  } else if (!url.hostname.startsWith('api.')) {
    /*
     * Bare app domain (e.g. e-code.ai, which serves the app alongside
     * app.e-code.ai): the collaboration WebSocket is served by the API service
     * on the api.<domain> host, so target it explicitly instead of leaving the
     * app host (which 404s). configuredPublicApiBaseUrl() still wins when set.
     */
    url.hostname = `api.${url.hostname}`;
  }

  url.pathname = '';
  url.search = '';
  url.hash = '';

  return url.toString();
}

function apiWebSocketBase(request: Request) {
  const url = new URL(configuredPublicApiBaseUrl() ?? inferredPublicApiBaseUrl(request));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId') ?? undefined;

  const ticketPath = `/projects/${params.projectId}/collaboration/ws-ticket${
    sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
  }`;
  const ticket = await apiRequest<{
    ticket: string;
    sessionId: string;
    expiresInSeconds: number;
    websocketPath: string;
  }>(request, ticketPath);

  const websocketUrl = new URL(`${apiWebSocketBase(request)}${ticket.websocketPath}`);
  websocketUrl.searchParams.set('ticket', ticket.ticket);
  websocketUrl.searchParams.set('sessionId', ticket.sessionId);

  return json({
    websocketUrl: websocketUrl.toString(),
    sessionId: ticket.sessionId,
    expiresInSeconds: ticket.expiresInSeconds,
  });
}
