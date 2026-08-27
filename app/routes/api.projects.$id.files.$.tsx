import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';
import {
  decodeRuntimeFileContent,
  parseProjectFileWriteBody,
  ProjectFileIoError,
  type ProjectFileWritePayload,
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
    throw remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (!normalizedPath.ok) {
    throw remainingApiErrorResponse(request, 'PROJECT_FILE_PATH_INVALID', 400, { extra: { ok: false } });
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
      throw remainingApiErrorResponse(request, 'PROJECT_FILE_NOT_FOUND', 404, {
        extra: { ok: false, path: normalizedPath.path },
      });
    }

    const normalizedStatus = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw remainingApiErrorResponse(
      request,
      normalizedStatus === 401 || normalizedStatus === 403 ? 'PROJECT_FILE_AUTH_REQUIRED' : 'PROJECT_FILE_READ_FAILED',
      normalizedStatus,
      { extra: { ok: false } },
    );
  }

  let bytes: Uint8Array;

  try {
    bytes = decodeRuntimeFileContent(file);
  } catch (error) {
    if (error instanceof ProjectFileIoError) {
      throw remainingApiErrorResponse(request, error.code, error.status, { extra: { ok: false } });
    }

    throw remainingApiErrorResponse(request, 'PROJECT_FILE_READ_FAILED', 502, { extra: { ok: false } });
  }

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
    throw remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const projectId = params.id;
  const normalizedPath = normalizeProjectFilePath(params['*']);

  if (!projectId) {
    throw remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (!normalizedPath.ok) {
    throw remainingApiErrorResponse(request, 'PROJECT_FILE_PATH_INVALID', 400, { extra: { ok: false } });
  }

  const rawBody = await request.text();

  let payload: ProjectFileWritePayload;

  try {
    payload = await parseProjectFileWriteBody(rawBody, request.headers.get('content-type'));
  } catch (error) {
    if (error instanceof ProjectFileIoError) {
      throw remainingApiErrorResponse(request, error.code, error.status, { extra: { ok: false } });
    }

    throw remainingApiErrorResponse(request, 'PROJECT_FILE_WRITE_BODY_INVALID', 400, { extra: { ok: false } });
  }

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
    const status = error instanceof Response && error.status !== 500 ? error.status : 502;

    throw remainingApiErrorResponse(
      request,
      status === 401 || status === 403 ? 'PROJECT_FILE_AUTH_REQUIRED' : 'PROJECT_FILE_WRITE_FAILED',
      status,
      { extra: { ok: false } },
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
