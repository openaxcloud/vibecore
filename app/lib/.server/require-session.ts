import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('require-session');

/*
 * Matches app/lib/.server/ai-usage.ts: vite-plugin-node-polyfills wipes
 * process.env in the SSR bundle, but process.env.NODE_ENV is build-time inlined
 * via vite `define`, so we use it to pick an in-cluster default.
 */
const IN_CLUSTER_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';
const WEB_SESSION_COOKIE_NAME = 'vc_session';

function apiBaseUrl() {
  /*
   * SSR shims bare process.env to {} (see ai-usage.ts) — read the real env off
   * globalThis so SAAS_API_URL isn't silently lost. NODE_ENV stays inlined.
   */
  const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<
    string,
    string | undefined
  >;

  const fromEnv = env.SAAS_API_URL ?? env.API_BASE_URL ?? env.VITE_API_URL;

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return process.env.NODE_ENV === 'production' ? IN_CLUSTER_API_URL : 'http://localhost:3001';
}

function sessionTokenFromCookie(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${WEB_SESSION_COOKIE_NAME}=`));

  if (!match) {
    return undefined;
  }

  try {
    return decodeURIComponent(match.slice(WEB_SESSION_COOKIE_NAME.length + 1));
  } catch {
    // malformed percent-encoding in the cookie value — treat as no session
    return undefined;
  }
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Verify the caller holds a valid web session before allowing a server-side LLM
 * route that can fall back to the platform's managed provider keys. Without this
 * gate an unauthenticated caller could burn the platform's API budget.
 *
 * Verified against services/api `GET /auth/me`. Returns the validated session
 * token on success; throws a 401/503 `Response` (which Remix surfaces directly)
 * otherwise. Fails CLOSED on api errors — unlike quota checks (which fail open
 * for UX), an auth failure here must never grant anonymous access to managed keys.
 */
export async function requireWebSession(request: Request): Promise<string> {
  const sessionToken = sessionTokenFromCookie(request.headers.get('Cookie'));

  if (!sessionToken) {
    throw unauthorized();
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/auth/me`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${sessionToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    logger.warn(`session verification failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new Response(JSON.stringify({ error: 'Authentication unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (response.status === 200) {
    return sessionToken;
  }

  throw unauthorized();
}

/**
 * Non-throwing companion to {@link requireWebSession} for PUBLIC pages that stay
 * reachable while logged out but should bounce an authenticated visitor to their
 * in-app twin (e.g. the marketing `/account` and `/templates` pages redirecting a
 * signed-in user to `/account-settings` and `/dashboard/templates`).
 *
 * Returns `true` only when the request carries a session cookie that `GET /auth/me`
 * validates. Fails OPEN (returns `false`) on a missing cookie, a non-200, or any
 * network/timeout error — a marketing page must never break or wrongly redirect
 * because auth verification was momentarily unavailable. A stale/invalid cookie is
 * harmless: it yields `false` here (marketing renders), and if it somehow slips
 * through, the authed twin's own loader re-checks and sends them to re-auth.
 */
export async function hasValidWebSession(request: Request): Promise<boolean> {
  const sessionToken = sessionTokenFromCookie(request.headers.get('Cookie'));

  if (!sessionToken) {
    return false;
  }

  const url = `${apiBaseUrl().replace(/\/+$/, '')}/auth/me`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${sessionToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
    });

    return response.status === 200;
  } catch (error) {
    logger.warn(`optional session check failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
