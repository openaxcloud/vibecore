/*
 * Shared, server-free helpers for recognising session-expiry re-auth responses
 * inside route actions.
 *
 * These live in ~/lib rather than inside the route modules on purpose: React
 * Router only strips `loader`/`action`/`middleware`/`headers` from the client
 * bundle, so a route that imports a `*.server` module must not export anything
 * else — doing so drags the server module into the client build. Keeping these
 * predicates here lets each route export only its route entrypoints.
 */

/**
 * A 3xx Response thrown from an enterprise API call is a login / MFA re-auth
 * redirect. It must be re-thrown so the framework performs the redirect instead
 * of the action swallowing it into a generic inline error.
 */
export function isReauthRedirect(error: unknown): error is Response {
  return error instanceof Response && error.status >= 300 && error.status < 400;
}

/**
 * Errors that an action must re-throw rather than render inline: redirect (3xx)
 * re-auth responses AND server (5xx) responses, both of which the framework /
 * error boundary should handle.
 */
export function shouldRethrowActionError(error: unknown): error is Response {
  return error instanceof Response && (error.status >= 500 || (error.status >= 300 && error.status < 400));
}
