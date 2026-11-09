import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { browserEndpoint, launchRuntimeChromium } from './runtime-browser-client.mjs';

/*
 * Transport guard only: proves browser wildcard-localhost DNS/loopback routing.
 * This synthetic sentinel is not workspace, application or runtime coverage.
 */
test('Chromium resolves a per-preview localhost host to the local HTTP listener', { timeout: 30000 }, async () => {
  const sentinel = 'local-loopback-transport-check';
  const requests = [];
  const sockets = new Set();

  const server = http.createServer((request, response) => {
    requests.push({ host: request.headers.host, path: request.url });
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(sentinel);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  let browser;

  try {
    server.listen(browserEndpoint() ? 18084 : 0, '127.0.0.1');
    await once(server, 'listening');

    const host = `ws-check-5173.localhost:${server.address().port}`;
    browser = await launchRuntimeChromium(chromium, { headless: true, timeout: 10000 });

    const page = await browser.newPage();

    const response = await page.goto(`http://${host}/transport-check`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    assert.equal(response?.status(), 200);
    assert.equal(await page.locator('body').innerText({ timeout: 3000 }), sentinel);
    assert.ok(requests.some((request) => request.host === host && request.path === '/transport-check'));
  } finally {
    try {
      await browser?.close();
    } finally {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
