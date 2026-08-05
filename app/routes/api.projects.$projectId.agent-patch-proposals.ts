import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * GET-only entry for the open AgentPatchProposal queue. PUT and DELETE
 * target a per-proposal id and live in the sibling
 * `api.projects.$projectId.agent-patch-proposals.$proposalId.ts` route.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const payload = await apiRequest(request, `/projects/${params.projectId}/agent-patch-proposals`);

  return json(payload);
}
