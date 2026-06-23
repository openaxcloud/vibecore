import { apiBaseUrl, readSessionToken } from '~/lib/enterprise-api.server';

/**
 * Forwards a project/workspace IDE-state PUT to the platform API while
 * **preserving the optimistic-concurrency contract end to end**.
 *
 * The generic `apiRequest` helper (enterprise-api.server) is unusable for this
 * route: on any non-OK response it reshapes the body into
 * `{ ok:false, error, code }` and drops every upstream header. That silently
 * destroys the backend's 412 contract — the API answers a version mismatch with
 * HTTP 412 `{ error, code, ideState: existingState }` plus an `etag` header
 * (services/api/src/app.ts), and the client conflict handler
 * (app/lib/persistence/projectIdeMemory.ts) reads BOTH the `etag` header and
 * `ideState.version`/`ideState.state` to re-merge and retry with a fresh
 * `If-Match`. If those are stripped the client deletes its known version, the
 * retry omits `If-Match`, and the backend does a last-write-wins that silently
 * clobbers the concurrent session's edits.
 *
 * So we proxy the request directly here, copying status, the JSON body, and the
 * `etag` header through verbatim for both the 2xx and 412 cases.
 */
export async function forwardIdeStatePut(request: Request, path: string): Promise<Response> {
  const token = readSessionToken(request);
  const body = await request.text();

  const headers = new Headers();
  headers.set('accept', 'application/json');
  headers.set('content-type', 'application/json');

  /*
   * Forward the conditional header so the API enforces optimistic concurrency
   * (412 on version mismatch) instead of silently last-write-wins across tabs.
   */
  const ifMatch = request.headers.get('if-match');

  if (ifMatch) {
    headers.set('if-match', ifMatch);
  }

  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const upstream = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'PUT',
    body,
    headers,

    // Mirror apiRequest's default timeout so a hung api pod can't stall the action.
    signal: AbortSignal.timeout(30_000),
  });

  const rawBody = await upstream.text();
  const etag = upstream.headers.get('etag');

  const responseHeaders = new Headers();
  responseHeaders.set('content-type', 'application/json; charset=utf-8');

  if (etag) {
    responseHeaders.set('etag', etag);
  }

  return new Response(rawBody, { status: upstream.status, headers: responseHeaders });
}
