import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

/*
 * IDE proxy for "Add Authentication" — POSTs to the internal API
 * `/projects/:id/auth/scaffold`, which writes the real auth scaffold files into
 * the project (gated behind AUTH_SCAFFOLD_ENABLED) and provisions AUTH_JWT_SECRET.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const payload = await apiRequest(request, `/projects/${params.projectId}/auth/scaffold`, { method: 'POST' });

    return json(payload);
  } catch (error) {
    if (error instanceof Response) {
      const body = (await error.json().catch(() => ({}))) as { error?: string; code?: string };

      return json(
        {
          ok: false,
          error:
            body.code === 'FEATURE_NOT_ENABLED'
              ? 'Add Authentication is not enabled on this platform yet.'
              : (body.error ?? 'Could not add authentication.'),
        },
        { status: error.status },
      );
    }

    return json({ ok: false, error: 'Could not reach the auth scaffold service.' }, { status: 502 });
  }
}
