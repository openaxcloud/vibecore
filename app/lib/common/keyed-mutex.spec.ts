import { describe, expect, it } from 'vitest';
import { KeyedMutex } from './keyed-mutex';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('KeyedMutex', () => {
  it('runs same-key tasks strictly one-at-a-time (no overlap)', async () => {
    const mutex = new KeyedMutex();
    const events: string[] = [];

    const task = (label: string, delay: number) =>
      mutex.run('package.json', async () => {
        events.push(`start:${label}`);
        await tick(delay);
        events.push(`end:${label}`);
      });

    // Kick off B while A is mid-flight; B must wait for A to finish.
    await Promise.all([task('A', 20), task('B', 1)]);

    expect(events).toEqual(['start:A', 'end:A', 'start:B', 'end:B']);
  });

  it('runs different-key tasks concurrently', async () => {
    const mutex = new KeyedMutex();
    const events: string[] = [];

    await Promise.all([
      mutex.run('package.json', async () => {
        events.push('start:pkg');
        await tick(20);
        events.push('end:pkg');
      }),
      mutex.run('index.html', async () => {
        events.push('start:html');
        await tick(1);
        events.push('end:html');
      }),
    ]);

    // index.html (different key) finishes before package.json — they overlapped.
    expect(events).toEqual(['start:pkg', 'start:html', 'end:html', 'end:pkg']);
  });

  it('a failing task does not poison the queue for the same key', async () => {
    const mutex = new KeyedMutex();

    const failed = mutex.run('a', async () => {
      throw new Error('boom');
    });

    await expect(failed).rejects.toThrow('boom');

    // The next task on the same key still runs.
    await expect(mutex.run('a', async () => 'ok')).resolves.toBe('ok');
  });

  it('returns the task result', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.run('k', async () => 42)).resolves.toBe(42);
  });
});
