import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { WebContainerRuntimeAdapter, type WebContainerLike, type WebContainerProcessLike } from './index.js';

type WebContainerListener = (...args: unknown[]) => void;

class MemoryFs {
  /*
   * Store raw bytes, mirroring the real WebContainer fs: readFile() with no
   * encoding returns a Uint8Array, with 'utf-8' returns a string.
   */
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

    expect((await adapter.readFile('src/App.tsx')).content).toContain('App');
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

    /*
     * A binary asset (NUL + non-UTF-8 high bytes) written straight to the fs at
     * the relative key the adapter uses.
     */
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

    /*
     * The restored bytes must equal the original binary exactly — not '' (zeroed)
     * and not a UTF-8-mangled version.
     */
    const restored = (await webcontainer.fs.readFile('logo.png')) as Uint8Array;
    expect(Array.from(restored)).toEqual(Array.from(pngBytes));
    expect(await adapter.readFile('readme.txt')).toEqual({ content: 'hello', encoding: 'utf8' });

    // readFile() must base64-encode the binary blob, not utf8-mangle it.
    const readBinary = await adapter.readFile('logo.png');
    expect(readBinary.encoding).toBe('base64');
    expect(Array.from(Buffer.from(readBinary.content, 'base64'))).toEqual(Array.from(pngBytes));
  });

  it('decodes base64 content to raw bytes when writeFile is given encoding "base64"', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });
    await adapter.boot();

    /*
     * A binary asset (NUL + non-UTF-8 high bytes) the way files.ts hands it off:
     * base64-encoded, with encoding:'base64'.
     */
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x01]);
    const base64 = Buffer.from(pngBytes).toString('base64');

    await adapter.writeFile('assets/logo.png', base64, 'base64');

    /*
     * The file on disk must be the decoded bytes — NOT the base64 string written
     * verbatim as text (the corruption this fix addresses).
     */
    const onDisk = (await webcontainer.fs.readFile('assets/logo.png')) as Uint8Array;
    expect(Array.from(onDisk)).toEqual(Array.from(pngBytes));

    // createFile routes through writeFile and must honor the encoding too.
    await adapter.createFile('assets/icon.png', base64, 'base64');

    const iconOnDisk = (await webcontainer.fs.readFile('assets/icon.png')) as Uint8Array;
    expect(Array.from(iconOnDisk)).toEqual(Array.from(pngBytes));

    // Round-trips back out as base64 (binary classification preserved).
    const readBack = await adapter.readFile('assets/logo.png');
    expect(readBack.encoding).toBe('base64');
    expect(Array.from(Buffer.from(readBack.content, 'base64'))).toEqual(Array.from(pngBytes));
  });

  it('writes content verbatim as text when no encoding (utf8) is given', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });
    await adapter.boot();

    /*
     * A base64-looking string with no encoding flag is plain text and must be
     * stored as-is (not accidentally decoded).
     */
    await adapter.writeFile('notes/data.txt', 'aGVsbG8=');

    const onDisk = (await webcontainer.fs.readFile('notes/data.txt')) as Uint8Array;
    expect(new TextDecoder().decode(onDisk)).toBe('aGVsbG8=');
  });

  it('returns no matches instead of throwing on a malformed regex search query', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });
    await adapter.boot();

    await adapter.writeFile('src/App.tsx', 'const value = [1, 2, 3];');

    /*
     * No internal.textSearch is provided by the test harness, so this exercises
     * the #searchByReadingFiles fallback. An unbalanced '[' is an invalid regex.
     */
    await expect(adapter.searchFiles('[', { isRegex: true })).resolves.toEqual([]);
    await expect(adapter.searchFiles('(unclosed', { isRegex: true })).resolves.toEqual([]);

    // A valid regex still works.
    const matches = await adapter.searchFiles('value', { isRegex: true });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]).toMatchObject({ path: 'src/App.tsx', lineNumber: 1 });
  });

  it('imports real zip archives into the workspace filesystem', async () => {
    const webcontainer = createWebContainer();
    const adapter = new WebContainerRuntimeAdapter({ webcontainer });
    const zip = new JSZip();

    zip.file('index.html', '<main>preview smoke</main>');
    zip.file('src/App.tsx', 'export default function App() {}');

    await adapter.importZip(await zip.generateAsync({ type: 'uint8array' }));

    expect((await adapter.readFile('index.html')).content).toContain('preview smoke');
    expect((await adapter.readFile('src/App.tsx')).content).toContain('App');
  });
});
