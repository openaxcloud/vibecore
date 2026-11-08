import { spawn } from 'node:child_process';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { guard, monitorProjection, serializeReport } from './runtime-network-sentinel.mjs';

export function createNetworkTimeline() {
  const events = [];
  const counts = { address: 0, link: 0 };

  let omitted = 0;

  return {
    capture(type, now = Date.now()) {
      if (!['address', 'link'].includes(type) || !Number.isFinite(now)) {
        return;
      }

      counts[type]++;

      const time = Math.floor(now / 1000) * 1000;
      const existing = events.findLast((event) => event.time === time && event.type === type);

      if (existing) {
        existing.count++;
        existing.firstAt = Math.min(existing.firstAt, now);
        existing.lastAt = Math.max(existing.lastAt, now);

        return;
      }

      if (events.length === 256) {
        events.splice(48, 1);
        omitted++;
      }

      events.push({ time, type, count: 1, firstAt: now, lastAt: now });
    },
    snapshot() {
      return { counts: { ...counts }, omittedBuckets: omitted, events: events.map((event) => ({ ...event })) };
    },
  };
}

/** Exit only this diagnostic process if final persistence cannot settle. */
export function boundedObserverStop({ clear, kill, save, exit }, timeout = 2000) {
  let stopping = false;

  return async () => {
    if (stopping) {
      return;
    }

    stopping = true;

    let finished = false;

    const finish = (code) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timer);
      exit(code);
    };

    const timer = setTimeout(() => finish(1), timeout);

    try {
      clear();
      kill();
      await save();
      finish(0);
    } catch {
      finish(1);
    }
  };
}

async function observe() {
  guard(process.env);
  await mkdir('tmp', { recursive: true });

  const timeline = createNetworkTimeline();
  const report = { diagnosticOnly: true, startedAt: Date.now(), status: 'observing' };
  const child = spawn('ip', ['-o', 'monitor', 'address', 'link'], { stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.on(
    'data',
    monitorProjection((type) => timeline.capture(type)),
  );
  child.on('error', () => {
    report.status = 'unavailable';
  });
  child.on('exit', () => {
    if (report.status === 'observing') {
      report.status = 'observer_exited';
    }
  });

  let pending = Promise.resolve();

  const save = () => {
    pending = pending
      .then(async () => {
        const text = serializeReport({ ...report, capturedAt: Date.now(), ...timeline.snapshot() });
        await writeFile('tmp/runtime-network-observer.json.pending', text);
        await rename('tmp/runtime-network-observer.json.pending', 'tmp/runtime-network-observer.json');
      })
      .catch(() => {
        report.status = 'write_failed';
      });
    return pending;
  };

  const interval = setInterval(save, 1000);
  const deadline = setTimeout(() => void stop(), 75 * 60_000);

  const stop = boundedObserverStop({
    clear() {
      clearInterval(interval);
      clearTimeout(deadline);

      if (report.status === 'observing') {
        report.status = 'completed';
      }
    },
    kill() {
      child.kill('SIGKILL');
    },
    save,
    exit(code) {
      process.exit(code);
    },
  });
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
  await save();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await observe().catch(() => {
    process.exitCode = 1;
  });
}
