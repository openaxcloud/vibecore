import { buildAgentMemoryExportResponse } from '~/lib/agent-memory-export-response';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const payload = await apiRequest(request, `/agent-memory/export${query ? `?${query}` : ''}`);

  return buildAgentMemoryExportResponse(payload);
}
