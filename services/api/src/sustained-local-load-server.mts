/** Child API for the opt-in disposable local load proof; never a deployment entrypoint. */
import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

assert.equal(process.env.LOCAL_LOAD_PROOF, '1');
assert.equal(process.env.NODE_ENV, 'test');

const database = new URL(process.env.DATABASE_URL!);
const redis = new URL(process.env.REDIS_URL!);
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.port, '55436');
assert.equal(database.pathname, '/sustained_load_proof');
assert.equal(redis.hostname, '127.0.0.1');
assert.equal(redis.port, '56376');
assert.ok(process.send, 'Must run as the owned IPC child of the local proof');

let blockedOutbound = 0;

const originalFetch = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));

  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || isIP(url.hostname) !== 4) {
    blockedOutbound++;
    return Promise.reject(new Error('LOCAL_LOAD_EXTERNAL_HTTP_FORBIDDEN'));
  }

  return originalFetch(input, init);
};

const { buildApiApp } = await import('./app.js');
const storeModule = await import('./prisma-store.js');
const store = new storeModule.PrismaApiStore();

const app = await buildApiApp({
  store,
  loggerStream: {
    write() {
      /* Request/session data is deliberately absent from the public receipt. */
    },
  },
});

const origin = await app.listen({ host: '127.0.0.1', port: 0 });
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();

let cpu = process.cpuUsage();
let elu = performance.eventLoopUtilization();
let sampled = performance.now();

const sampler = setInterval(() => {
  const now = performance.now();
  const nextCpu = process.cpuUsage();
  const nextElu = performance.eventLoopUtilization();
  process.send?.({
    kind: 'metrics',
    rssBytes: process.memoryUsage().rss,
    cpuPercentOfOneCore: ((nextCpu.user - cpu.user + nextCpu.system - cpu.system) / 1000 / (now - sampled)) * 100,
    eventLoopUtilization: performance.eventLoopUtilization(nextElu, elu).utilization,
    eventLoopP99Ms: lag.percentile(99) / 1e6,
    blockedOutbound,
  });
  cpu = nextCpu;
  elu = nextElu;
  sampled = now;
  lag.reset();
}, 1000);

let closing = false;
process.on('message', async (message: unknown) => {
  if (message !== 'close' || closing) {
    return;
  }

  closing = true;
  clearInterval(sampler);
  lag.disable();
  await app.close();
  await store.prisma.$disconnect();

  // Dedicated advisory-lock pools are process-owned and disappear with the child.
  process.send?.({ kind: 'closed', blockedOutbound });
  process.disconnect?.();
  process.exit(0);
});
process.send?.({ kind: 'ready', origin, pid: process.pid });
