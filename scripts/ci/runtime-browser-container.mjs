import { spawn } from 'node:child_process';
import { startRelay } from './runtime-browser-relay.mjs';

const ports = [3001, 3020, 5173, 5174, 18083, 18084];
const relays = [];

let child;
let stopping = false;

async function stop(code) {
  if (stopping) {
    return;
  }

  stopping = true;

  const timer = setTimeout(() => process.exit(1), 2000);
  child?.kill('SIGKILL');
  await Promise.allSettled(relays.map((relay) => relay.close()));
  clearTimeout(timer);
  process.exit(code);
}
process.once('SIGTERM', () => void stop(0));
process.once('SIGINT', () => void stop(0));

try {
  for (const port of ports) {
    relays.push(
      await startRelay({
        idleTimeoutMs: 90 * 60_000,
        listen: { host: '127.0.0.1', port },
        target: { path: `/transport/service-${port}.sock` },
      }),
    );
  }
  relays.push(
    await startRelay({
      idleTimeoutMs: 90 * 60_000,
      listen: { path: '/transport/control.sock' },
      target: { host: '127.0.0.1', port: 3333 },
    }),
  );
  child = spawn(
    process.execPath,
    [
      '/opt/ci/playwright-core/cli.js',
      'run-server',
      '--host',
      '127.0.0.1',
      '--port',
      '3333',
      '--path',
      '/runtime-browser',
      '--max-clients',
      '4',
    ],
    { stdio: 'ignore' },
  );
  child.once('error', () => void stop(1));
  child.once('exit', () => void stop(1));
} catch {
  await stop(1);
}
