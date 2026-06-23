/*
 * Server-free helper for the canonical account/project URL loaders.
 *
 * The canonical `/@account/project[/ide]` loaders resolve the readable slug pair
 * to a project id via `apiRequest('/projects/resolve?...')`. `apiRequest` turns
 * genuine 404s into a thrown 404 `Response` (and 401/403 into login/MFA redirect
 * Responses), but a transient upstream 5xx is thrown as a `Response` with
 * `status >= 500` and a network failure / `AbortSignal.timeout(...)` is thrown as
 * a raw `TimeoutError`/`TypeError` (not a `Response`). Without handling, both
 * propagate uncaught out of the loader and surface a hard root-level error page
 * while the api pod is draining or slow.
 *
 * This predicate distinguishes the two classes:
 *  - "rethrow"  → genuine 404s + login/MFA redirects (a `Response` with
 *                 `status < 500`): the framework should handle them as-is so
 *                 project-not-found and re-auth still resolve correctly.
 *  - otherwise  → transient failures (5xx Response, network/timeout): the loader
 *                 should degrade gracefully (e.g. `throw redirect('/dashboard')`)
 *                 instead of crashing the page.
 *
 * It lives in ~/lib rather than the route module on purpose: React Router only
 * strips route entrypoints from the client bundle, so a route importing a
 * `*.server` module must not export anything else.
 */

/**
 * Returns true when a value thrown from the `/projects/resolve` call is a
 * "real" response the framework should re-throw unchanged (a 404 or a
 * login/MFA redirect), as opposed to a transient failure that should be folded
 * into a graceful dashboard redirect.
 */
export function shouldRethrowResolveError(error: unknown): error is Response {
  return error instanceof Response && error.status < 500;
}
