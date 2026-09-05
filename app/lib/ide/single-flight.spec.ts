import { describe, expect, it, vi } from 'vitest';
import { createSingleFlight } from './single-flight';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe('createSingleFlight', () => {
  it('runs the work ONCE for callers that arrive while it is in flight', async () => {
    const flight = createSingleFlight<string>();
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);

    const a = flight.run('k', fn);
    const b = flight.run('k', fn);
    const c = flight.run('k', fn);

    expect(fn).toHaveBeenCalledTimes(1);

    d.resolve('value');
    await expect(Promise.all([a, b, c])).resolves.toEqual(['value', 'value', 'value']);
  });

  it('is the exact race that downloaded the project archive twice', async () => {
    /*
     * The measured shape: the intended hydration starts, and 14 ms later the
     * fallback starts because it sees no files yet — while the first is still
     * in flight. Both fetched 5.07 MiB. One call must survive, not two.
     */
    const flight = createSingleFlight<boolean>();
    const d = deferred<boolean>();
    const downloadArchive = vi.fn(() => d.promise);

    const hydration = flight.run('project-1', downloadArchive);
    const fallback = flight.run('project-1', downloadArchive);

    expect(downloadArchive).toHaveBeenCalledTimes(1);

    d.resolve(true);
    await expect(hydration).resolves.toBe(true);
    await expect(fallback).resolves.toBe(true);
  });

  it('keeps different keys independent', async () => {
    const flight = createSingleFlight<string>();
    const fn = vi.fn(async (v: string) => v);

    await Promise.all([flight.run('a', () => fn('a')), flight.run('b', () => fn('b'))]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs again once the previous call has SETTLED (it is not a cache)', async () => {
    const flight = createSingleFlight<string>();
    const fn = vi.fn(async () => 'v');

    await flight.run('k', fn);
    await flight.run('k', fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(flight.size).toBe(0);
  });

  it('gives every waiter the same rejection, and does not wedge the key', async () => {
    const flight = createSingleFlight<string>();
    const d = deferred<string>();
    const boom = new Error('nope');
    const fn = vi.fn(() => d.promise);

    const a = flight.run('k', fn);
    const b = flight.run('k', fn);
    d.reject(boom);

    await expect(a).rejects.toBe(boom);
    await expect(b).rejects.toBe(boom);

    /*
     * A wedged key would make the resource permanently unfetchable — worse than
     * the duplication this fixes.
     */
    expect(flight.size).toBe(0);
    await expect(flight.run('k', async () => 'recovered')).resolves.toBe('recovered');
  });

  it('surfaces a SYNCHRONOUS throw as a rejection and leaves nothing in flight', async () => {
    const flight = createSingleFlight<string>();
    await expect(
      flight.run('k', () => {
        throw new Error('sync');
      }),
    ).rejects.toThrow('sync');
    expect(flight.size).toBe(0);
  });
});

describe('createSingleFlight cooldown (secondary guard)', () => {
  it('returns the previous SUCCESS without redoing the work, inside the window', async () => {
    let clock = 1000;

    const flight = createSingleFlight<string>({ cooldownMs: 5000, now: () => clock });
    const fn = vi.fn(async () => 'v');

    expect(await flight.run('k', fn)).toBe('v');
    clock += 4999;
    expect(await flight.run('k', fn)).toBe('v');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('works again once the window has passed', async () => {
    let clock = 1000;

    const flight = createSingleFlight<string>({ cooldownMs: 5000, now: () => clock });
    const fn = vi.fn(async () => 'v');

    await flight.run('k', fn);
    clock += 5001;
    await flight.run('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never remembers a FAILURE (that was BUG-PANEL-CACHE-003)', async () => {
    let clock = 1000;

    const flight = createSingleFlight<string>({ cooldownMs: 5000, now: () => clock });

    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('recovered');

    await expect(flight.run('k', fn as () => Promise<string>)).rejects.toThrow('boom');
    clock += 10;
    await expect(flight.run('k', fn as () => Promise<string>)).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('is inert when no cooldown is configured (default behaviour unchanged)', async () => {
    const flight = createSingleFlight<string>();
    const fn = vi.fn(async () => 'v');
    await flight.run('k', fn);
    await flight.run('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
