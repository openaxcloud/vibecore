import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const payload = await apiRequest(request, `/agent-memory/export${query ? `?${query}` : ''}`);

  return json(payload, {
    headers: {
      'content-disposition': `attachment; filename="agent-memory-${new Date().toISOString()}.json"`,
    },
  });
}
