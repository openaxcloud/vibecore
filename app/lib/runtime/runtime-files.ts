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

    if (options.excludeFile?.(node.name) || node.encoding === 'binary') {
      continue;
    }

    const content = node.content ?? (await runtime.readFile(node.path)).content;
    files[toOutputPath(node.path, options.stripPrefix)] = content;
  }
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
