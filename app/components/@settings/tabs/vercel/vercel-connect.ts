import type { VercelUserResponse } from '~/types/vercel';

export interface NormalizedVercelUser {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar?: string;
}

/**
 * Normalize the heterogeneous shape returned by the Vercel `GET /v2/user`
 * endpoint into the flat user object the store/UI expect. Vercel returns the
 * user either nested under `user` or inline at the top level depending on the
 * token type (personal vs. team), so we coalesce both forms here.
 */
export function normalizeVercelUser(userData: VercelUserResponse): NormalizedVercelUser {
  if (userData.user) {
    return {
      id: userData.user.id ?? '',
      username: userData.user.username ?? '',
      email: userData.user.email ?? '',
      name: userData.user.name ?? '',
      avatar: userData.user.avatar,
    };
  }

  return {
    id: userData.id ?? '',
    username: userData.username ?? '',
    email: userData.email ?? '',
    name: userData.name ?? '',
    avatar: userData.avatar,
  };
}

/**
 * The Vercel access token is a long-lived, highly-privileged credential
 * (it can delete projects and trigger deployments). It MUST NOT be written to
 * a JavaScript-readable cookie: a non-httpOnly cookie is exfiltratable by any
 * XSS anywhere in the app. Server-side access goes through the connector flow
 * (`ConnectorApiKeyConnectButton`), which stores the token encrypted at rest.
 *
 * This list is intentionally exhaustive so the test can assert the legacy
 * client-cookie name is never re-introduced as a persistence target.
 */
export const VERCEL_CLIENT_COOKIE_KEYS_FORBIDDEN = ['VITE_VERCEL_ACCESS_TOKEN'] as const;
