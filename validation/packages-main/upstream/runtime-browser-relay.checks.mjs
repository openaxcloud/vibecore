import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duplex } from 'node:stream';
import test from 'node:test';
import { setImmediate as turn, setTimeout as delay } from 'node:timers/promises';
import { startRelay } from './runtime-browser-relay.mjs';

const loopback = (port = 0) => ({ host: '127.0.0.1', port });
const defaults = { listen: loopback(), target: loopback(8080) };
const body = Buffer.from([0, 13, 10, 127, 128, 255]);

const request = Buffer.concat([
  Buffer.from('POST /a%2Fb/../keep?q=one%20two&q=three HTTP/1.1\r\nHost: localhost:5173\r\nContent-Length: 6\r\n\r\n'),
  body,
]);

const response = Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello');

const upgrade = Buffer.from(
  'GET /socket?token=synthetic%2Ftoken HTTP/1.1\r\nHost: localhost:5173\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n',
);

const switched = Buffer.from('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
const frame = Buffer.from([0x82, 0x86, 1, 2, 3, 4, 0, 255, 128, 13, 10, 42]);

/*
 * Real Node stream pipes, with only socket creation/binding replaced. These checks
 * still exercise byte transfer and lifecycle when the executor forbids binding.
 */
class MemorySocket extends Duplex {
  constructor() {
    super({ allowHalfOpen: true, highWaterMark: 8 });
    this.writes = [];
    this.holdWrites = false;
  }

  _read() {}

  _write(chunk, _encoding, callback) {
    this.writes.push(Buffer.from(chunk));

    if (this.holdWrites) {
      this.releaseWrite = callback;
    } else {
      callback();
    }
  }

  setTimeout(milliseconds, callback) {
    this.timeout = milliseconds;
    this.on('timeout', callback);

    return this;
  }
}

function memoryNetwork(t, { listenError, stallClose = false, connectError } = {}) {
  const outgoing = [];
  const targets = [];

  let server;

  t.mock.method(net, 'createServer', (options, accept) => {
    server = new EventEmitter();
    server.options = options;
    server.accept = accept;

    server.listen = (endpoint) => {
      server.endpoint = endpoint;

      if (listenError) {
        queueMicrotask(() => server.emit('error', listenError));
      } else {
        queueMicrotask(() => server.emit('listening'));
      }

      return server;
    };

    server.address = () => server.endpoint.path ?? { address: '127.0.0.1', port: 12345, family: 'IPv4' };

    server.close = (callback) => {
      server.closed = true;

      if (!stallClose) {
        queueMicrotask(callback);
      }
    };

    server.unref = () => {
      server.unreferenced = true;
    };

    return server;
  });
  t.mock.method(net, 'createConnection', (target) => {
    targets.push(target);

    if (connectError) {
      throw connectError;
    }

    const socket = new MemorySocket();
    outgoing.push(socket);

    return socket;
  });

  return {
    outgoing,
    targets,
    get server() {
      return server;
    },
    accept() {
      const incoming = new MemorySocket();
      server.accept(incoming);

      return incoming;
    },
  };
}

test('refuses arbitrary hosts, ambiguous endpoints and unbounded limits before opening sockets', async (t) => {
  let calls = 0;
  t.mock.method(net, 'createServer', () => calls++);

  const invalid = [
    null,
    '127.0.0.1:8080',
    { host: 'localhost', port: 8080 },
    { host: '0.0.0.0', port: 8080 },
    { host: '::1', port: 8080 },
    { host: '127.0.0.2', port: 8080 },
    { host: 'example.com', port: 8080 },
    { host: '127.0.0.1', port: '8080' },
    loopback(-1),
    loopback(65536),
    { ...loopback(8080), lookup() {} },
    { fd: 3 },
    { path: 'relative.sock' },
    { path: '\0abstract' },
    { path: '/tmp/test\0.sock' },
    { path: '/tmp/test.sock', host: '127.0.0.1' },
  ];

  for (const endpoint of invalid) {
    await assert.rejects(startRelay({ ...defaults, target: endpoint }), /relay_endpoint_invalid/);
    await assert.rejects(startRelay({ ...defaults, listen: endpoint }), /relay_endpoint_invalid/);
  }

  await assert.rejects(startRelay({ ...defaults, target: loopback() }), /relay_endpoint_invalid/);

  for (const option of ['maxConnections', 'idleTimeoutMs', 'connectTimeoutMs']) {
    for (const value of [0, -1, 1.1, Infinity, NaN, '1', 2 ** 31]) {
      await assert.rejects(startRelay({ ...defaults, [option]: value }), /relay_limit_invalid/);
    }
  }

  await assert.rejects(startRelay({ ...defaults, maxConnections: 4097 }), /relay_limit_invalid/);
  assert.equal(calls, 0);
});

test('copies approved endpoint options and preserves HTTP Host, path, query and binary body', async (t) => {
  const network = memoryNetwork(t);
  const target = { path: '/tmp/synthetic-target.sock' };
  const relay = await startRelay({ listen: loopback(), target });
  t.after(() => relay.close());
  target.path = '/tmp/mutated-target.sock';

  const incoming = network.accept();
  incoming.push(request.subarray(0, 19));
  incoming.push(request.subarray(19));
  assert.equal(incoming.isPaused(), true);

  const [outgoing] = network.outgoing;
  outgoing.emit('connect');
  await turn();
  assert.deepEqual(Buffer.concat(outgoing.writes), request);
  assert.deepEqual(network.targets, [{ path: '/tmp/synthetic-target.sock', allowHalfOpen: true }]);
  assert.deepEqual(network.server.endpoint, loopback());
  assert.deepEqual(network.server.options, { allowHalfOpen: true, pauseOnConnect: true });
  outgoing.push(response);
  await turn();
  assert.deepEqual(Buffer.concat(incoming.writes), response);
});

test('forwards upgrades and raw bidirectional frames with backpressure and half-closes', async (t) => {
  const network = memoryNetwork(t);
  const relay = await startRelay({ listen: { path: '/tmp/synthetic-listener.sock' }, target: loopback(8080) });
  t.after(() => relay.close());

  const incoming = network.accept();
  const [outgoing] = network.outgoing;
  outgoing.emit('connect');
  incoming.push(upgrade);
  outgoing.push(switched);
  await turn();
  outgoing.holdWrites = true;
  incoming.push(frame);
  await turn();
  assert.equal(incoming.isPaused(), true);
  assert.equal(outgoing.writableNeedDrain, true);
  outgoing.holdWrites = false;
  outgoing.releaseWrite();
  await turn();
  assert.equal(incoming.isPaused(), false);
  outgoing.push(frame);
  incoming.push(null);
  await turn();
  assert.equal(outgoing.writableEnded, true);
  assert.equal(incoming.destroyed, false, 'a request half-close must leave the response readable');
  assert.deepEqual(Buffer.concat(outgoing.writes), Buffer.concat([upgrade, frame]));
  outgoing.push(null);
  await turn();
  assert.deepEqual(Buffer.concat(incoming.writes), Buffer.concat([switched, frame]));
});

test('bounds connections, reclaims failed slots and applies idle timeouts to both peers', async (t) => {
  const network = memoryNetwork(t);
  const relay = await startRelay({ ...defaults, maxConnections: 1, idleTimeoutMs: 17 });
  t.after(() => relay.close());

  const first = network.accept();
  const rejected = network.accept();
  assert.equal(rejected.destroyed, true);
  assert.equal(network.outgoing.length, 1);
  assert.equal(first.timeout, 17);
  assert.equal(network.outgoing[0].timeout, 17);
  network.outgoing[0].emit('error', new Error('synthetic native error with private details'));
  assert.equal(first.destroyed, true);

  const next = network.accept();
  const second = network.outgoing[1];
  second.emit('connect');
  second.emit('timeout');
  assert.equal(next.destroyed, true);
  assert.equal(second.destroyed, true);

  const third = network.accept();
  third.emit('timeout');
  assert.equal(network.outgoing[2].destroyed, true);
});

test('graceful upstream closure lets queued downstream writes finish flushing', async (t) => {
  const network = memoryNetwork(t);
  const relay = await startRelay(defaults);
  t.after(() => relay.close());

  const incoming = network.accept();
  const [outgoing] = network.outgoing;
  incoming.holdWrites = true;
  outgoing.emit('connect');
  incoming.push(request);
  incoming.push(null);
  await turn();

  const queued = Buffer.from('ok');
  outgoing.push(queued);
  outgoing.push(null);
  await turn();
  assert.equal(outgoing.destroyed, true);
  assert.equal(incoming.destroyed, false);
  incoming.releaseWrite();
  await turn();
  assert.equal(incoming.writableFinished, true);
  assert.deepEqual(Buffer.concat(incoming.writes), queued);
});

test('connect timeout destroys both sockets and ignores a late connect', async (t) => {
  const network = memoryNetwork(t);
  const relay = await startRelay({ ...defaults, connectTimeoutMs: 10 });
  t.after(() => relay.close());

  const incoming = network.accept();
  const [outgoing] = network.outgoing;
  await delay(40);
  assert.equal(incoming.destroyed, true);
  assert.equal(outgoing.destroyed, true);
  outgoing.emit('connect');
  assert.deepEqual(outgoing.writes, []);
});

test('synchronous connection failure releases the incoming socket without escaping', async (t) => {
  const network = memoryNetwork(t, { connectError: new Error('synthetic connect failure') });
  const relay = await startRelay(defaults);
  t.after(() => relay.close());
  assert.equal(network.accept().destroyed, true);
});

test('close is idempotent, destroys connected and pending sockets, and stops accepting', async (t) => {
  const network = memoryNetwork(t);
  const relay = await startRelay(defaults);
  const connected = network.accept();
  network.outgoing[0].emit('connect');

  const pending = network.accept();
  const closing = relay.close();
  assert.equal(relay.close(), closing);
  assert.equal(connected.destroyed, true);
  assert.equal(pending.destroyed, true);
  assert.ok(network.outgoing.every((socket) => socket.destroyed));
  assert.equal(network.accept().destroyed, true);
  assert.equal(network.server.closed, true);
  await closing;
});

test('close has a deadline even if a listener never reports completion', { timeout: 3000 }, async (t) => {
  const network = memoryNetwork(t, { stallClose: true });
  const relay = await startRelay(defaults);
  const incoming = network.accept();
  const started = Date.now();
  await relay.close();
  assert.equal(incoming.destroyed, true);
  assert.equal(network.server.closed, true);
  assert.equal(network.server.unreferenced, true);
  assert.ok(Date.now() - started < 2500);
});

test('listener errors fail closed without exposing native messages or addresses', async (t) => {
  const listenError = Object.assign(new Error('PRIVATE native path and address'), { code: 'EPERM' });
  const network = memoryNetwork(t, { listenError });
  await assert.rejects(startRelay(defaults), (error) => {
    assert.equal(error.message, 'relay_listen_failed');
    assert.equal(error.code, 'EPERM');
    assert.equal(error.cause, undefined);

    return true;
  });
  assert.equal(network.server.closed, true);
});

test('module has no payload persistence, logging, process execution or protocol rewriting', async () => {
  const source = await readFile(new URL('./runtime-browser-relay.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|child_process|http|https)|console\.|\.writeFile|\.appendFile|\.setHeader\(/);
});

async function realExchange(t, includeUnix) {
  const sockets = new Set();
  const relays = [];

  let accept;
  let directory;

  const target = net.createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    accept(socket);
  });

  try {
    const listening = once(target, 'listening');
    target.listen(loopback());
    await listening;
  } catch (error) {
    target.close();

    if (process.env.GITHUB_ACTIONS !== 'true' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip(`Local socket binding is unavailable (${error.code}); synthetic stream/lifecycle checks still ran.`);

      return;
    }

    throw error;
  }

  try {
    let destination = loopback(target.address().port);

    if (includeUnix) {
      directory = await mkdtemp(join(tmpdir(), 'vibecore-relay-'));

      const unix = { path: join(directory, 'relay.sock') };
      relays.push(await startRelay({ listen: unix, target: destination }));
      destination = unix;
    }

    const relay = await startRelay({ listen: loopback(), target: destination });
    relays.push(relay);

    async function exchange(first, second, firstReply, secondReply = Buffer.alloc(0)) {
      const received = [];

      accept = (socket) => {
        let bytes = Buffer.alloc(0);
        let upgraded = false;
        socket.on('data', (chunk) => {
          bytes = Buffer.concat([bytes, chunk]);

          if (second && !upgraded && bytes.length >= first.length) {
            upgraded = true;
            socket.write(firstReply);
          }

          if (bytes.length === first.length + (second?.length ?? 0)) {
            received.push(bytes);
            socket.end(second ? secondReply : firstReply);
          }
        });
      };

      const socket = net.createConnection(loopback(relay.address.port));
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));

      const replies = [];

      let sentSecond = false;

      socket.on('data', (chunk) => {
        replies.push(chunk);

        if (second && !sentSecond && Buffer.concat(replies).length >= firstReply.length) {
          sentSecond = true;
          socket.end(second);
        }
      });

      const ended = once(socket, 'end');
      await once(socket, 'connect');

      if (second) {
        socket.write(first);
      } else {
        socket.end(first);
      }

      await ended;
      assert.deepEqual(Buffer.concat(received), second ? Buffer.concat([first, second]) : first);
      assert.deepEqual(Buffer.concat(replies), Buffer.concat([firstReply, secondReply]));
    }

    await exchange(request, null, response);
    await exchange(upgrade, frame, switched, frame);
  } catch (error) {
    if (process.env.GITHUB_ACTIONS !== 'true' && ['EPERM', 'EACCES'].includes(error.code)) {
      t.skip(`Local socket binding is unavailable (${error.code}); synthetic stream/lifecycle checks still ran.`);
    } else {
      throw error;
    }
  } finally {
    await Promise.all(relays.map((relay) => relay.close()));

    for (const socket of sockets) {
      socket.destroy();
    }

    await new Promise((resolve) => target.close(resolve));

    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

test('real TCP relay preserves HTTP and upgraded bytes', { timeout: 10000 }, (t) => realExchange(t, false));
test('real TCP-to-Unix-to-TCP relay preserves HTTP and upgraded bytes', { timeout: 10000 }, (t) =>
  realExchange(t, true),
);
