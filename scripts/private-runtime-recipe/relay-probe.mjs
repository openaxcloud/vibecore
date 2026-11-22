// Synthetic Chromium transport probe. No application, account, database or cluster.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { recipeApp, startRecipeBrowserHttp } from './browser-http.ts';

const branch = 'refs/heads/qa/isolated-reseed-check-20261122';
const resolver = '--host-resolver-rules=MAP localhost 127.0.0.1, MAP * ~NOTFOUND';
const bypass = '<-loopback>';
const port = 5173; // Fixed by the exact recipe relay under test.
const cookie = 'vc_probe';
const allowedErrors = new Set([
  'ERR_ABORTED', 'ERR_ADDRESS_UNREACHABLE', 'ERR_BLOCKED_BY_CLIENT', 'ERR_BLOCKED_BY_RESPONSE',
  'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_RESET', 'ERR_EMPTY_RESPONSE',
  'ERR_FAILED', 'ERR_HTTP_RESPONSE_CODE_FAILURE', 'ERR_INVALID_HTTP_RESPONSE', 'ERR_NAME_NOT_RESOLVED',
  'ERR_PROXY_CONNECTION_FAILED', 'ERR_TIMED_OUT', 'ERR_TUNNEL_CONNECTION_FAILED',
]);

export function coarseNetError(value) {
  const match = typeof value === 'string' ? /\bnet::(ERR_[A-Z0-9_]+)\b/.exec(value) : undefined;

  return match && allowedErrors.has(match[1]) ? `net::${match[1]}` : 'unclassified';
}

export function launchOptions(variant, proxy, env) {
  if (variant === 'raw-v3') {
    return { headless: true, env, args: [`--proxy-server=${proxy}`, `--proxy-bypass-list=${bypass}`, resolver] };
  }

  assert.equal(variant, 'explicit-playwright');

  return { headless: true, env, proxy: { server: proxy, bypass }, args: [resolver] };
}

export async function startSyntheticOrigin() {
  const pending = new Map();

  const server = createServer((request, response) => {
    const target = pending.get(request.url ?? '');
    const headers = {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      connection: 'close',
    };

    if (!target || request.method !== 'GET' || request.headers.host !== 'localhost:5173') {
      response.writeHead(404, headers).end();
      return;
    }

    target.hits += 1;

    if (request.headers.cookie?.trim() !== `${cookie}=${target.secret}`) {
      response.writeHead(401, headers).end();
      return;
    }

    target.authorized += 1;
    response.writeHead(200, headers).end(
      `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Local probe</title><p>${target.marker}</p>`,
    );
  });
  server.on('connect', (_request, socket) => socket.destroy());
  server.on('upgrade', (_request, socket) => socket.destroy());

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return {
    challenge() {
      const path = `/projects/probe-${randomBytes(16).toString('hex')}/ide`;
      const target = { secret: randomBytes(24).toString('hex'), marker: randomBytes(16).toString('hex'), hits: 0, authorized: 0 };
      pending.set(path, target);

      return { path, target, forget: () => pending.delete(path) };
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function tryVariant(chromium, origin, relay, variant) {
  const { path, target, forget } = origin.challenge();
  const url = recipeApp + path;
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  const result = { variant, stage: 'direct-control', directStatus: null, status: null, netError: null,
    originHits: 0, authenticatedOriginHits: 0, exactRelayHit: false, markerMatched: false, ok: false };
  let browser;

  try {
    relay.reset();
    const direct = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { host: 'localhost:5173' }, redirect: 'error', signal: AbortSignal.timeout(2_000),
    });
    result.directStatus = direct.status;
    assert.equal(direct.status, 401);
    assert.equal(target.hits, 1);
    assert.equal(target.authorized, 0);
    assert.equal(relay.saw(`GET ${url}`), false);
    assert.ok(!(await direct.text()).includes(target.marker));

    result.stage = 'browser-launch';
    browser = await chromium.launch({ ...launchOptions(variant, relay.proxy, env), timeout: 15_000 });
    result.stage = 'browser-navigation';
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addCookies([{ name: cookie, value: target.secret, url: recipeApp, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    page.on('requestfailed', (request) => {
      if (request.url() === url) {
        result.netError = coarseNetError(request.failure()?.errorText);
      }
    });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12_000 });
    result.status = response?.status() ?? null;
    result.markerMatched = (await page.locator('p').allTextContents()).includes(target.marker);
    result.exactRelayHit = relay.saw(`GET ${url}`);
    result.ok = result.status === 200 && result.markerMatched && result.exactRelayHit &&
      target.hits === 2 && target.authorized === 1;
    result.stage = result.ok ? 'verified' : 'browser-proof-missing';
  } catch (error) {
    result.netError ??= coarseNetError(error instanceof Error ? error.message : undefined);
  } finally {
    result.originHits = target.hits;
    result.authenticatedOriginHits = target.authorized;
    forget();
    await browser?.close().catch(() => undefined);
  }

  return result;
}

async function main() {
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(process.env.GITHUB_REF, branch);
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  const { chromium } = createRequire(import.meta.url)(`${process.env.RUNNER_TEMP}/reseed-relay-probe/node_modules/playwright`);
  const origin = await startSyntheticOrigin();
  const relay = await startRecipeBrowserHttp().catch(async () => {
    await origin.close();
    throw new Error('local relay unavailable');
  });

  try {
    const results = [];

    for (const variant of ['raw-v3', 'explicit-playwright']) {
      results.push(await tryVariant(chromium, origin, relay, variant));
    }

    console.log(JSON.stringify({ schema: 1, results }, null, 2));

    if (!results.some((result) => result.ok)) {
      process.exitCode = 1;
    }
  } finally {
    try {
      await relay.close();
    } finally {
      await origin.close();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.log(JSON.stringify({ schema: 1, results: [], error: 'probe-setup-or-cleanup' }));
    process.exitCode = 1;
  });
}
