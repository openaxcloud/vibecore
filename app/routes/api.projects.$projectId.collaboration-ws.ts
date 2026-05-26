import { apiBaseUrl, apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

function firstForwardedValue(value: string | null) {
  return value?.split(',')[0]?.trim() || undefined;
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function configuredPublicApiBaseUrl() {
  const configured = process.env.PUBLIC_API_BASE_URL ?? process.env.VITE_PUBLIC_API_BASE_URL;

  return configured?.trim() || undefined;
}

function inferredPublicApiBaseUrl(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = firstForwardedValue(request.headers.get('x-forwarded-host'));
  const forwardedProto = firstForwardedValue(request.headers.get('x-forwarded-proto'));

  if (forwardedHost) {
    url.host = forwardedHost;
  }

  if (forwardedProto === 'http' || forwardedProto === 'https') {
    url.protocol = `${forwardedProto}:`;
  } else if (!isLocalHostname(url.hostname)) {
    url.protocol = 'https:';
  }

  if (url.hostname.startsWith('app.')) {
    url.hostname = `api.${url.hostname.slice(4)}`;
  } else if (isLocalHostname(url.hostname)) {
    return apiBaseUrl();
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
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
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
