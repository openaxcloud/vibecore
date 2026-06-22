import type { FileNode, RuntimeAdapter } from '@vibecore/runtime-contract';
import { describe, expect, it } from 'vitest';
import { collectRuntimeTextFiles, isBinaryFilePath } from './runtime-files';

/**
 * Minimal in-memory RuntimeAdapter test double. Only the file-read methods
 * exercised by collectRuntimeTextFiles are implemented; everything else throws
 * if touched so accidental reliance is caught.
 */
function makeRuntime(opts: {
  tree: FileNode[];
  reads?: Record<string, { content: string; encoding?: 'utf8' | 'base64' }>;
}): RuntimeAdapter {
  const reads = opts.reads ?? {};

  const adapter = {
    async listFiles(path = '.') {
      if (path === '.' || path === '/' || path === '') {
        return opts.tree;
      }

      // Resolve a directory node by path for the lazy `node.children` fallback.
      const find = (nodes: FileNode[]): FileNode | undefined => {
        for (const node of nodes) {
          if (node.path === path) {
            return node;
          }

          if (node.children) {
            const hit = find(node.children);

            if (hit) {
              return hit;
            }
          }
        }

        return undefined;
      };

      return find(opts.tree)?.children ?? [];
    },
    async readFile(path: string) {
      if (!(path in reads)) {
        throw new Error(`unexpected readFile(${path})`);
      }

      return reads[path];
    },
  } as unknown as RuntimeAdapter;

  return adapter;
}

const file = (path: string, name: string, extra: Partial<FileNode> = {}): FileNode => ({
  path,
  name,
  type: 'file',
  ...extra,
});

describe('isBinaryFilePath', () => {
  it('flags common binary asset extensions', () => {
    for (const p of [
      'logo.png',
      'photo.JPG',
      'icon.ico',
      'font.woff2',
      'module.wasm',
      '/assets/hero.webp',
      'C:\\app\\bundle.zip',
      'doc.pdf',
    ]) {
      expect(isBinaryFilePath(p), p).toBe(true);
    }
  });

  it('treats source/text files as non-binary', () => {
    for (const p of ['index.ts', 'styles.css', 'README.md', 'data.json', 'app.svg', 'page.html']) {
      expect(isBinaryFilePath(p), p).toBe(false);
    }
  });

  it('handles dotfiles and extensionless files', () => {
    expect(isBinaryFilePath('.gitignore')).toBe(false);
    expect(isBinaryFilePath('Dockerfile')).toBe(false);
  });
});

describe('collectRuntimeTextFiles binary handling', () => {
  it('skips a binary asset detected by extension (tree nodes carry no encoding)', async () => {
    const runtime = makeRuntime({
      tree: [
        file('/src/index.ts', 'index.ts'),
        file('/public/logo.png', 'logo.png'), // no encoding field, as the agent tree sends
      ],
      reads: {
        '/src/index.ts': { content: 'export const x = 1;\n', encoding: 'utf8' },

        // logo.png must NOT be read; if it were, this base64 would corrupt output.
        '/public/logo.png': { content: 'iVBORw0KGgo=', encoding: 'base64' },
      },
    });

    const files = await collectRuntimeTextFiles(runtime, '.');

    expect(files).toEqual({ 'src/index.ts': 'export const x = 1;\n' });
    expect(files['public/logo.png']).toBeUndefined();
  });

  it('skips a file when readFile reports base64 encoding (no extension hint)', async () => {
    const runtime = makeRuntime({
      tree: [file('/data/blob', 'blob')], // no extension, no inline content
      reads: {
        '/data/blob': { content: 'AAEC', encoding: 'base64' },
      },
    });

    const files = await collectRuntimeTextFiles(runtime, '.');

    expect(files).toEqual({});
  });

  it('skips nodes pre-tagged with binary or base64 encoding without reading', async () => {
    const runtime = makeRuntime({
      tree: [
        file('/a.bin', 'a.bin', { encoding: 'binary', content: 'rawbytes' }),
        file('/b.dat', 'b.dat', { encoding: 'base64', content: 'AAEC' }),
        file('/c.txt', 'c.txt', { content: 'hello', encoding: 'utf8' }),
      ],
    });

    const files = await collectRuntimeTextFiles(runtime, '.');

    expect(files).toEqual({ 'c.txt': 'hello' });
  });

  it('keeps utf8 text read lazily and applies stripPrefix', async () => {
    const runtime = makeRuntime({
      tree: [
        {
          path: '/project',
          name: 'project',
          type: 'directory',
          children: [file('/project/main.js', 'main.js')],
        },
      ],
      reads: {
        '/project/main.js': { content: 'console.log(1);\n' }, // encoding omitted == utf8
      },
    });

    const files = await collectRuntimeTextFiles(runtime, '.', { stripPrefix: 'project' });

    expect(files).toEqual({ 'main.js': 'console.log(1);\n' });
  });
});
