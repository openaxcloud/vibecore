import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId) {
    return remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  const svg = await apiRequest<string>(request, `/projects/${params.projectId}/homepage-preview.svg`);

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'private, max-age=60',
    },
  });
}
