import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require(process.argv[2] || 'ws');

async function exchange(fragmentCount) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 8 * 1024 * 1024 });
  await once(server, 'listening');

  let peer;

  const outcome = new Promise((resolve) => {
    server.once('connection', (socket) => {
      peer = socket;
      socket.once('error', (error) => resolve({ error: error.code }));
      socket.once('message', (data) => resolve({ bytes: data.length, content: data.toString() }));
    });
  });

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  client.on('error', () => {});

  try {
    await once(client, 'open');

    for (let i = 0; i < fragmentCount; i++) {
      client.send('x', { fin: i === fragmentCount - 1 });
    }

    return await outcome;
  } finally {
    client.terminate();
    peer?.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('real loopback WebSocket rejects excess tiny fragments below maxPayload', async () => {
  // Bounded 16 KiB message, not an OOM reproduction. Default limit is 16,384 fragments.
  const observed = await exchange(16385);
  console.log(JSON.stringify({ scenario: 'fragment-limit', error: observed.error, bytes: observed.bytes }));
  assert.deepEqual(observed, { error: 'WS_ERR_TOO_MANY_BUFFERED_PARTS' });
});

test('real loopback WebSocket preserves ordinary fragmented messages', async () => {
  assert.deepEqual(await exchange(3), { bytes: 3, content: 'xxx' });
});
