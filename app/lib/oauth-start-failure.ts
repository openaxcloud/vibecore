/**
 * Decide how to handle a rejection from the OAuth-start loader's `apiRequest`
 * call.
 *
 * `apiRequest` (enterprise-api.server) does a raw `fetch` and may either:
 *   - throw a `Response` deliberately (a 401 -> login redirect, MFA_REQUIRED
 *     redirect): the loader must re-throw it untouched, and
 *   - reject with a non-Response error when the underlying `fetch` fails — the
 *     api pod is unreachable (DNS failure, connection reset) or the request's
 *     30s AbortSignal fired. Left uncaught this bubbles up as an unhandled 500
 *     error boundary mid-OAuth. It should instead degrade to the standard login
 *     error UI, mirroring the callback route's `callback_failed` handling.
 *
 * This pure helper isolates that decision so it can be unit-tested without the
 * server-only loader. The caller re-throws when `rethrow` is set, otherwise it
 * redirects to the returned login path.
 */
export function classifyOAuthStartFailure(
  provider: string,
  error: unknown,
): { rethrow: Response } | { redirectTo: string; detail: string } {
  if (error instanceof Response) {
    return { rethrow: error };
  }

  const detail = error instanceof Error ? error.message : 'api_unreachable';

  return {
    redirectTo: `/login?oauth=${provider}&error=start_failed&detail=${encodeURIComponent('api_unreachable')}`,
    detail,
  };
}
