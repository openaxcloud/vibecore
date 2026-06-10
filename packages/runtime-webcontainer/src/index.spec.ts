import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { WebContainerRuntimeAdapter, type WebContainerLike, type WebContainerProcessLike } from './index.js';

type WebContainerListener = (...args: unknown[]) => void;

class MemoryFs {
  // Store raw bytes, mirroring the real WebContainer fs: readFile() with no
  // encoding returns a Uint8Array, with 'utf-8' returns a string.
  files = new Map<string, Uint8Array>();

  async mkdir() {
    return undefined;
  }

  async readFile(path: string, encoding?: string | { encoding?: string }): Promise<string | Uint8Array> {
    const content = this.files.get(path);

    if (content === undefined) {
      throw new Error(`ENOENT ${path}`);
    }

    const enc = typeof encoding === 'string' ? encoding : encoding?.encoding;

    return enc ? new TextDecoder().decode(content) : content;
  }

  async writeFile(path: string, content: string | Uint8Array) {
    this.files.set(path, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }

  async rm(path: string) {
    this.files.delete(path);
  }

  async rename(oldPath: string, newPath: string) {
    const content = this.files.get(oldPath);

    if (content === undefined) {
      throw new Error(`ENOENT ${oldPath}`);
    }

    this.files.delete(oldPath);
    this.files.set(newPath, content);
  }

  async readdir(path: string) {
    const prefix = path === '.' ? '' : `${path}/`;
    const names = new Set<string>();

    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const remainder = key.slice(prefix.length);
      const [name] = remainder.split('/');
      names.add(name);
    }

    return [...names].map((name) => ({
      name,
      isDirectory: () => [...this.files.keys()].some((key) => key.startsWith(`${prefix}${name}/`)),
      isFile: () => this.files.has(`${prefix}${name}`),
    }));
  }
}

function processWithOutput(output: string, exitCode = 0): WebContainerProcessLike {
  return {
    input: new WritableStream<string>(),
    output: new ReadableStream<string>({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      },
    }),
    exit: Promise.resolve(exitCode),
    kill: vi.fn(),
    resize: vi.fn(),
  };
}

function createWebContainer(): WebContainerLike & {
  fs: MemoryFs;
  emitPort(port: number, type: 'open' | 'close', url: string): void;
} {
  const listeners = new Map<string, WebContainerListener[]>();
  const fs = new MemoryFs();

  return {
    workdir: '/home/project',
    fs,
    spawn: vi.fn(async (command: string, args?: string[]) =>
      processWithOutput(`${command} ${(args ?? []).join(' ')}`.trim()),
    ),
    setPreviewScript: vi.fn(async () => undefined),
    on: vi.fn((event: string, listener: WebContainerListener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return () =>
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((item) => item !== listener),
        );
    }),
    internal: {
      watchPaths: vi.fn((_paths, callback) => {
        callback({ type: 'change', path: 'src/App.tsx' });
        return { close: vi.fn() };
      }),
    },
    emitPort(port: number, type: 'open' | 'close', url: string) {
      for (const listener of listeners.get('port') ?? []) {
        listener(port, type, url);
      }
    },
  };
}

describe('WebContainerRuntimeAdapter', () => {
  it('boots once, preserves file operations, and exposes preview ports', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });

    await adapter.boot();
    await adapter.startWorkspace();
    await adapter.writeFile('src/App.tsx', 'export default function App() {}');

    expect(await adapter.readFile('src/App.tsx')).toContain('App');
    expect(await adapter.listFiles('.')).toEqual([expect.objectContaining({ path: 'src', type: 'directory' })]);

    webcontainer.emitPort(5173, 'open', 'https://5173.local-credentialless.webcontainer-api.io');
    await expect(adapter.getPreviewUrl(5173)).resolves.toEqual({
      port: 5173,
      ready: true,
      url: 'https://5173.local-credentialless.webcontainer-api.io',
    });
  });

  it('streams commands and maps file watch events', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });
    const changes: string[] = [];

    const dispose = await adapter.watchFiles(['src'], (change) => changes.push(`${change.type}:${change.path}`));
    const result = await adapter.runCommand({ command: 'npm', args: ['test'] });
    dispose();

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('npm test');
    expect(changes).toEqual(['update:src/App.tsx']);
  });

  it('normalizes jsh pipeline commands before spawning them', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });

    await adapter.runCommand({ command: '/bin/jsh', args: ['-c', 'cat package.json | head -20'] });

    expect(webcontainer.spawn).toHaveBeenCalledWith(
      '/bin/jsh',
      ['-c', 'cat package.json | head -n 20'],
      expect.any(Object),
    );
  });

  it('preserves binary files through snapshot create + restore (#38)', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });
    await adapter.boot();

    // A binary asset (NUL + non-UTF-8 high bytes) written straight to the fs at
    // the relative key the adapter uses.
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x01]);
    await webcontainer.fs.writeFile('logo.png', pngBytes);
    await webcontainer.fs.writeFile('readme.txt', new TextEncoder().encode('hello'));

    const listed = await adapter.listFiles('.');
    const png = listed.find((f) => f.name === 'logo.png')!;
    expect(png.encoding).toBe('base64');

    const snapshot = await adapter.createSnapshot();

    // Corrupt/replace the live file, then restore the snapshot.
    await webcontainer.fs.writeFile('logo.png', new TextEncoder().encode('corrupted'));
    await adapter.restoreSnapshot(snapshot.id);

    // The restored bytes must equal the original binary exactly — not '' (zeroed)
    // and not a UTF-8-mangled version.
    const restored = (await webcontainer.fs.readFile('logo.png')) as Uint8Array;
    expect(Array.from(restored)).toEqual(Array.from(pngBytes));
    expect(await adapter.readFile('readme.txt')).toBe('hello');
  });

  it('imports real zip archives into the workspace filesystem', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });
    const zip = new JSZip();

    zip.file('index.html', '<main>preview smoke</main>');
    zip.file('src/App.tsx', 'export default function App() {}');

    await adapter.importZip(await zip.generateAsync({ type: 'uint8array' }));

    expect(await adapter.readFile('index.html')).toContain('preview smoke');
    expect(await adapter.readFile('src/App.tsx')).toContain('App');
  });
});
