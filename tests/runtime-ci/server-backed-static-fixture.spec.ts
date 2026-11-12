import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { serverBackedStaticFiles, staticServerSource } from './server-backed-static-fixture';

const require = createRequire(import.meta.url);

describe('server-backed static runtime fixture', () => {
  it('uses a dependency-free Node dev script and valid CommonJS source', () => {
    const files = serverBackedStaticFiles('real-pod-marker');
    expect(JSON.parse(files['package.json'])).toEqual({ private: true, scripts: { dev: 'node server.cjs' } });
    expect(() => new vm.Script(files['server.cjs'])).not.toThrow();
    expect(files['index.html']).toContain('<main id="app">real-pod-marker</main>');
  });

  it('binds the pod interface, announces readiness only after listening, and reads the actual HTML file', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'runtime-static-fixture-'));
    const log = vi.fn();

    let handler!: (request: { url: string; method: string }, response: object) => void;
    let ready!: () => void;

    const listen = vi.fn((_port, _host, callback) => {
      ready = callback;
    });

    try {
      writeFileSync(path.join(directory, 'index.html'), 'first HTML');
      vm.runInNewContext(staticServerSource, {
        __dirname: directory,
        URL,
        console: { log },
        require: (name: string) =>
          name === 'node:http'
            ? {
                createServer: (callback: typeof handler) => {
                  handler = callback;
                  return { listen };
                },
              }
            : require(name),
      });
      expect(listen).toHaveBeenCalledWith(5173, '0.0.0.0', expect.any(Function));
      expect(log).not.toHaveBeenCalled();
      ready();
      expect(log).toHaveBeenCalledWith('Static fixture ready at http://0.0.0.0:5173/');

      for (const url of ['/', '/index.html']) {
        writeFileSync(path.join(directory, 'index.html'), `updated HTML for ${url}`);

        const response = { writeHead: vi.fn(), end: vi.fn() };
        handler({ url, method: 'GET' }, response);
        expect(response.writeHead).toHaveBeenCalledWith(
          200,
          expect.objectContaining({ 'content-type': 'text/html; charset=utf-8' }),
        );
        expect(response.end).toHaveBeenCalledWith(readFileSync(path.join(directory, 'index.html')));
      }

      const missing = { writeHead: vi.fn(), end: vi.fn() };
      handler({ url: '/not-a-file', method: 'GET' }, missing);
      expect(missing.writeHead).toHaveBeenCalledWith(404, expect.any(Object));

      const head = { writeHead: vi.fn(), end: vi.fn() };
      handler({ url: '/', method: 'HEAD' }, head);
      expect(head.end).toHaveBeenCalledWith(undefined);
      rmSync(path.join(directory, 'index.html'));

      const unreadable = { writeHead: vi.fn(), end: vi.fn() };
      handler({ url: '/', method: 'GET' }, unreadable);
      expect(unreadable.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
