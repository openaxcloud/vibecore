import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

interface ProjectExportResponse {
  archive?: {
    base64?: string;
    byteLength?: number;
    storageKey?: string;
  };
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  try {
    const payload = await apiRequest<ProjectExportResponse>(
      request,
      `/projects/${encodeURIComponent(projectId)}/export/zip`,
    );

    return json(payload, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw remainingApiErrorResponse(
      request,
      status === 401 || status === 403 ? 'PROJECT_EXPORT_AUTH_REQUIRED' : 'PROJECT_EXPORT_UNAVAILABLE',
      status,
      { extra: { ok: false } },
    );
  }
}
