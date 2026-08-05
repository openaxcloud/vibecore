import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

interface ProjectFilesResponse {
  files: Array<{
    path: string;
    updatedAt?: string;
    sizeBytes?: number;
  }>;
  runtime?: unknown;
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;

  if (!projectId) {
    throw remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  try {
    const payload = await apiRequest<ProjectFilesResponse>(request, `/projects/${encodeURIComponent(projectId)}/files`);

    return json(payload, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw remainingApiErrorResponse(
      request,
      status === 401 || status === 403 ? 'PROJECT_FILES_AUTH_REQUIRED' : 'PROJECT_FILES_FAILED',
      status,
      { extra: { ok: false } },
    );
  }
}
