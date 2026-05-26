import { apiErrorMessage, apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

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
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  try {
    const payload = await apiRequest<ProjectFilesResponse>(request, `/projects/${encodeURIComponent(projectId)}/files`);

    return json(payload, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project files unavailable');
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw json({ ok: false, error: message }, { status });
  }
}
