import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * Proxy for upsert (PUT) and delete (DELETE) of a single AgentPatchProposal.
 * Listing lives in the sibling `api.projects.$projectId.agent-patch-proposals.ts`
 * route — keeping them in separate files matches the Remix nested-route
 * convention and stops the loader from having to disambiguate on path depth.
 */
export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId || !params.proposalId) {
    return remainingApiErrorResponse(request, 'PROJECT_OR_PROPOSAL_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const method = request.method.toUpperCase();

  if (method !== 'PUT' && method !== 'DELETE') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
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
