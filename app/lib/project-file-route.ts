import JSZip from 'jszip';

export type ProjectFilePathResult =
  | { ok: true; path: string }
  | { ok: false; errorCode: 'required' | 'traversal' | 'unsupported-characters' | 'too-long' };

const maxProjectFilePathLength = 4096;
const unsafeControlCharacters = /[\0-\x1f\x7f]/;

function decodeProjectFilePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function normalizeProjectFilePath(rawPath: string | undefined): ProjectFilePathResult {
  if (!rawPath) {
    return { ok: false, errorCode: 'required' };
  }

  const decoded = decodeProjectFilePath(rawPath).replaceAll('\\', '/');
  const segments = decoded.split('/').filter((segment) => segment.length > 0 && segment !== '.');

  if (!segments.length) {
    return { ok: false, errorCode: 'required' };
  }

  if (segments.some((segment) => segment === '..')) {
    return { ok: false, errorCode: 'traversal' };
  }

  if (segments.some((segment) => unsafeControlCharacters.test(segment))) {
    return { ok: false, errorCode: 'unsupported-characters' };
  }

  const normalizedPath = segments.join('/');

  if (normalizedPath.length > maxProjectFilePathLength) {
    return { ok: false, errorCode: 'too-long' };
  }

  return { ok: true, path: normalizedPath };
}

export function contentTypeForProjectFile(path: string) {
  const basename = path.split('/').pop() ?? path;

  /*
   * Extensionless text files (Dockerfile, Makefile, LICENSE, README) and
   * pure dotfiles (.gitignore, .env) have no usable extension via split('.'),
   * so serve them as text/plain (inline) instead of octet-stream (download).
   */
  if (!basename.includes('.') || basename.startsWith('.env')) {
    return 'text/plain; charset=utf-8';
  }

  const extension = basename.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'css':
      return 'text/css; charset=utf-8';
    case 'csv':
      return 'text/csv; charset=utf-8';
    case 'html':
      return 'text/html; charset=utf-8';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'text/javascript; charset=utf-8';
    case 'json':
    case 'map':
      return 'application/json; charset=utf-8';
    case 'md':
    case 'mdx':
    case 'txt':
    case 'log':
    case 'env':
    case 'gitignore':
      return 'text/plain; charset=utf-8';
    case 'svg':
      return 'image/svg+xml; charset=utf-8';
    case 'ts':
    case 'tsx':
      return 'text/typescript; charset=utf-8';
    case 'xml':
      return 'application/xml; charset=utf-8';
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

export async function readProjectFileFromZipBase64(base64Archive: string, filePath: string) {
  const zip = await JSZip.loadAsync(base64Archive, { base64: true });
  const exactEntry = zip.file(filePath);

  const entry =
    exactEntry ??
    Object.values(zip.files).find((candidate) => {
      if (candidate.dir) {
        return false;
      }

      const normalized = normalizeProjectFilePath(candidate.name);

      return normalized.ok && normalized.path === filePath;
    });

  if (!entry || entry.dir) {
    return undefined;
  }

  const bytes = await entry.async('uint8array');

  return { bytes, sizeBytes: bytes.byteLength };
}
