import { randomUUID } from 'node:crypto';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Real cross-service contract fixture, no app alias applies.
import { buildPreviewProxyApp, signPreviewTenantToken } from '../../preview-proxy/src/app.js';
import { buildScreenshotterApp } from './app.js';
import { PlaywrightPageRenderer } from './browser.js';

const executable = process.env.SCREENSHOTTER_PROOF_EXECUTABLE;

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

/*
 * Opt-in diagnostic: real Chromium, real screenshotter and preview-proxy applications.
 * Only the port-access API and agent HTML are synthetic loopback HTTP fixtures.
 * No cookies are injected into the renderer, no network/auth policy is disabled.
 */
describe.skipIf(!executable)('automatic thumbnail private-preview authentication: real browser', () => {
  it.each([false, true])(
    'refuses anonymous capture with tenant enforcement=%s while owner can read preview',
    async (enforceTenant) => {
      const secret = randomUUID();
      const agentToken = randomUUID();
      const captureSecret = randomUUID();
      const workspaceId = 'ws-thumbnail-fixture';

      let upstreamRequests = 0;
      let upstreamCookie: string | undefined;
      let accessRequests = 0;

      const api = createServer((request, response) => {
        if (
          request.headers.authorization !== `Bearer ${secret}` ||
          !request.url?.startsWith('/internal/preview/port-access?')
        ) {
          response.writeHead(403).end();
          return;
        }

        accessRequests++;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ private: true }));
      });
      const upstream = createServer((request, response) => {
        upstreamRequests++;
        upstreamCookie = request.headers.cookie;

        if (request.headers.authorization !== `Bearer ${agentToken}`) {
          response.writeHead(403).end();
          return;
        }

        response.setHeader('content-type', 'text/html');
        response.end('<!doctype html><html><body><h1>Synthetic private project</h1></body></html>');
      });

      const apiUrl = await listen(api);
      const upstreamUrl = await listen(upstream);
      const resolvedOrgs: Array<string | undefined> = [];

      const proxy = await buildPreviewProxyApp({
        enforcePrivatePorts: true,
        enforceTenant,
        tenantSecret: secret,
        proxySharedSecret: secret,
        apiBaseUrl: apiUrl,
        previewDomain: 'preview.fixture.test',

        resolveAgent: async (id, orgId) => {
          expect(id).toBe(workspaceId);
          resolvedOrgs.push(orgId);

          return { baseUrl: upstreamUrl, token: agentToken };
        },
      });

      const proxyRequests: Array<{ cookie: boolean; host: string | undefined; status?: number }> = [];
      proxy.addHook('onResponse', async (request, reply) => {
        proxyRequests.push({
          cookie: Boolean(request.headers.cookie),
          host: request.headers.host,
          status: reply.statusCode,
        });
      });
      await proxy.listen({ port: 0, host: '127.0.0.1' });

      const proxyUrl = `http://127.0.0.1:${(proxy.server.address() as { port: number }).port}`;
      const host = `${workspaceId}-5173.preview.fixture.test`;

      const renderer = new PlaywrightPageRenderer({
        chromiumExecutablePath: executable,
        previewProxyUrl: proxyUrl,
        previewHostSuffixes: ['preview.fixture.test'],
        settleMs: 0,
        resolveHost: async () => ['93.184.216.34'],
        navTimeoutMs: 5000,
      });
      const app = await buildScreenshotterApp({
        renderer,
        sharedSecret: captureSecret,
        allowedHostSuffixes: ['preview.fixture.test'],
        resolveHost: async () => ['93.184.216.34'],
      });

      try {
        // Positive control: the existing signed owner cookie reaches actual preview HTML.
        const owner = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
          const request = httpRequest(
            proxyUrl,
            {
              headers: {
                host,
                cookie: `vc_preview=${signPreviewTenantToken('org-fixture', Date.now() + 60_000, secret)}`,
              },
            },
            (response) => {
              let body = '';
              response.setEncoding('utf8');
              response.on('data', (chunk) => {
                body += chunk;
              });
              response.on('end', () => resolve({ status: response.statusCode, body }));
              response.on('error', reject);
            },
          );
          request.setTimeout(5000, () => request.destroy(new Error('Owner preview HTTP timed out')));
          request.on('error', reject);
          request.end();
        });
        expect(owner.status).toBe(200);
        expect(owner.body).toContain('Synthetic private project');
        expect(upstreamRequests).toBe(1);
        expect(upstreamCookie).toBeUndefined();
        expect(accessRequests).toBe(1);

        if (enforceTenant) {
          expect(resolvedOrgs).toEqual(['org-fixture']);
        }

        proxyRequests.length = 0;

        const capture = await app.inject({
          method: 'POST',
          url: '/capture',
          headers: { authorization: `Bearer ${captureSecret}` },
          payload: { url: `http://${host}/` },
        });
        expect(capture.statusCode).toBe(422);
        expect(capture.json()).toEqual({ error: 'target page returned an error status', code: 'TARGET_PAGE_ERROR' });
        expect(upstreamRequests).toBe(1);
        expect(proxyRequests).toContainEqual({ cookie: false, host, status: enforceTenant ? 403 : 401 });
      } finally {
        await renderer.close();
        await app.close();
        await proxy.close();
        await Promise.all([close(api), close(upstream)]);
      }
    },
    30_000,
  );
});
