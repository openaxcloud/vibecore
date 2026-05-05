import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const payload = await apiRequest(request, '/mcp/catalog/domains');
  return json(payload);
}
