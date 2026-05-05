import { apiBaseUrl, apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

function apiWebSocketOrigin() {
  const url = new URL(apiBaseUrl());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '';
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
  const websocketUrl = new URL(`${apiWebSocketOrigin()}${ticket.websocketPath}`);
  websocketUrl.searchParams.set('ticket', ticket.ticket);
  websocketUrl.searchParams.set('sessionId', ticket.sessionId);

  return json({
    websocketUrl: websocketUrl.toString(),
    sessionId: ticket.sessionId,
    expiresInSeconds: ticket.expiresInSeconds,
  });
}
