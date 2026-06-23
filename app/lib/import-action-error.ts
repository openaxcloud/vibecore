/*
 * Shared error-classification for the project-import route actions
 * (import-zip, import-github).
 *
 * Lives in ~/lib so the route modules can import it without re-exporting
 * anything: React Router only strips route entrypoints from the client bundle,
 * so a route that imports a `*.server` module must not export extra symbols.
 *
 * `apiRequest` throws a `Response` for any non-ok upstream status. A 3xx
 * re-auth redirect (session expiry / MFA) must be re-thrown so the framework
 * performs the redirect; every other API failure — malformed / oversized
 * archive (400/413), quota exceeded (402), upstream 500 — should surface inline
 * in the form instead of crashing to the route error boundary.
 */

import { apiErrorMessage, isApiResponse } from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';

/**
 * Decide how an import action should handle a thrown error.
 *
 * Returns `{ rethrow: true }` for re-auth redirects (and any non-API error),
 * which the caller must re-throw. Returns `{ rethrow: false, error }` for an API
 * failure that should be rendered inline in the form.
 */
export async function resolveImportActionError(
  error: unknown,
  fallback: string,
): Promise<{ rethrow: true } | { rethrow: false; error: string }> {
  if (isReauthRedirect(error)) {
    return { rethrow: true };
  }

  if (isApiResponse(error)) {
    return { rethrow: false, error: await apiErrorMessage(error, fallback) };
  }

  return { rethrow: true };
}
