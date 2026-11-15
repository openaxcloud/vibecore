import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { requireLocalLoadTarget } from './local-load-guard.js';

const allowed = ['http://127.0.0.1:3001', 'https://127.0.0.1:65535/', 'http://[::1]:5173/app', 'http://127.0.0.1'];
const rejected = [undefined, '', 'https://e-code.ai', 'https://staging.example.com', 'http://localhost:3001',
  'http://127.0.0.1.evil.example', 'http://user:password@127.0.0.1', 'http://127.0.0.1@evil.example',
  'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://[::ffff:127.0.0.1]',
  'http://127.0.0.1:65536', 'http://127.0.0.1:0', 'http://127.0.0.1:abc',
  'http://127.0.0.1\\@evil.example', 'http://127.0.0.1/%0a', 'http://127.0.0.1?url=https://example.com',
  'http://127.0.0.1#fragment', 'http://127.0.0.1\n', ' http://127.0.0.1', 'ftp://127.0.0.1'];

for (const value of allowed) test(`allows local fixture ${value}`, () => {
  assert.equal(requireLocalLoadTarget({ LOCAL_LOAD_PROOF: '1' }, value), value.replace(/\/+$/, ''));
});
for (const [index, value] of rejected.entries()) test(`rejects unsupported target ${index}`, () => {
  assert.throws(() => requireLocalLoadTarget({ LOCAL_LOAD_PROOF: '1' }, value));
});
for (const optIn of [undefined, '', '0', 'true', 1]) test(`requires exact opt-in ${String(optIn)}`, () => {
  assert.throws(() => requireLocalLoadTarget({ LOCAL_LOAD_PROOF: optIn }, allowed[0]));
});

// Run each script's initialization and one iteration with HTTP stubs: no sockets.
const scripts = ['api-load', 'workspace-lifecycle-load', 'preview-load', 'ai-simulated-load', 'billing-webhook-load'];
function evaluate(name, env) {
  const calls = [];
  const http = Object.fromEntries(['get', 'post'].map(method => [method, (...args) => {
    calls.push({ method, args });
    return { status: 200, body: 'api_request_duration_seconds' };
  }]));
  let source = readFileSync(new URL(`./${name}.js`, import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '').replace('export const options', 'const options')
    .replace(/export default function (\w+)/, 'function $1');
  const functionName = /export default function (\w+)/.exec(readFileSync(new URL(`./${name}.js`, import.meta.url), 'utf8'))[1];
  const context = vm.createContext({ __ENV: env, __VU: 1, __ITER: 0, requireLocalLoadTarget, http, check: () => true, sleep: () => {} });
  vm.runInContext(`${source}\n${functionName}();\nglobalThis.resultOptions = options;`, context);
  return { calls, options: context.resultOptions };
}
for (const name of scripts) {
  test(`${name}: denies missing opt-in and remote target before HTTP`, () => {
    assert.throws(() => evaluate(name, {}));
    assert.throws(() => evaluate(name, { LOCAL_LOAD_PROOF: '1', BASE_URL: 'https://e-code.ai' }));
    if (name === 'preview-load') assert.throws(() => evaluate(name, { LOCAL_LOAD_PROOF: '1', PREVIEW_URL: 'https://example.com' }));
  });
  test(`${name}: every request disables redirects numerically`, () => {
    const { calls, options } = evaluate(name, { LOCAL_LOAD_PROOF: '1', K6_MAX_REDIRECTS: '10' });
    assert.ok(calls.length > 0);
    assert.equal(options.maxRedirects, 0);
    for (const { method, args } of calls) {
      assert.match(args[0], /^http:\/\/127\.0\.0\.1:/);
      assert.equal(args[method === 'get' ? 1 : 2].redirects, 0);
    }
  });
}
