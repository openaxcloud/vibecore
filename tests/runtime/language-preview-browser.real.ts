import { chromium, expect, type Page } from '@playwright/test';
import { signAgentToken } from '../../packages/workspace-sdk/src/index.js';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const projects = {
  node: {
    path: 'main.mjs',
    command: 'node',
    args: ['main.mjs'],
    source: `import http from 'node:http';
import { readFileSync } from 'node:fs';
http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(readFileSync('index.html'));
}).listen(5173);`,
  },
  python: {
    path: 'main.py',
    command: 'python3',
    args: ['main.py'],
    source: `from http.server import HTTPServer, SimpleHTTPRequestHandler
HTTPServer(("0.0.0.0", 5173), SimpleHTTPRequestHandler).serve_forever()`,
  },
  go: {
    path: 'main.go',
    command: 'go',
    args: ['run', 'main.go'],
    source: `package main
import "net/http"
func main() {
  panic(http.ListenAndServe(":5173", http.FileServer(http.Dir("."))))
}`,
  },
};
const [lang, url] = process.argv.slice(2);
assert(Object.hasOwn(projects, lang));
const fixture = projects[lang as keyof typeof projects];
const secret = process.env.PREVIEW_TEST_KEY;
assert(secret);
const token = signAgentToken({ workspaceId: 'preview-test', secret, expiresAt: Date.now() + 180000 });
const headers = { authorization: 'Bearer ' + token };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-proxy-server'] });
async function connect(page: Page) {
  await page.goto(url + '/health');
  return page.evaluateHandle(async (token) => {
    const ws = new WebSocket(
      location.origin.replace('http:', 'ws:') + '/commands/stream?token=' + encodeURIComponent(token),
    );
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(Error('command stream failed'));
    });
    return ws;
  }, token);
}
try {
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  await expect
    .poll(
      async () => {
        try {
          return (await context.request.get(url + '/health', { timeout: 1500 })).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  const controls = await context.newPage();
  const stream = await connect(controls);
  const write = async (path: string, content: string) =>
    expect((await context.request.post(url + '/files/write', { data: { path, content } })).status()).toBe(200);
  const marker = (state: string) => `<html><body><main>${lang}-${state}</main></body></html>`;
  await write(fixture.path, fixture.source);
  await write('index.html', marker('cold'));
  const preview = await context.newPage();
  const previewUrl = url + '/preview/5173/';
  const start = performance.now();
  await stream.evaluate(
    (socket, { command, args }) => {
      socket.send(JSON.stringify({ type: 'hello', payload: { command, args, lifecycle: 'preview-service' } }));
    },
    { command: fixture.command, args: fixture.args },
  );
  await expect
    .poll(
      async () => {
        const response = await preview.goto(previewUrl);
        return response?.status() === 200 ? preview.locator('main').allTextContents() : [];
      },
      { timeout: 90000 },
    )
    .toEqual([lang + '-cold']);
  const coldMs = Math.round(performance.now() - start);
  await write('index.html', marker('edited'));
  const reload = await preview.reload();
  expect(reload?.headers()['cache-control']).toBe('no-store');
  await expect(preview.locator('main')).toHaveText(lang + '-edited');
  await context.close();
  const fresh = await browser.newContext({ extraHTTPHeaders: headers });
  await connect(await fresh.newPage());
  const reopened = await fresh.newPage();
  await reopened.goto(previewUrl);
  await expect(reopened.locator('main')).toHaveText(lang + '-edited');
  await fresh.close();
  console.log(
    JSON.stringify({ language: lang, coldPreviewMs: coldMs, editedPreview: true, freshContextPreview: true }),
  );
} finally {
  await browser.close();
}
