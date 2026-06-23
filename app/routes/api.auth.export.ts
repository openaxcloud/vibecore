import { buildAccountExportResponse } from '~/lib/account-export-response';
import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const exported = await apiRequest(request, '/auth/export');

  return buildAccountExportResponse(exported);
}

export async function action() {
  throw json({ error: 'Unsupported method' }, { status: 405 });
}
