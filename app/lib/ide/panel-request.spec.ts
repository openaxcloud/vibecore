import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetProjectPanelCacheForTests, readProjectPanelCache, writeProjectPanelCache } from './panel-payload-cache';
import { createPanelRequest, waitForPanelRetry } from './panel-request';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  __resetProjectPanelCacheForTests();
});

describe('explicit panel GET replacement', () => {
  it('keeps normal single-flight sharing and allows a later poll', async () => {
    const requests = createPanelRequest<string>();
    const first = deferred<string>();
    const load = vi.fn(() => first.promise);
    const one = requests.run('project:database', load);
    const two = requests.run('project:database', load);
    expect(two).toBe(one);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    first.resolve('first');
    await expect(one).resolves.toBe('first');
    expect(requests.retry('project:database')).toBe(false);
    await expect(requests.run('project:database', async () => 'poll')).resolves.toBe('poll');
  });

  it.each([
    ['resolve', 'before'],
    ['reject', 'before'],
    ['resolve', 'after'],
    ['reject', 'after'],
  ] as const)('ignores non-cooperative A %s %s B; all consumers and cache keep B', async (outcome, timing) => {
    const requests = createPanelRequest<{ status: string; data: { attempt: string } }>();
    const first = deferred<{ status: string; data: { attempt: string } }>();
    const second = deferred<{ status: string; data: { attempt: string } }>();
    const signals: AbortSignal[] = [];

    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });

    const one = requests.run('project:database', load);
    const two = requests.run('project:database', load);
    const applied: string[] = [];
    const errors: unknown[] = [];

    for (const consumer of [one, two]) {
      void consumer.then(
        (payload) => {
          applied.push(payload.data.attempt);
          writeProjectPanelCache('project:database', { payload, lastLoadedAt: 'fixture' });
        },
        (error: unknown) => {
          errors.push(error);
        },
      );
    }
    await Promise.resolve();
    expect(requests.retry('project:database')).toBe(true);
    expect(signals[0].aborted).toBe(true);
    await Promise.resolve();

    const remounted = requests.run('project:database', load);
    expect(remounted).toBe(one);

    const finishOldAttempt = async () => {
      if (outcome === 'resolve') {
        first.resolve({ status: 'ok', data: { attempt: 'A' } });
      } else {
        first.reject(new Error('Late non-cooperative A'));
      }

      for (let tick = 0; tick < 5; tick += 1) {
        await Promise.resolve();
      }
    };

    if (timing === 'before') {
      await finishOldAttempt();
      expect(applied).toEqual([]);
      expect(errors).toEqual([]);
    }

    second.resolve({ status: 'ok', data: { attempt: 'B' } });
    await Promise.all([one, two, remounted]);

    if (timing === 'after') {
      await finishOldAttempt();
    }

    expect(applied).toEqual(['B', 'B']);
    expect(errors).toEqual([]);
    expect(readProjectPanelCache('project:database')?.payload.data.attempt).toBe('B');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cancel another key or let late A delete a newer pending entry', async () => {
    const requests = createPanelRequest<string>();
    const a = deferred<string>();
    const b = deferred<string>();
    const c = deferred<string>();
    const other = deferred<string>();
    const signals: AbortSignal[] = [];

    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? a.promise : b.promise;
    });

    let otherSignal!: AbortSignal;

    const otherResult = requests.run('other:database', (signal) => {
      otherSignal = signal;
      return other.promise;
    });

    const result = requests.run('project:database', load);
    await Promise.resolve();
    expect(requests.retry('missing')).toBe(false);
    requests.retry('project:database');
    await Promise.resolve();
    expect(otherSignal.aborted).toBe(false);
    b.resolve('B');
    await result;

    const next = requests.run('project:database', () => c.promise);
    await Promise.resolve();
    a.resolve('A');
    await Promise.resolve();
    await Promise.resolve();
    expect(requests.retry('project:database')).toBe(true);
    c.resolve('C');
    other.resolve('other');
    await expect(next).resolves.toBe('C');
    await expect(otherResult).resolves.toBe('other');
  });

  it('propagates current failures and releases the key for an ordinary manual retry', async () => {
    const requests = createPanelRequest<string>();
    await expect(
      requests.run('project:database', () => {
        throw new Error('Current failure');
      }),
    ).rejects.toThrow('Current failure');
    expect(requests.retry('project:database')).toBe(false);
    await expect(requests.run('project:database', async () => 'recovered')).resolves.toBe('recovered');
  });
});

describe('panel retry backoff', () => {
  it('clears the pending delay when the old attempt is cancelled', async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const waiting = waitForPanelRetry(650, controller.signal);
    const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an already aborted attempt without a surviving timer', async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    controller.abort();
    await expect(waitForPanelRetry(650, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the normal backoff duration without a signal', async () => {
    vi.useFakeTimers();

    let finished = false;

    const waiting = waitForPanelRetry(650).then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(649);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(finished).toBe(true);
  });
});
