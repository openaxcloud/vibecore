import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Cross-service integration fixture.
import { NoopObjectStorage, PROJECT_THUMBNAIL_KEY } from '../../api/src/object-storage.js';
import { buildScreenshotterApp } from './app.js';
import { PlaywrightPageRenderer } from './browser.js';

const executable = process.env.SCREENSHOTTER_PROOF_EXECUTABLE;
const capturerModule = process.env.SCREENSHOTTER_CAPTURER_PROOF_MODULE;

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

/*
 * Real Chromium + screenshotter HTTP + ThumbnailCapturer + filesystem bytes.
 * Synthetic public-preview HTTP replaces the proxy/agent boundary; no cloud storage,
 * user data, external networking or live API authentication is exercised here.
 * Pass the exact capturer source path to validate an unmerged sibling worktree.
 */
describe.skipIf(!executable || !capturerModule)('automatic thumbnail: public preview recovery with real pixels', () => {
  it('rejects initial503, needs a new capture trigger, then writes and reads a PNG', async () => {
    const capturerSource: typeof import('../../api/src/thumbnail-capture.js') = await import(
      /* @vite-ignore */ capturerModule!
    );

    const root = await mkdtemp(join(tmpdir(), 'thumbnail-proof-'));
    const pngPath = join(root, 'project', PROJECT_THUMBNAIL_KEY);

    let ready = false;
    let documentRequests = 0;

    const preview = createServer((_request, response) => {
      documentRequests++;
      response.writeHead(ready ? 200 : 503, { 'content-type': 'text/html' });
      response.end(
        ready
          ? '<!doctype html><html><body style="background:#142b41;color:white"><h1>Synthetic public preview ready</h1></body></html>'
          : '<html><body>Starting dev server</body></html>',
      );
    });

    const previewUrl = await listen(preview);

    const renderer = new PlaywrightPageRenderer({
      chromiumExecutablePath: executable,
      previewProxyUrl: previewUrl,
      previewHostSuffixes: ['preview.fixture.test'],
      settleMs: 0,
      navTimeoutMs: 5000,
    });

    const secret = randomUUID();

    const screenshotter = await buildScreenshotterApp({
      renderer,
      sharedSecret: secret,
      allowedHostSuffixes: ['preview.fixture.test'],
      resolveHost: async () => ['93.184.216.34'],
    });
    await screenshotter.listen({ port: 0, host: '127.0.0.1' });

    const screenshotterUrl = `http://127.0.0.1:${(screenshotter.server.address() as { port: number }).port}`;

    class LocalStorage extends NoopObjectStorage {
      override async ensureBucket() {
        await mkdir(join(root, 'project', 'thumbnails'), { recursive: true });
        return { bucket: 'synthetic-project', created: true, location: 'local-tempdir' };
      }
      override async putObject(projectId?: string, input?: { key: string; body: Uint8Array; contentType?: string }) {
        if (!input) {
          throw new Error('Missing fixture object input');
        }

        expect(projectId).toBe('synthetic-project');
        expect(input.key).toBe(PROJECT_THUMBNAIL_KEY);
        expect(input.contentType).toBe('image/png');
        await writeFile(pngPath, input.body);

        return { key: input.key, size: input.body.length };
      }
    }

    let now = Date.now();

    const warnings: unknown[] = [];

    const capturer = new capturerSource.ThumbnailCapturer({
      storage: new LocalStorage(),
      screenshotterUrl,
      sharedSecret: secret,
      now: () => now,
      log: {
        info: () => undefined,
        warn: (value: unknown) => {
          warnings.push(value);
        },
      },
    });

    try {
      expect(await capturer.capture('synthetic-project', 'http://ws-fixture-5173.preview.fixture.test/')).toBe(false);
      expect(warnings).toContainEqual({ projectId: 'synthetic-project', status: 422 });
      await expect(readFile(pngPath)).rejects.toMatchObject({ code: 'ENOENT' });

      const requestsAfterFailure = documentRequests;
      ready = true;
      now += 5001;

      // Advancing beyond cooldown does not schedule a second capture by itself.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(documentRequests).toBe(requestsAfterFailure);
      await expect(readFile(pngPath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await capturer.capture('synthetic-project', 'http://ws-fixture-5173.preview.fixture.test/')).toBe(true);

      const png = await readFile(pngPath);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(1280);
      expect(png.readUInt32BE(20)).toBe(800);
      expect(documentRequests).toBeGreaterThan(requestsAfterFailure);
      expect(await capturer.capture('synthetic-project', 'http://ws-fixture-5173.preview.fixture.test/')).toBe(false);
      expect(await readFile(pngPath)).toEqual(png);
    } finally {
      await renderer.close();
      await screenshotter.close();
      preview.closeAllConnections();
      await new Promise<void>((resolve, reject) => preview.close((error) => (error ? reject(error) : resolve())));
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
