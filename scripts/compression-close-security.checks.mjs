import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const zlib = require('node:zlib');
const compression = require(process.argv[2] || 'compression');
const payload = 'Real HTTP compression lifecycle proof.\n'.repeat(128);

/*
 * Observe the actual native stream allocated by compression. The factory is
 * called unchanged, with its original receiver and arguments; no fake stream,
 * HTTP response, compressor, or destroy implementation is substituted.
 * This script runs in its own process, outside the Vitest worker's globals.
 */
async function exercise(encoding, factory, decode, abort) {
  const descriptor = Object.getOwnPropertyDescriptor(zlib, factory);
  const streams = [];
  Object.defineProperty(zlib, factory, {
    ...descriptor,
    value(...args) {
      const stream = Reflect.apply(descriptor.value, this, args);
      streams.push(stream);

      return stream;
    },
  });

  let response;
  let client;
  let received;
  let resolveClosed;
  let rejectClosed;

  const responseClosed = new Promise((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });

  const middleware = compression({ threshold: 0 });

  const server = http.createServer((request, res) => {
    response = res;
    res.once('close', resolveClosed);
    res.once('error', rejectClosed);
    middleware(request, res, () => {
      res.setHeader('Content-Type', 'text/plain');

      if (abort) {
        res.write(payload);
        res.flush();
      } else {
        res.end(payload);
      }
    });
  });

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const port = server.address().port;

    const result = await new Promise((resolve, reject) => {
      client = http.get({ host: '127.0.0.1', port, agent: false, headers: { 'Accept-Encoding': encoding } });
      client.once('error', reject);
      client.once('response', (res) => {
        received = res;

        const chunks = [];
        res.once('error', reject);
        res.on('data', (chunk) => {
          chunks.push(chunk);

          if (abort) {
            const liveHandles = streams.filter(
              (stream) => typeof stream._handle === 'object' && stream._handle !== null,
            ).length;
            res.destroy();
            client.destroy();
            resolve({ encoding: res.headers['content-encoding'], bytes: chunk.length, liveHandles });
          }
        });

        if (!abort) {
          res.once('end', () => resolve({ encoding: res.headers['content-encoding'], body: Buffer.concat(chunks) }));
        }
      });
    });
    await responseClosed;
    assert.equal(result.encoding, encoding, 'real response negotiated the requested compressor');
    assert.equal(streams.length, 1, 'one real native compressor was allocated');

    if (abort) {
      assert.ok(result.bytes > 0, 'client received compressed bytes before disconnecting');
      assert.equal(result.liveHandles, 1, 'native handle was live before the client abort');
      assert.equal(response.writableFinished, false, 'response was interrupted, not normally completed');

      const observed = { destroyed: streams[0].destroyed, nativeHandleReleased: streams[0]._handle === null };
      process.stdout.write(`${JSON.stringify({ encoding, observed })}\n`);
      assert.deepEqual(observed, { destroyed: true, nativeHandleReleased: true });
    } else {
      assert.equal(decode(result.body).toString(), payload, 'normal compressed response remains intact');
      assert.equal(response.writableFinished, true);
    }
  } finally {
    received?.destroy();
    client?.destroy();
    response?.destroy();

    for (const stream of streams) {
      stream.close();
      stream.destroy();
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    Object.defineProperty(zlib, factory, descriptor);
  }
}

for (const [encoding, factory, decode] of [
  ['gzip', 'createGzip', zlib.gunzipSync],
  ['deflate', 'createDeflate', zlib.inflateSync],
  ['br', 'createBrotliCompress', zlib.brotliDecompressSync],
]) {
  test(`real ${encoding} stream releases native handle on premature HTTP close`, () =>
    exercise(encoding, factory, decode, true));
  test(`real ${encoding} response completes and decompresses unchanged`, () =>
    exercise(encoding, factory, decode, false));
}
