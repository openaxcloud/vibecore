/**
 * Server-held provider connections (AUDX-007).
 *
 * The legacy provider stores (`app/lib/stores/{github,gitlabConnection,netlify,
 * supabase,vercel}.ts`) persist the user's PAT in `localStorage`: readable by
 * any script on the origin, surviving reloads indefinitely. One XSS anywhere is
 * every connected forge and host the user owns.
 *
 * The replacement already exists server-side and needs no new infrastructure:
 *   - `POST /api/integrations/api-key/:provider/configure` validates the key
 *     against the provider, then stores it ENCRYPTED as a `UserConnection`;
 *   - `connector-proxy` (`/proxy/:userConnectionId/*`) forwards calls upstream
 *     with the token attached server-side — the browser never sees it.
 *
 * ⚠️ This module is deliberately filed HERE, and not inside a provider
 * component, because of AUDX-163: a correct primitive that lives somewhere
 * nobody looks gets re-implemented instead of reused. The remaining four
 * providers are meant to be copies of the Vercel wiring, not new designs.
 */
export type ConnectionProvider = 'github' | 'gitlab' | 'vercel' | 'supabase' | 'netlify';

/** localStorage keys the legacy stores used, per provider. */
export const LEGACY_CONNECTION_STORAGE_KEYS: Record<ConnectionProvider, string> = {
  github: 'github_connection',
  gitlab: 'gitlab_connection',
  vercel: 'vercel_connection',
  supabase: 'supabase_connection',
  netlify: 'netlify_connection',
};

/**
 * Hand a token to the server so it can be stored encrypted.
 *
 * Returns false on any failure. Callers must treat that as "keep working the way
 * you did" rather than "drop the user's connection": a migration that logs
 * people out of their forges would be reverted, not fixed (CLAUDE.md rule 19).
 */
export async function storeTokenServerSide(provider: ConnectionProvider, apiKey: string): Promise<boolean> {
  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetch(`/api/integrations/api-key/${encodeURIComponent(provider)}/configure`, {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': '1' },
      body: JSON.stringify({ apiKey }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * One-time upgrade for a browser that still holds a PAT in `localStorage`.
 *
 * Moves the token to the server and then — ONLY on confirmed success — removes
 * it from the browser. The order matters: clearing first would lose the user's
 * connection outright whenever the upload fails (offline, expired key, server
 * down), turning a security fix into data loss.
 *
 * Returns true when the browser no longer holds the secret.
 */
export async function migrateLegacyTokenToServer(
  provider: ConnectionProvider,
  readToken: () => string | undefined,
  clearToken: () => void,
): Promise<boolean> {
  const token = readToken();

  if (!token) {
    return false;
  }

  const stored = await storeTokenServerSide(provider, token);

  if (!stored) {
    return false;
  }

  clearToken();

  return true;
}
