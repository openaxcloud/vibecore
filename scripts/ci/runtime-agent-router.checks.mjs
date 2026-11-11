import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import test from 'node:test';
import { assertEphemeralEnvironment, createServiceLookup, createRuntimeAgentRouter } from './runtime-agent-router.mjs';

async function listen(server, t) {
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    for (const socket of sockets) {
      socket.destroy();
    }
    server.close();
  });

  return { hostname: '127.0.0.1', port: server.address().port };
}

function send(target, path, { method = 'GET', headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ ...target, path, method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }),
      );
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('explicit isolated environment and kubeconfig required', () => {
  assert.throws(() => assertEphemeralEnvironment({}), /requires/);
  assert.throws(() => createServiceLookup({ env: { KUBECONFIG: '/tmp/test' } }), /requires/);
  assert.throws(() => assertEphemeralEnvironment({ VIBECORE_CI_EPHEMERAL_RUNTIME: '1' }), /requires/);
  assert.doesNotThrow(() =>
    assertEphemeralEnvironment({ VIBECORE_CI_EPHEMERAL_RUNTIME: '1', KUBECONFIG: '/tmp/test' }),
  );
});

test('HTTP forwards actual upstream status, path, query, headers and body', async (t) => {
  const upstream = http.createServer(async (request, response) => {
    const chunks = [];

    for await (const chunk of request) {
      chunks.push(chunk);
    }
    assert.equal(request.url, '/files/a%2Fb?x=1&x=2');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'Bearer test-only-token');
    assert.equal(request.headers['x-test'], 'preserved');
    assert.equal(Buffer.concat(chunks).toString(), 'actual request body');
    response.writeHead(207, { 'x-upstream': 'real', 'set-cookie': ['a=1', 'b=2'] });
    response.end('actual upstream body');
  });

  const target = await listen(upstream, t);
  const seen = [];

  const proxy = await listen(
    createRuntimeAgentRouter({
      lookup: async (id) => {
        seen.push(id);
        return target;
      },
    }),
    t,
  );
  const result = await send(proxy, '/ws-example/files/a%2Fb?x=1&x=2', {
    method: 'POST',
    headers: { authorization: 'Bearer test-only-token', 'x-test': 'preserved' },
    body: 'actual request body',
  });
  assert.deepEqual(seen, ['ws-example']);
  assert.equal(result.status, 207);
  assert.equal(result.headers['x-upstream'], 'real');
  assert.deepEqual(result.headers['set-cookie'], ['a=1', 'b=2']);
  assert.equal(result.body, 'actual upstream body');
});

test('malformed workspace IDs never reach lookup', async (t) => {
  let calls = 0;

  const proxy = await listen(
    createRuntimeAgentRouter({
      lookup: async () => {
        calls++;
        throw new Error();
      },
    }),
    t,
  );

  for (const path of [
    '/',
    '//health',
    '/UPPER/health',
    '/a_b/health',
    '/-abc/health',
    '/abc-/health',
    '/%2e%2e/health',
    '/a%2fb/health',
    `/${'a'.repeat(64)}/health`,
  ]) {
    assert.equal((await send(proxy, path)).status, 400, path);
  }
  assert.equal(calls, 0);
});

test('lookup errors fail as transport errors, never fake runtime success', async (t) => {
  const proxy = await listen(
    createRuntimeAgentRouter({
      lookup: async () => {
        throw new Error('private kubectl details');
      },
    }),
    t,
  );

  const result = await send(proxy, '/ws-valid/health');
  assert.equal(result.status, 502);
  assert.equal(result.body, 'Workspace transport unavailable');
});

test(
  'WebSocket handshake and bidirectional bytes reach actual upstream with all transport markers stripped',
  { timeout: 5000 },
  async (t) => {
    let upstreamMarker;

    const upstream = http.createServer();
    upstream.on('upgrade', (request, socket, head) => {
      upstreamMarker = request.headers['x-vibecore-ci-transport-error'];
      assert.equal(request.url, '/terminal?cols=80');
      assert.equal(request.headers.authorization, 'Bearer test-only-token');
      assert.equal(request.headers['sec-websocket-protocol'], 'terminal');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Protocol: terminal\r\nX-Vibecore-Ci-Transport-Error: upstream-unavailable\r\n\r\n',
      );

      if (head.length) {
        socket.write(head);
      }

      socket.on('data', (data) => socket.write(data));
    });

    const target = await listen(upstream, t);

    const proxy = await listen(
      createRuntimeAgentRouter({
        lookup: async (id) => {
          assert.equal(id, 'ws-123');
          return target;
        },
      }),
      t,
    );

    const socket = net.connect(proxy.port, proxy.hostname);
    t.after(() => socket.destroy());
    await once(socket, 'connect');

    let received = Buffer.alloc(0);

    const complete = new Promise((resolve, reject) => {
      socket.on('error', reject);
      socket.on('data', (data) => {
        received = Buffer.concat([received, data]);

        if (received.includes(Buffer.from('frame-bytes'))) {
          resolve();
        }
      });
    });
    socket.write(
      'GET /ws-123/terminal?cols=80 HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nAuthorization: Bearer test-only-token\r\nSec-WebSocket-Protocol: terminal\r\nX-Vibecore-Ci-Transport-Error: upstream-unavailable\r\n\r\nframe-bytes',
    );
    await complete;
    assert.match(received.toString(), /^HTTP\/1.1 101/);
    assert.match(received.toString(), /sec-websocket-protocol: terminal/i);
    assert.match(received.toString(), /frame-bytes$/);
    assert.deepEqual(
      { upstreamMarker, downstreamMarker: /x-vibecore-ci-transport-error/i.test(received.toString()) },
      { upstreamMarker: undefined, downstreamMarker: false },
    );
  },
);

test('malformed WebSocket workspace route rejects before lookup', { timeout: 5000 }, async (t) => {
  let calls = 0;

  const proxy = await listen(
    createRuntimeAgentRouter({
      lookup: async () => {
        calls++;
        throw new Error();
      },
    }),
    t,
  );

  const socket = net.connect(proxy.port, proxy.hostname);
  t.after(() => socket.destroy());
  await once(socket, 'connect');

  let received = '';
  socket.on('data', (data) => {
    received += data.toString();
  });

  const ended = once(socket, 'end');
  socket.write('GET /bad_id/terminal HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  await ended;
  assert.match(received, /^HTTP\/1.1 400/);
  assert.equal(calls, 0);
});

test('unresponsive upstream terminates with bounded transport error', { timeout: 5000 }, async (t) => {
  const target = await listen(
    http.createServer(() => {}),
    t,
  );

  const proxy = await listen(createRuntimeAgentRouter({ lookup: async () => target, timeoutMs: 30 }), t);
  assert.equal((await send(proxy, '/ws-valid/health')).status, 502);
});

test('only dedicated install POST receives330s response budget', async () => {
  const { agentResponseTimeout } = await import('./runtime-agent-router.mjs');
  assert.equal(agentResponseTimeout('POST', '/packages/v1/install', 120000), 330000);

  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
    assert.equal(agentResponseTimeout(method, '/packages/v1/install', 120000), 120000);
  }

  for (const path of ['/commands/run', '/sessions/v1/start', '/packages/v1/install?x=1', '/packages/v1/install/']) {
    assert.equal(agentResponseTimeout('POST', path, 120000), 120000);
  }
});
