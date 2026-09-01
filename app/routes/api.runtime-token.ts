import { apiRequest, readSessionToken, json } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * AUDX-004 — hand the browser a scoped runtime TICKET, never the session token.
 *
 * This route used to be:
 *
 *     const token = readSessionToken(request);
 *     return json({ token });
 *
 * i.e. it read the httpOnly session cookie and handed its value to JavaScript.
 * That defeats httpOnly completely: any XSS could fetch this route and walk away
 * with a full-privilege, full-lifetime session credential — good for billing,
 * admin surfaces, project deletion, everything.
 *
 * It now exchanges the session (server-side, cookie never leaves this process)
 * for a ticket that is short-lived, scoped to ONE project, and accepted only on
 * /api/runtime/* routes.
 *
 * The session is still read here — but only to authenticate the exchange
 * upstream via apiRequest; its value is not part of any response.
 */
export async function loader({ request }: { request: Request }) {
  if (!readSessionToken(request)) {
    return remainingApiErrorResponse(request, 'UNAUTHORIZED', 401, {
      extra: { ok: false },
      headers: { 'cache-control': 'no-store' },
    });
  }

  const projectId = new URL(request.url).searchParams.get('projectId');

  if (!projectId) {
    /*
     * Fail closed. Without a project there is nothing to scope the ticket to,
     * and falling back to an unscoped credential here would quietly restore the
     * exact defect this route exists to remove.
     */
    return remainingApiErrorResponse(request, 'PROJECT_ID_REQUIRED', 400, {
      extra: { ok: false },
      headers: { 'cache-control': 'no-store' },
    });
  }

  const payload = (await apiRequest(request, '/auth/runtime-ticket', {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  })) as { ticket?: string };

  if (!payload?.ticket) {
    return remainingApiErrorResponse(request, 'UNAUTHORIZED', 401, {
      extra: { ok: false },
      headers: { 'cache-control': 'no-store' },
    });
  }

  return json({ token: payload.ticket }, { headers: { 'cache-control': 'no-store' } });
}
