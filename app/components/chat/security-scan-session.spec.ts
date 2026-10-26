import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createSecurityScanSession,
  SECURITY_SCAN_TIMEOUT_MS,
  type SecurityScanMessages,
} from './security-scan-session';

const messages: SecurityScanMessages = {
  preparing: 'preparing',
  timeout: 'timeout',
  cancelled: 'cancelled locally',
  failed: 'failed',
  completed: 'completed',
  missingProject: 'missing project',
};

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (reason: Error) => void;

  const promise = new Promise<Response>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  const fetcher = vi.fn<typeof fetch>(() => promise);

  return { resolve, reject, fetcher };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('starts no timers before a scan and keeps one deadline and POST across subscriptions', async () => {
  const request = deferredResponse();
  const session = createSecurityScanSession('project-a', request.fetcher);
  expect(vi.getTimerCount()).toBe(0);
  expect(session.getSnapshot()).toBe(session.getSnapshot());

  const run = session.run(new FormData(), messages);
  await session.run(new FormData(), messages);
  expect(request.fetcher).toHaveBeenCalledTimes(1);

  const startedAt = session.getSnapshot().startedAt;
  const unsubscribe = session.subscribe(vi.fn());
  await vi.advanceTimersByTimeAsync(30_000);
  unsubscribe();
  session.subscribe(vi.fn());
  expect(session.getSnapshot().startedAt).toBe(startedAt);
  await vi.advanceTimersByTimeAsync(SECURITY_SCAN_TIMEOUT_MS - 30_000 - 1);
  expect(session.getSnapshot().status).toBe('running');
  await vi.advanceTimersByTimeAsync(1);
  expect(session.getSnapshot().status).toBe('timeout');
  expect(vi.getTimerCount()).toBe(0);
  expect(request.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  request.resolve(Response.json({ ok: true, scan: { status: 'completed' } }));
  await run;
  expect(session.getSnapshot().status).toBe('timeout');
  expect(session.claimRefresh(session.getSnapshot().refreshRevision)).toBe(false);
});

it.each(['cancel', 'dispose'] as const)('ignores a late successful response after %s', async (operation) => {
  const request = deferredResponse();
  const session = createSecurityScanSession('project-a', request.fetcher);
  const run = session.run(new FormData(), messages);
  session[operation]();
  expect(request.fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  request.resolve(Response.json({ ok: true, scan: { status: 'completed' } }));
  await run;
  expect(session.getSnapshot().status).toBe('cancelled');
  expect(session.getSnapshot().message).toBe('cancelled locally');
  expect(session.getSnapshot().refreshRevision).toBe(0);
});

it.each([
  [200, { ok: true, scan: { status: 'completed' } }, 'completed'],
  [200, { ok: true, scan: { status: 'failed' } }, 'failed'],
  [200, { ok: false, error: 'recorded failure' }, 'failed'],
  [422, { ok: false, error: 'recorded failure' }, 'failed'],
] as const)('keeps the recorded outcome and refreshes exactly once (%s, %o)', async (status, result, expected) => {
  const request = deferredResponse();
  const session = createSecurityScanSession('project-a', request.fetcher);
  const run = session.run(new FormData(), messages);
  request.resolve(Response.json(result, { status }));
  await run;
  expect(session.getSnapshot().status).toBe(expected);
  expect(session.claimRefresh(session.getSnapshot().refreshRevision)).toBe(true);
  expect(session.claimRefresh(session.getSnapshot().refreshRevision)).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not let the cancelled request finish a newer scan', async () => {
  const first = deferredResponse();
  const second = deferredResponse();
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(first.fetcher).mockImplementationOnce(second.fetcher);
  const session = createSecurityScanSession('project-a', fetcher);
  const oldRun = session.run(new FormData(), messages);
  session.cancel();

  const newRun = session.run(new FormData(), messages);
  first.resolve(Response.json({ ok: true, scan: { status: 'completed' } }));
  await oldRun;
  expect(session.getSnapshot().status).toBe('running');
  second.resolve(Response.json({ ok: false, error: 'second failed' }));
  await newRun;
  expect(session.getSnapshot().status).toBe('failed');
  expect(session.getSnapshot().message).toBe('second failed');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('reports network failure without claiming a completed backend scan', async () => {
  const request = deferredResponse();
  const session = createSecurityScanSession('project-a', request.fetcher);
  const run = session.run(new FormData(), messages);
  request.reject(new Error('offline'));
  await run;
  expect(session.getSnapshot().status).toBe('failed');
  expect(session.getSnapshot().refreshRevision).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not request anything without a project', async () => {
  const request = deferredResponse();
  const session = createSecurityScanSession(undefined, request.fetcher);
  await session.run(new FormData(), messages);
  expect(request.fetcher).not.toHaveBeenCalled();
  expect(session.getSnapshot().message).toBe('missing project');
  expect(vi.getTimerCount()).toBe(0);
});

it('never regresses progress if the system clock moves backwards', async () => {
  const request = deferredResponse();
  const session = createSecurityScanSession('project-a', request.fetcher);
  const run = session.run(new FormData(), messages);
  await vi.advanceTimersByTimeAsync(30_000);

  const progress = session.getSnapshot().progress;
  vi.setSystemTime(Date.now() - 20_000);
  await vi.advanceTimersByTimeAsync(800);
  expect(session.getSnapshot().progress).toBe(progress);
  session.cancel();
  request.resolve(Response.json({ ok: true, scan: { status: 'completed' } }));
  await run;
});
