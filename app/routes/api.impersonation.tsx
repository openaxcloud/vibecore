import { data as json } from 'react-router';

import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

/*
 * Resource route backing the impersonation banner (P8). GET reports whether the
 * current session is an admin impersonating this user; POST ends it. Both proxy
 * the API with the caller's session cookie via apiRequest. redirectOn401:false so
 * an unauthenticated probe just returns "not impersonating" instead of bouncing.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  try {
    const me = await apiRequest<{ impersonatedBy?: string | null; user?: { email?: string } }>(request, '/auth/me', {
      redirectOn401: false,
    });

    return json({ impersonatedBy: me?.impersonatedBy ?? null, email: me?.user?.email ?? null });
  } catch {
    return json({ impersonatedBy: null, email: null });
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  try {
    await apiRequest(request, '/auth/impersonation/stop', { method: 'POST', redirectOn401: false });
    return json({ stopped: true });
  } catch {
    return json({ stopped: false });
  }
}
