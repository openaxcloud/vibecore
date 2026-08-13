import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

/*
 * GET-only entry for the open AgentPatchProposal queue. PUT and DELETE
 * target a per-proposal id and live in the sibling
 * `api.projects.$projectId.agent-patch-proposals.$proposalId.ts` route.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const payload = await apiRequest(request, `/projects/${params.projectId}/agent-patch-proposals`);

  return json(payload);
}
