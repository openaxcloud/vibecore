/**
 * Resource route that mints a server-stored chat share (audit M5/M7).
 *
 * The agent panel's Share button POSTs the conversation snapshot here; this
 * action forwards it to the API's `POST /chat-shares` (carrying the caller's
 * session), which persists the snapshot and returns a short, HMAC-signed
 * token. We hand that token back so the client can build `/share/<token>`.
 *
 * Going through the server keeps the conversation out of the URL and lets the
 * API sign the token with a secret the browser never sees.
 */

import { data as json, type ActionFunctionArgs } from 'react-router';

import { apiRequest } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return remainingApiErrorResponse(request, 'INVALID_JSON_BODY', 400);
  }

  try {
    const result = await apiRequest<{ token: string; expiresAt: string | null }>(request, '/chat-shares', {
      method: 'POST',
      body: JSON.stringify(body),

      /*
       * Surface a 401 as an error to the caller rather than redirecting the
       * fetch() to the login page (this is an XHR, not a page navigation).
       */
      redirectOn401: false,
    });

    return json({ token: result.token, expiresAt: result.expiresAt });
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    return remainingApiErrorResponse(request, 'CHAT_SHARE_FAILED', status);
  }
}
