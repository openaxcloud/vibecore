import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

/*
 * IDE proxy: full detail of one multi-agent consensus record — the per-agent
 * vote (claimVotes), inter-lane conflicts and the consolidated result. Forwards
 * to the internal API `/projects/:id/agent-consensus/:runId` (project read
 * gated). The Agent Studio panel calls this when a consensus row is expanded;
 * the summary list is served by the sibling `agent-consensus` route.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId || !params.runId) {
    return json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  const payload = await apiRequest(
    request,
    `/projects/${params.projectId}/agent-consensus/${encodeURIComponent(params.runId)}`,
  );

  return json(payload);
}
