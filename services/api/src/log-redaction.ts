/**
 * Credential redaction for request URLs before they reach the logs.
 *
 * BUG-QA-TOKEN-IN-LOGS. The request logger serialized `request.url` verbatim.
 * Browsers cannot set headers on a WebSocket handshake, so the runtime WS
 * endpoints carry their bearer credential as a QUERY PARAMETER:
 *
 *   /api/runtime/workspaces/<id>/ports/watch?token=<live token>
 *   /api/runtime/workspaces/<id>/files/watch?token=<live token>
 *   /api/runtime/workspaces/<id>/terminal?sessionId=…&token=<live token>
 *
 * Every one of those connections therefore wrote a WORKING credential into the
 * application logs in cleartext. Pino's `redact` option only walks object
 * properties (`*.token`), so it never touched the token embedded in the `url`
 * string; and the existing masking only covered capability tokens in the PATH
 * (`/chat-shares/<token>`).
 *
 * This module keeps the URL useful for debugging — path, and every
 * non-sensitive parameter, are preserved — while replacing only the values that
 * are credentials.
 */

/**
 * Query parameter names whose VALUE is a credential. Compared lowercased, so
 * `Token`, `TOKEN` and `token` are all covered.
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'client_secret',
  'password',
  'pwd',
  'sig',
  'signature',
  'code',
  'session',
  'sessiontoken',
  'session_token',
  'auth',
]);

export const REDACTED = '[redacted]';

/**
 * Redact credentials from a request URL.
 *
 * Pure and total: never throws, and returns the input unchanged when there is
 * nothing to redact. Operates on the raw string rather than `new URL(...)` so a
 * malformed or relative URL — which is exactly what a request logger receives —
 * is handled without a parser throwing inside the logging path.
 */
export function redactUrlCredentials(rawUrl: string): string {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return rawUrl;
  }

  /*
   * Capability tokens carried in the PATH. A chat-share link is
   * `GET /chat-shares/<token>` and is auth-allowlisted, so logging it raw
   * persists a working, unexpirable share credential.
   */
  let out = rawUrl.replace(/\/chat-shares\/[^/?#]+/, `/chat-shares/${REDACTED}`);

  const queryStart = out.indexOf('?');

  if (queryStart === -1) {
    return out;
  }

  // Keep any fragment out of the parameter parsing.
  const hashStart = out.indexOf('#', queryStart);
  const hasHash = hashStart !== -1;
  const path = out.slice(0, queryStart);
  const search = out.slice(queryStart + 1, hasHash ? hashStart : undefined);
  const fragment = hasHash ? out.slice(hashStart) : '';

  const redactedSearch = search
    .split('&')
    .map((pair) => {
      if (pair.length === 0) {
        return pair;
      }

      const equals = pair.indexOf('=');

      // A bare flag (`?debug`) carries no value, so there is nothing to redact.
      if (equals === -1) {
        return pair;
      }

      const name = pair.slice(0, equals);

      return SENSITIVE_QUERY_PARAMS.has(name.toLowerCase()) ? `${name}=${REDACTED}` : pair;
    })
    .join('&');

  out = `${path}?${redactedSearch}${fragment}`;

  return out;
}
