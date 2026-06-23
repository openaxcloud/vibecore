/**
 * Lossless decoding helpers for the GitHub starter-template loader.
 *
 * The template loader bootstraps a new project from a curated GitHub starter
 * repo. Earlier versions decoded every file as a UTF-8 *string* (JSZip
 * `async('string')` in the ZIP path, `atob()` in the Cloudflare path). That is
 * irreversibly lossy for any non-text file (favicon.ico, PNG/SVG assets, fonts,
 * etc.): invalid UTF-8 byte sequences get replaced with U+FFFD before the file
 * is ever written into the new project.
 *
 * These helpers decode the raw bytes losslessly and tag each file with an
 * `encoding` so the runtime file-write path can round-trip binary content as
 * base64 — matching the convention already used elsewhere
 * (`isBinary: encoding === 'base64' || encoding === 'binary'`).
 */

export type TemplateFileEncoding = 'utf8' | 'base64';

export interface DecodedTemplateFile {
  name: string;
  path: string;
  content: string;
  encoding: TemplateFileEncoding;
}

/**
 * Heuristic binary detection over raw bytes. Mirrors `isBinaryFile` in
 * app/utils/fileUtils.ts: a NUL byte or a control character outside
 * tab/LF/CR within the first chunk marks the content as binary.
 */
export function isBinaryContent(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024);

  for (let i = 0; i < limit; i++) {
    const byte = bytes[i];

    if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
      return true;
    }
  }

  return false;
}

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: false });

/**
 * Encode raw bytes to a standard base64 string without relying on Node's
 * Buffer (this runs in both Node and Cloudflare Workers).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }

  return btoa(binary);
}

/**
 * Decode a standard base64 string (e.g. GitHub Contents API `content`) to raw
 * bytes. Whitespace (GitHub wraps base64 at 60 cols with newlines) is stripped.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

/**
 * Decode raw file bytes into a `{ content, encoding }` pair. Text files are
 * returned as a UTF-8 string (unchanged from the legacy behaviour); binary
 * files are returned as base64 so no bytes are lost.
 */
export function decodeTemplateBytes(bytes: Uint8Array): { content: string; encoding: TemplateFileEncoding } {
  if (isBinaryContent(bytes)) {
    return { content: bytesToBase64(bytes), encoding: 'base64' };
  }

  return { content: UTF8_DECODER.decode(bytes), encoding: 'utf8' };
}
