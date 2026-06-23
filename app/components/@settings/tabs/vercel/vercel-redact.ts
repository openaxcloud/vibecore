import type { VercelConnection } from '~/types/vercel';

/**
 * Produce a log-safe view of a Vercel connection.
 *
 * SECURITY: the raw Vercel access token is a long-lived, high-privilege
 * credential (can delete projects / trigger deployments). It must never be
 * written to the browser console, where it is captured by devtools, browser
 * extensions, error reporters and session-replay tooling. This returns only
 * non-sensitive shape information, replacing the token with a boolean flag.
 */
export function redactVercelConnection(connection: VercelConnection): {
  user: VercelConnection['user'];
  hasToken: boolean;
  totalProjects: number;
} {
  return {
    user: connection.user,
    hasToken: Boolean(connection.token),
    totalProjects: connection.stats?.totalProjects ?? 0,
  };
}
