/**
 * `Response`-producing JSON helper for routes that post-process their own
 * `Response` (e.g. the `withSecurity` wrapper reads `.headers`/`.status`/
 * `.body`) or are explicitly typed `Promise<Response>`.
 *
 * Under Remix v2 single-fetch, `json()` from `@remix-run/cloudflare` returned a
 * real `Response`. React Router 7's `data()` instead returns a
 * `DataWithResponseInit` sentinel that the framework serializes — it is NOT a
 * `Response` and has no `.body`/`.headers`/`.status`, which breaks code that
 * treats the loader/action result as a `Response`. For those few routes, use
 * this native-`Response` helper instead of `data()`.
 */
export function json<T>(data: T, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }

  return new Response(JSON.stringify(data), { ...init, headers });
}
