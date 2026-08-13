import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

/*
 * Proxy for upsert (PUT) and delete (DELETE) of a single AgentPatchProposal.
 * Listing lives in the sibling `api.projects.$projectId.agent-patch-proposals.ts`
 * route — keeping them in separate files matches the Remix nested-route
 * convention and stops the loader from having to disambiguate on path depth.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId || !params.proposalId) {
    return json({ ok: false, error: 'Project or proposal not found' }, { status: 404 });
  }

  const method = request.method.toUpperCase();

  if (method !== 'PUT' && method !== 'DELETE') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const body = method === 'PUT' ? await request.text() : undefined;

  const payload = await apiRequest(
    request,
    `/projects/${params.projectId}/agent-patch-proposals/${params.proposalId}`,
    {
      method,
      body,
    },
  );

  return json(payload);
}
