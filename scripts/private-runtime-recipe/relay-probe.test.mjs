import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { recipeApp, startRecipeBrowserHttp } from './browser-http.ts';
import { coarseNetError, launchOptions, startSyntheticOrigin } from './relay-probe.mjs';

test('browser variants keep the same fixed local proxy, no loopback bypass or DNS fallback', () => {
  const env = { PATH: '/local-fixture' };
  const proxy = 'http://127.0.0.1:12345';
  const raw = launchOptions('raw-v3', proxy, env);
  const explicit = launchOptions('explicit-playwright', proxy, env);

  assert.equal(raw.args[0], `--proxy-server=${proxy}`);
  assert.equal(raw.args[1], '--proxy-bypass-list=<-loopback>');
  assert.deepEqual(explicit.proxy, { server: proxy, bypass: '<-loopback>' });
  assert.deepEqual(explicit.args, [raw.args[2]]);
  assert.match(raw.args[2], /MAP \* ~NOTFOUND$/);
  assert.throws(() => launchOptions('direct-fallback', proxy, env));
});

test('only fixed Chromium network errors can reach output', () => {
  assert.equal(coarseNetError('page.goto: net::ERR_EMPTY_RESPONSE plus data'), 'net::ERR_EMPTY_RESPONSE');
  assert.equal(coarseNetError('cookie=private; net::ERR_FIXTURE_RAW'), 'unclassified');
  assert.equal(coarseNetError('navigation timeout: private path'), 'unclassified');
  assert.equal(coarseNetError(undefined), 'unclassified');
});

async function proxyGet(port, path, headers) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.setTimeout(3_000, () => req.destroy());
    req.on('error', reject);
    req.end();
  });
}

test('authenticated exact relay path is positive; no-auth direct and foreign target stay negative', async () => {
  const origin = await startSyntheticOrigin();
  let relay;

  try {
    relay = await startRecipeBrowserHttp();
    const { path, target, forget } = origin.challenge();
    const url = recipeApp + path;
    const port = Number(new URL(relay.proxy).port);
    const direct = await proxyGet(5173, path, { host: 'localhost:5173' });

    assert.equal(direct.status, 401);
    assert.ok(!direct.body.includes(target.marker));
    assert.equal(relay.saw(`GET ${url}`), false);
    assert.equal(target.authorized, 0);

    // The .invalid literal only reaches the loopback relay, which must deny
    // before making an upstream request. It is not resolved or contacted.
    assert.equal((await proxyGet(port, 'http://never-resolve.invalid/')).status, 403);
    const received = await proxyGet(port, url, { cookie: `vc_probe=${target.secret}` });

    assert.equal(received.status, 200);
    assert.ok(received.body.includes(target.marker));
    assert.equal(relay.saw(`GET ${url}`), true);
    assert.equal(target.hits, 2);
    assert.equal(target.authorized, 1);
    forget();
  } finally {
    try {
      await relay?.close();
    } finally {
      await origin.close();
    }
  }
});
