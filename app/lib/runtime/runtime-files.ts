import type { FileNode, RuntimeAdapter } from '@vibecore/runtime-contract';

export async function runtimeDirectoryExists(runtime: RuntimeAdapter, dirPath: string) {
  try {
    await runtime.listFiles(dirPath);
    return true;
  } catch {
    return false;
  }
}

export async function collectRuntimeTextFiles(
  runtime: RuntimeAdapter,
  dirPath: string,
  options: {
    stripPrefix?: string;
    excludeDirectory?: (name: string) => boolean;
    excludeFile?: (name: string) => boolean;
  } = {},
) {
  const files: Record<string, string> = {};
  const nodes = await runtime.listFiles(dirPath);
  await collectNodes(runtime, nodes, files, options);

  return files;
}

async function collectNodes(
  runtime: RuntimeAdapter,
  nodes: FileNode[],
  files: Record<string, string>,
  options: {
    stripPrefix?: string;
    excludeDirectory?: (name: string) => boolean;
    excludeFile?: (name: string) => boolean;
  },
) {
  for (const node of nodes) {
    if (node.type === 'directory') {
      if (!options.excludeDirectory?.(node.name)) {
        await collectNodes(runtime, node.children ?? (await runtime.listFiles(node.path)), files, options);
      }

      continue;
    }

    if (options.excludeFile?.(node.name) || node.encoding === 'binary' || node.encoding === 'base64') {
      continue;
    }

    /*
     * Tree nodes from the workspace-agent carry no `encoding` field, so the
     * guard above can't catch binary assets. Detect them by extension before
     * we even attempt a read.
     */
    if (isBinaryFilePath(node.path)) {
      continue;
    }

    let content = node.content;

    if (content === undefined) {
      const read = await runtime.readFile(node.path);

      /*
       * readFile returns binary files as base64 with `encoding: 'base64'`.
       * Writing that base64 string as if it were UTF-8 source corrupts the
       * asset in the deploy file map, so skip it.
       */
      if (read.encoding === 'base64') {
        continue;
      }

      content = read.content;
    }

    files[toOutputPath(node.path, options.stripPrefix)] = content;
  }
}

/**
 * Extensions whose contents are binary and must never be written into a
 * text-only deploy file map. The workspace-agent file tree carries no
 * `encoding` field, so extension detection is the only signal available
 * before reading a file.
 */
const BINARY_FILE_EXTENSIONS = new Set([
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'icns',
  'webp',
  'avif',
  'tiff',
  'tif',
  'heic',
  'heif',

  // Vector/binary fonts
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',

  // Media
  'mp3',
  'wav',
  'ogg',
  'flac',
  'aac',
  'm4a',
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',

  // Archives & binaries
  'zip',
  'gz',
  'tar',
  'tgz',
  'bz2',
  '7z',
  'rar',
  'wasm',
  'pdf',
  'exe',
  'dll',
  'so',
  'dylib',
  'class',
  'jar',
  'bin',
  'dat',

  // Documents that are zip/binary containers
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
]);

export function isBinaryFilePath(path: string): boolean {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const dot = name.lastIndexOf('.');

  if (dot <= 0) {
    return false;
  }

  return BINARY_FILE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function toOutputPath(path: string, stripPrefix?: string) {
  let outputPath = path;

  if (stripPrefix) {
    const normalizedPrefix = stripPrefix.replace(/^\/+/, '').replace(/\/+$/, '');
    outputPath = outputPath.replace(/^\/+/, '');

    if (outputPath === normalizedPrefix) {
      outputPath = '';
    } else if (outputPath.startsWith(`${normalizedPrefix}/`)) {
      outputPath = outputPath.slice(normalizedPrefix.length + 1);
    }
  }

  return outputPath.replace(/^\/+/, '');
}
