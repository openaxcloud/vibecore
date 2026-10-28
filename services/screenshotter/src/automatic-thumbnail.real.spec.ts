import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Cross-service integration fixture.
import { buildApiApp } from '../../api/src/app.js';
// eslint-disable-next-line no-restricted-imports -- Cross-service integration fixture.
import { NoopObjectStorage, PROJECT_THUMBNAIL_KEY } from '../../api/src/object-storage.js';
// eslint-disable-next-line no-restricted-imports -- Existing synthetic store.
import { TestApiStore } from '../../api/src/tests/test-api-store.js';
// eslint-disable-next-line no-restricted-imports -- Actual capturer paired with this branch.
import { ThumbnailCapturer } from '../../api/src/thumbnail-capture.js';
import { buildScreenshotterApp } from './app.js';
import { PlaywrightPageRenderer } from './browser.js';

const executable = process.env.SCREENSHOTTER_PROOF_EXECUTABLE;

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

/*
 * Real Chromium + screenshotter HTTP + ThumbnailCapturer + filesystem bytes.
 * Synthetic public-preview HTTP replaces the proxy/agent boundary; no cloud storage,
 * user data, external networking or live API authentication is exercised here.
 * Uses the capturer from this branch; the original815 proof was run before the local merge.
 */
describe.skipIf(!executable)('automatic thumbnail: public preview recovery with real pixels', () => {
  it('rejects initial503, needs a new capture trigger, then writes and reads a PNG', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thumbnail-proof-'));
    const pngPath = join(root, 'project', PROJECT_THUMBNAIL_KEY);
    const store = new TestApiStore();

    const user = await store.createUser({
      email: 'thumbnail@example.test',
      name: 'Synthetic owner',
      passwordHash: 'unused-fixture-hash',
    });

    const org = await store.createOrganization({ name: 'Synthetic', slug: 'synthetic', ownerUserId: user.id });
    const project = await store.createProject({ organizationId: org.id, name: 'Synthetic', slug: 'synthetic' });
    const session = randomUUID();
    await store.createSession({ userId: user.id, token: session, expiresAt: new Date(Date.now() + 60_000) });

    const readSecret = randomUUID();
    const expiresAt = Date.now() + 60_000;

    const readSignature = createHmac('sha256', readSecret)
      .update(`${project.id}:${PROJECT_THUMBNAIL_KEY}:${expiresAt}`)
      .digest('hex');

    let ready = false;
    let documentRequests = 0;

    const preview = createServer((request, response) => {
      if (request.url?.startsWith('/stored-thumbnail')) {
        const url = new URL(request.url, 'http://fixture');

        if (url.searchParams.get('signature') !== readSignature || Date.now() > expiresAt) {
          response.writeHead(403).end();
          return;
        }

        void readFile(pngPath).then(
          (bytes) => {
            response.writeHead(200, { 'content-type': 'image/png' });
            response.end(bytes);
          },
          () => response.writeHead(404).end(),
        );

        return;
      }

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

        expect(projectId).toBe(project.id);
        expect(input.key).toBe(PROJECT_THUMBNAIL_KEY);
        expect(input.contentType).toBe('image/png');
        await writeFile(pngPath, input.body);

        return { key: input.key, size: input.body.length };
      }
      override async listObjects() {
        try {
          const bytes = await readFile(pngPath);
          return {
            objects: [
              {
                key: PROJECT_THUMBNAIL_KEY,
                size: bytes.length,
                updated: new Date().toISOString(),
                contentType: 'image/png',
                etag: 'fixture',
              },
            ],
            folders: [],
          };
        } catch {
          return { objects: [], folders: [] };
        }
      }
      override async createDownloadUrl() {
        return {
          url: `${previewUrl}/stored-thumbnail?signature=${readSignature}`,
          expiresAt: new Date(expiresAt).toISOString(),
        };
      }
    }

    let now = Date.now();

    const warnings: unknown[] = [];

    const storage = new LocalStorage();

    const capturer = new ThumbnailCapturer({
      storage,
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

    const previousStorageFlag = process.env.OBJECT_STORAGE_ENABLED;
    process.env.OBJECT_STORAGE_ENABLED = 'true';

    const api = await buildApiApp({
      store,
      objectStorage: storage,
      thumbnailCapturer: capturer,
      emailProvider: { send: async () => undefined },
    });

    try {
      const initial = await api.inject({
        method: 'POST',
        url: `/projects/${project.id}/thumbnail/refresh`,
        headers: { authorization: `Bearer ${session}` },
        payload: { url: 'http://ws-fixture-5173.preview.fixture.test/' },
      });
      expect(initial.statusCode).toBe(200);
      expect(initial.json()).toEqual({ status: 'failed', reason: 'capture-error', enabled: true });
      expect(warnings).toContainEqual({ projectId: project.id, status: 422 });
      await expect(readFile(pngPath)).rejects.toMatchObject({ code: 'ENOENT' });

      const requestsAfterFailure = documentRequests;
      ready = true;
      now += 5001;

      // Advancing beyond cooldown does not schedule a second capture by itself.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(documentRequests).toBe(requestsAfterFailure);
      await expect(readFile(pngPath)).rejects.toMatchObject({ code: 'ENOENT' });

      const refreshed = await api.inject({
        method: 'POST',
        url: `/projects/${project.id}/thumbnail/refresh`,
        headers: { authorization: `Bearer ${session}` },
        payload: { url: 'http://ws-fixture-5173.preview.fixture.test/' },
      });
      expect(refreshed.statusCode).toBe(200);
      expect(refreshed.json()).toEqual({ status: 'stored', enabled: true });

      const png = await readFile(pngPath);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(1280);
      expect(png.readUInt32BE(20)).toBe(800);
      expect(documentRequests).toBeGreaterThan(requestsAfterFailure);
      expect(await capturer.capture(project.id, 'http://ws-fixture-5173.preview.fixture.test/')).toBe(false);
      expect(await readFile(pngPath)).toEqual(png);

      const denied = await api.inject({ method: 'GET', url: `/projects/${project.id}/thumbnail` });
      expect(denied.statusCode).toBe(401);

      const otherUser = await store.createUser({
        email: 'other-thumbnail@example.test',
        name: 'Other fixture',
        passwordHash: 'unused',
      });

      const otherSession = randomUUID();
      await store.createSession({
        userId: otherUser.id,
        token: otherSession,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const forbidden = await api.inject({
        method: 'GET',
        url: `/projects/${project.id}/thumbnail`,
        headers: { authorization: `Bearer ${otherSession}` },
      });
      expect([403, 404]).toContain(forbidden.statusCode);

      const thumbnail = await api.inject({
        method: 'GET',
        url: `/projects/${project.id}/thumbnail`,
        headers: { authorization: `Bearer ${session}` },
      });
      expect(thumbnail.statusCode).toBe(200);

      const download = await fetch(thumbnail.json<{ url: string }>().url);
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toBe('image/png');
      expect(Buffer.from(await download.arrayBuffer())).toEqual(png);

      const forbiddenDownload = await fetch(`${previewUrl}/stored-thumbnail?signature=wrong`);
      expect(forbiddenDownload.status).toBe(403);
    } finally {
      await api.close();

      if (previousStorageFlag === undefined) {
        delete process.env.OBJECT_STORAGE_ENABLED;
      } else {
        process.env.OBJECT_STORAGE_ENABLED = previousStorageFlag;
      }

      await renderer.close();
      await screenshotter.close();
      preview.closeAllConnections();
      await new Promise<void>((resolve, reject) => preview.close((error) => (error ? reject(error) : resolve())));
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
