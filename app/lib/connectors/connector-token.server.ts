import { apiRequest } from '~/lib/enterprise-api.server';

export type DeployConnectorProvider = 'vercel' | 'netlify' | 'supabase';

/*
 * Cross-device connector token resolution (Replit parity).
 *
 * The deploy / DB-connect flows historically read the user's personal token from
 * the bolt nanostore (localStorage) — which only exists on the device that pasted
 * it. The API service now stores that token encrypted in UserConnection and hands
 * it back to its OWNER via GET /api/integrations/:provider/token. Preferring that
 * server token makes a user's connections follow them across devices; the
 * localStorage token remains a clean fallback for builders who connected before
 * this shipped (or aren't signed in to the SaaS API).
 */
export async function resolveConnectorToken(
  request: Request,
  provider: DeployConnectorProvider,
): Promise<string | null> {
  try {
    const result = await apiRequest<{ token?: string | null }>(request, `/api/integrations/${provider}/token`, {
      /*
       * A deploy route must never 302 the user to /login — fall back to the
       * supplied token instead when there is no active server connection.
       */
      redirectOn401: false,
    });

    return result.token ?? null;
  } catch {
    // 404 CONNECTOR_NOT_LINKED, 401, or an unreachable API → no server token.
    return null;
  }
}

/*
 * The token a deploy/connect call should actually use: the cross-device
 * UserConnection token if the user has one, otherwise the caller-supplied
 * (localStorage) fallback. Returns null only when neither source has a token.
 */
export async function preferredConnectorToken(
  request: Request,
  provider: DeployConnectorProvider,
  fallbackToken: string | null | undefined,
): Promise<string | null> {
  const serverToken = await resolveConnectorToken(request, provider);

  return serverToken ?? fallbackToken ?? null;
}
