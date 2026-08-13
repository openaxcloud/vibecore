/*
 * Pure (server-free) helpers for the project file read/write resource route.
 *
 * These live in ~/lib rather than inside the route module on purpose: React
 * Router only strips `loader`/`action`/`middleware`/`headers` exports from the
 * client bundle, so any *other* export of a route file that transitively imports
 * a `*.server` module breaks the client build ("Server-only module referenced by
 * client"). Keeping these helpers here lets the route export only loader/action.
 */

export interface RuntimeFileReadResponse {
  path?: string;
  content?: string;
  encoding?: 'utf8' | 'base64';
}

export interface ProjectFileWritePayload {
  content: string;
  encoding: 'utf8' | 'base64';
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
    let binary: string;

    try {
      binary = atob(content);
    } catch {
      /*
       * A truncated/garbled base64 body (partially-written or corrupted asset)
       * makes atob throw a DOMException. Surface the same structured 502 the
       * read path returns instead of letting it escape the loader as an opaque
       * 500.
       */
      throw jsonResponse(
        {
          ok: false,
          error: 'Project file read failed',
          code: 'PROJECT_FILE_READ_UNAVAILABLE',
        },
        502,
      );
    }

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
      throw jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw jsonResponse({ ok: false, error: 'Invalid file write body' }, 400);
    }

    const { content, encoding } = parsed as { content?: unknown; encoding?: unknown };

    if (typeof content !== 'string') {
      throw jsonResponse({ ok: false, error: 'File content is required' }, 400);
    }

    if (encoding !== undefined && encoding !== 'utf8' && encoding !== 'base64') {
      throw jsonResponse({ ok: false, error: 'Unsupported content encoding' }, 400);
    }

    return { content, encoding: encoding === 'base64' ? 'base64' : 'utf8' };
  }

  return { content: rawBody, encoding: 'utf8' };
}
