import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { WebContainerRuntimeAdapter, type WebContainerLike, type WebContainerProcessLike } from './index';

class MemoryFs {
  files = new Map<string, string>();

  async mkdir() {}

  async readFile(path: string) {
    const content = this.files.get(path);

    if (content === undefined) {
      throw new Error(`ENOENT ${path}`);
    }

    return content;
  }

  async writeFile(path: string, content: string | Uint8Array) {
    this.files.set(path, typeof content === 'string' ? content : new TextDecoder().decode(content));
  }

  async rm(path: string) {
    this.files.delete(path);
  }

  async rename(oldPath: string, newPath: string) {
    const content = await this.readFile(oldPath);
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
  const listeners = new Map<string, Function[]>();
  const fs = new MemoryFs();

  return {
    workdir: '/home/project',
    fs,
    spawn: vi.fn(async (command: string, args?: string[]) =>
      processWithOutput(`${command} ${(args ?? []).join(' ')}`.trim()),
    ),
    setPreviewScript: vi.fn(async () => {}),
    on: vi.fn((event: string, listener: Function) => {
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
