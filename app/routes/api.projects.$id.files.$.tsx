import {
  apiErrorMessage,
  apiRequest,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  decodeRuntimeFileContent,
  parseProjectFileWriteBody,
  type RuntimeFileReadResponse,
} from '~/lib/project-file-io';
import { contentTypeForProjectFile, normalizeProjectFilePath } from '~/lib/project-file-route';

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

  let file: RuntimeFileReadResponse;

  try {
    /*
     * Read the single requested file from the running workspace instead of
     * exporting and unzipping the FULL project archive per read. The old
     * /projects/:id/export/zip path transferred and decompressed the entire
     * workspace for one file and, bounded by the 30s apiRequest timeout, timed
     * out on large projects. This mirrors the write path below, which already
     * targets the runtime workspace.
     */
    file = await apiRequest<RuntimeFileReadResponse>(
      request,
      `/api/runtime/workspaces/${encodeURIComponent(projectId)}/files/read?path=${encodeURIComponent(
        normalizedPath.path,
      )}`,
    );
  } catch (error) {
    const status = error instanceof Response ? error.status : 502;

    if (status === 404) {
      throw json(
        {
          ok: false,
          error: 'Project file not found',
          path: normalizedPath.path,
        },
        { status: 404 },
      );
    }

    const message = await apiErrorMessage(error, 'Project file read failed');
    const normalizedStatus = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw json(
      {
        ok: false,
        error: message,
        code:
          normalizedStatus === 401 || normalizedStatus === 403
            ? 'PROJECT_FILE_AUTH_REQUIRED'
            : 'PROJECT_FILE_READ_UNAVAILABLE',
      },
      { status: normalizedStatus },
    );
  }

  const bytes = decodeRuntimeFileContent(file);

  /*
   * Project files are attacker-controlled content served from the app's own
   * origin. Serving e.g. an .html/.svg file inline would execute its scripts in
   * our origin (stored XSS, cross-user when a project is shared). Force a
   * download and forbid MIME sniffing + script execution so the bytes can never
   * be rendered as an active document. The IDE reads the body via fetch(), which
   * is unaffected by Content-Disposition.
   */
  return new Response(bytes, {
    headers: {
      'cache-control': 'no-store',
      'content-length': String(bytes.byteLength),
      'content-type': contentTypeForProjectFile(normalizedPath.path),
      'content-disposition': 'attachment',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
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

  const rawBody = await request.text();
  const payload = await parseProjectFileWriteBody(rawBody, request.headers.get('content-type'));

  try {
    await apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(projectId)}/files/write`, {
      method: 'PUT',
      body: JSON.stringify({
        path: normalizedPath.path,
        content: payload.content,
        encoding: payload.encoding,
      }),
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
