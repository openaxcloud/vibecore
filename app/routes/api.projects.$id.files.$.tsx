import {
  apiErrorMessage,
  apiRequest,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  contentTypeForProjectFile,
  normalizeProjectFilePath,
  readProjectFileFromZipBase64,
} from '~/lib/project-file-route';

interface ProjectExportResponse {
  archive?: {
    base64?: string;
    byteLength?: number;
    storageKey?: string;
  };
}

interface ProjectFileWriteResponse {
  ok: true;
  path: string;
}

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.id;
  const normalizedPath = normalizeProjectFilePath(params['*']);

  if (!projectId) {
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  if (!normalizedPath.ok) {
    throw json({ ok: false, error: normalizedPath.error }, { status: 400 });
  }

  let exported: ProjectExportResponse;

  try {
    exported = await apiRequest<ProjectExportResponse>(
      request,
      `/projects/${encodeURIComponent(projectId)}/export/zip`,
    );
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project file read failed');
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw json(
      {
        ok: false,
        error: message,
        code: status === 401 || status === 403 ? 'PROJECT_FILE_AUTH_REQUIRED' : 'PROJECT_FILE_READ_UNAVAILABLE',
      },
      { status },
    );
  }

  const base64Archive = exported.archive?.base64;

  if (!base64Archive) {
    throw json({ ok: false, error: 'Project export did not return an archive' }, { status: 502 });
  }

  const file = await readProjectFileFromZipBase64(base64Archive, normalizedPath.path);

  if (!file) {
    throw json(
      {
        ok: false,
        error: 'Project file not found',
        path: normalizedPath.path,
      },
      { status: 404 },
    );
  }

  return new Response(file.bytes, {
    headers: {
      'cache-control': 'no-store',
      'content-length': String(file.sizeBytes),
      'content-type': contentTypeForProjectFile(normalizedPath.path),
      'x-project-file-path': normalizedPath.path,
    },
  });
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'PUT') {
    throw json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  const projectId = params.id;
  const normalizedPath = normalizeProjectFilePath(params['*']);

  if (!projectId) {
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  if (!normalizedPath.ok) {
    throw json({ ok: false, error: normalizedPath.error }, { status: 400 });
  }

  const content = await request.text();

  try {
    await apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(projectId)}/files/write`, {
      method: 'PUT',
      body: JSON.stringify({ path: normalizedPath.path, content }),
    });
  } catch (error) {
    const message = await apiErrorMessage(error, 'Project file write failed');
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw json(
      {
        ok: false,
        error: message,
        code: status === 401 || status === 403 ? 'PROJECT_FILE_AUTH_REQUIRED' : 'PROJECT_FILE_WRITE_UNAVAILABLE',
      },
      { status },
    );
  }

  return json<ProjectFileWriteResponse>(
    {
      ok: true,
      path: normalizedPath.path,
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  );
}
