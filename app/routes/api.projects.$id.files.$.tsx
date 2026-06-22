import {
  apiErrorMessage,
  apiRequest,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { contentTypeForProjectFile, normalizeProjectFilePath } from '~/lib/project-file-route';

interface RuntimeFileReadResponse {
  path?: string;
  content?: string;
  encoding?: 'utf8' | 'base64';
}

interface ProjectFileWriteResponse {
  ok: true;
  path: string;
}

export interface ProjectFileWritePayload {
  content: string;
  encoding: 'utf8' | 'base64';
}

/*
 * Decode the runtime read response into raw bytes. Binary files are returned as
 * {content:<base64>, encoding:'base64'} (api commit 1029075b); decoding the
 * base64 back to bytes keeps reads lossless. Text files (encoding omitted or
 * 'utf8') are encoded as utf8.
 */
export function decodeRuntimeFileContent(file: RuntimeFileReadResponse): Uint8Array {
  const content = file.content ?? '';

  if (file.encoding === 'base64') {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  return new TextEncoder().encode(content);
}

/*
 * Parse the incoming PUT body into a write payload the runtime understands.
 *
 * The legacy/default contract is a raw request body interpreted as utf8 text.
 * That round-trips binary files (images, fonts, compiled assets) through a JS
 * string, which is lossy for non-UTF-8 bytes and silently corrupts the file on
 * save. So when the client sends application/json we accept an explicit
 * {content, encoding} envelope and forward the encoding to the runtime write
 * endpoint, which decodes base64 back to real bytes. Anything else falls back
 * to the historical raw-text behaviour.
 */
export async function parseProjectFileWriteBody(
  rawBody: string,
  contentType: string | null,
): Promise<ProjectFileWritePayload> {
  if (contentType && contentType.toLowerCase().includes('application/json')) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!parsed || typeof parsed !== 'object') {
      throw json({ ok: false, error: 'Invalid file write body' }, { status: 400 });
    }

    const { content, encoding } = parsed as { content?: unknown; encoding?: unknown };

    if (typeof content !== 'string') {
      throw json({ ok: false, error: 'File content is required' }, { status: 400 });
    }

    if (encoding !== undefined && encoding !== 'utf8' && encoding !== 'base64') {
      throw json({ ok: false, error: 'Unsupported content encoding' }, { status: 400 });
    }

    return { content, encoding: encoding === 'base64' ? 'base64' : 'utf8' };
  }

  return { content: rawBody, encoding: 'utf8' };
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
