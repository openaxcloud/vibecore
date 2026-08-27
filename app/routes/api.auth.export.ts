import { buildAccountExportResponse } from '~/lib/account-export-response';
import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const exported = await apiRequest(request, '/auth/export');

  return buildAccountExportResponse(exported);
}

export async function action({ request }: EnterpriseActionArgs) {
  throw remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405);
}
