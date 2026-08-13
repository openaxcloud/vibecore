import { describe, expect, it, vi } from 'vitest';

import {
  ProjectIdeStateReadError,
  readProjectIdeStateWithRetry,
  retryAfterDelayMs,
  type ProjectIdeStateReadDiagnostic,
} from './solution-project-ide-state.js';

type FakeResponseOptions = {
  body?: string;
  headers?: Record<string, string>;
  status?: number;
  text?: () => Promise<string>;
};

function fakeResponse({ body = validPayload(), headers = {}, status = 200, text }: FakeResponseOptions = {}) {
  return {
    headers: () => headers,
    status: () => status,
    text: text ?? (async () => body),
  };
}

function validPayload() {
  return JSON.stringify({
    ideState: {
      state: {
        chat: { messages: [{ content: 'Build PeopleOps', role: 'user' }] },
        files: {
          entries: [{ content: 'export const app = true;', path: 'src/main.tsx' }],
        },
      },
      version: 104,
    },
  });
}

function deterministicClock() {
  let nowMs = 1_000_000;

  const sleeps: number[] = [];

  return {
    now: () => nowMs,
    sleep: async (durationMs: number) => {
      sleeps.push(durationMs);
      nowMs += durationMs;
    },
    sleeps,
  };
}

function expectReadError(error: unknown, failure: ProjectIdeStateReadError['failure'], attempts: number) {
  expect(error).toBeInstanceOf(ProjectIdeStateReadError);
  expect(error).toMatchObject({ attempts, failure });
}

describe('project IDE state bounded reader', () => {
  it('returns a strictly parsed state on the first successful response', async () => {
    const diagnostics: ProjectIdeStateReadDiagnostic[] = [];
    const request = vi.fn(async () => fakeResponse({ headers: { 'content-type': 'application/json; charset=utf-8' } }));

    await expect(
      readProjectIdeStateWithRetry({
        request,
        jitterMs: () => 0,
        log: (diagnostic) => diagnostics.push(diagnostic),
      }),
    ).resolves.toEqual({
      chat: { messages: [{ content: 'Build PeopleOps', role: 'user' }] },
      files: [{ content: 'export const app = true;', path: 'src/main.tsx' }],
      recoveredTransientCount: 0,
      version: 104,
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(20_000);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        attempt: 1,
        bodyBytes: expect.any(Number),
        contentType: 'application/json; charset=utf-8',
        failure: null,
        outcome: 'success',
        status: 200,
      }),
    ]);
  });

  it('recovers bounded transport failures with deterministic 500/1000/2000ms backoff', async () => {
    const clock = deterministicClock();
    const diagnostics: ProjectIdeStateReadDiagnostic[] = [];

    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket reset'))
      .mockRejectedValueOnce(new Error('request timed out'))
      .mockRejectedValueOnce(new Error('temporary DNS failure'))
      .mockResolvedValueOnce(fakeResponse());

    const state = await readProjectIdeStateWithRetry({
      request,
      jitterMs: () => 0,
      log: (diagnostic) => diagnostics.push(diagnostic),
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(clock.sleeps).toEqual([500, 1_000, 2_000]);
    expect(request).toHaveBeenCalledTimes(4);
    expect(state.recoveredTransientCount).toBe(3);
    expect(diagnostics.map(({ outcome }) => outcome)).toEqual(['retry', 'retry', 'retry', 'success']);
    expect(diagnostics.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bodyBytes: null, code: null, failure: 'transport', status: null }),
      ]),
    );
  });

  it.each([408, 425, 500, 502, 503, 504])(
    'retries transient HTTP %s and records only safe metadata',
    async (status) => {
      const clock = deterministicClock();
      const diagnostics: ProjectIdeStateReadDiagnostic[] = [];

      const request = vi
        .fn()
        .mockResolvedValueOnce(
          fakeResponse({
            body: JSON.stringify({ code: 'TRANSIENT_UPSTREAM', secret: 'must-not-be-logged' }),
            headers: { 'content-type': 'application/json' },
            status,
          }),
        )
        .mockResolvedValueOnce(fakeResponse());

      const state = await readProjectIdeStateWithRetry({
        request,
        jitterMs: () => 17,
        log: (diagnostic) => diagnostics.push(diagnostic),
        now: clock.now,
        sleep: clock.sleep,
      });

      expect(state.recoveredTransientCount).toBe(1);
      expect(clock.sleeps).toEqual([517]);
      expect(diagnostics[0]).toEqual({
        attempt: 1,
        bodyBytes: expect.any(Number),
        code: 'TRANSIENT_UPSTREAM',
        contentType: 'application/json',
        failure: 'http',
        nextDelayMs: 517,
        outcome: 'retry',
        retryAfter: null,
        status,
      });
      expect(JSON.stringify(diagnostics)).not.toContain('must-not-be-logged');
    },
  );

  it('honors a Retry-After value that fits inside the remaining budget', async () => {
    const clock = deterministicClock();
    const diagnostics: ProjectIdeStateReadDiagnostic[] = [];

    const request = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({
          body: JSON.stringify({ code: 'RATE_LIMITED' }),
          headers: { 'Retry-After': '2', 'content-type': 'application/json' },
          status: 429,
        }),
      )
      .mockResolvedValueOnce(fakeResponse());

    const state = await readProjectIdeStateWithRetry({
      request,
      jitterMs: () => 0,
      log: (diagnostic) => diagnostics.push(diagnostic),
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(state.recoveredTransientCount).toBe(1);
    expect(clock.sleeps).toEqual([2_000]);
    expect(diagnostics[0]).toMatchObject({
      code: 'RATE_LIMITED',
      nextDelayMs: 2_000,
      retryAfter: '2',
      status: 429,
    });
    expect(retryAfterDelayMs('2', clock.now())).toBe(2_000);
  });

  it('fails the budget without sleeping or issuing an early request when Retry-After exceeds it', async () => {
    const clock = deterministicClock();
    const diagnostics: ProjectIdeStateReadDiagnostic[] = [];

    const request = vi.fn(async () =>
      fakeResponse({
        body: JSON.stringify({ code: 'RATE_LIMITED' }),
        headers: { 'Retry-After': '120', 'content-type': 'application/json' },
        status: 429,
      }),
    );

    await expect(
      readProjectIdeStateWithRetry({
        budgetMs: 45_000,
        request,
        jitterMs: () => 0,
        log: (diagnostic) => diagnostics.push(diagnostic),
        now: clock.now,
        sleep: clock.sleep,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReadError(error, 'budget-exhausted', 1);

      return true;
    });
    expect(request).toHaveBeenCalledOnce();
    expect(clock.sleeps).toEqual([]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        attempt: 1,
        failure: 'budget',
        nextDelayMs: null,
        outcome: 'failure',
        retryAfter: '120',
        status: 429,
      }),
    ]);
    expect(retryAfterDelayMs('120', clock.now())).toBe(120_000);
  });

  it('classifies an unreadable 401 body as permanent before any retry', async () => {
    const clock = deterministicClock();

    const text = vi.fn(async () => {
      throw new Error('body stream failed');
    });
    const request = vi.fn(async () =>
      fakeResponse({
        headers: { 'Retry-After': '2', 'content-type': 'application/json' },
        status: 401,
        text,
      }),
    );

    await expect(
      readProjectIdeStateWithRetry({ request, jitterMs: () => 0, now: clock.now, sleep: clock.sleep }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReadError(error, 'permanent-http', 1);
      expect(error).toMatchObject({ status: 401 });

      return true;
    });
    expect(request).toHaveBeenCalledOnce();
    expect(text).not.toHaveBeenCalled();
    expect(clock.sleeps).toEqual([]);
  });

  it('retries an unreadable 429 body and still honors Retry-After', async () => {
    const clock = deterministicClock();

    const request = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({
          headers: { 'Retry-After': '2', 'content-type': 'application/json' },
          status: 429,
          text: async () => {
            throw new Error('body stream failed');
          },
        }),
      )
      .mockResolvedValueOnce(fakeResponse());

    const state = await readProjectIdeStateWithRetry({
      request,
      jitterMs: () => 0,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(state.recoveredTransientCount).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(clock.sleeps).toEqual([2_000]);
  });

  it('enforces an injected budget after the request promise settles', async () => {
    const clock = deterministicClock();
    const text = vi.fn(async () => validPayload());

    const request = vi.fn(async () => {
      await clock.sleep(1_000);

      return fakeResponse({ text });
    });

    await expect(
      readProjectIdeStateWithRetry({
        budgetMs: 1_000,
        request,
        jitterMs: () => 0,
        now: clock.now,
        sleep: clock.sleep,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReadError(error, 'budget-exhausted', 1);

      return true;
    });
    expect(request).toHaveBeenCalledWith(1_000);
    expect(request).toHaveBeenCalledOnce();
    expect(text).not.toHaveBeenCalled();
  });

  it('enforces the same injected budget after reading the response body', async () => {
    const clock = deterministicClock();

    const request = vi.fn(async () =>
      fakeResponse({
        text: async () => {
          await clock.sleep(1_000);

          return validPayload();
        },
      }),
    );

    await expect(
      readProjectIdeStateWithRetry({
        budgetMs: 1_000,
        request,
        jitterMs: () => 0,
        now: clock.now,
        sleep: clock.sleep,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReadError(error, 'budget-exhausted', 1);

      return true;
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('drops non-machine response codes from diagnostics', async () => {
    const clock = deterministicClock();
    const diagnostics: ProjectIdeStateReadDiagnostic[] = [];

    const request = vi.fn(async () =>
      fakeResponse({
        body: JSON.stringify({ code: 'secret/path?token=value' }),
        status: 403,
      }),
    );

    await expect(
      readProjectIdeStateWithRetry({
        request,
        log: (diagnostic) => diagnostics.push(diagnostic),
        now: clock.now,
        sleep: clock.sleep,
      }),
    ).rejects.toBeInstanceOf(ProjectIdeStateReadError);
    expect(diagnostics).toEqual([expect.objectContaining({ bodyBytes: null, code: null, status: 403 })]);
    expect(JSON.stringify(diagnostics)).not.toContain('token=value');
  });

  it.each([400, 401, 403, 404, 409, 412])('fails immediately for permanent GET HTTP %s', async (status) => {
    const clock = deterministicClock();
    const request = vi.fn(async () => fakeResponse({ body: JSON.stringify({ code: 'PERMANENT' }), status }));

    await expect(
      readProjectIdeStateWithRetry({ request, jitterMs: () => 0, now: clock.now, sleep: clock.sleep }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReadError(error, 'permanent-http', 1);
      expect(error).toMatchObject({ status });

      return true;
    });
    expect(request).toHaveBeenCalledOnce();
    expect(clock.sleeps).toEqual([]);
  });

  it('exhausts exactly four attempts for repeated transient failures', async () => {
    const clock = deterministicClock();
    const request = vi.fn(async () => fakeResponse({ body: JSON.stringify({ code: 'UNAVAILABLE' }), status: 503 }));

    await expect(
      readProjectIdeStateWithRetry({ request, jitterMs: () => 0, now: clock.now, sleep: clock.sleep }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReadError(error, 'transient-exhausted', 4);
      expect(error).toMatchObject({ status: 503 });

      return true;
    });
    expect(request).toHaveBeenCalledTimes(4);
    expect(clock.sleeps).toEqual([500, 1_000, 2_000]);
  });

  it('fails immediately for successful invalid JSON without retrying', async () => {
    const clock = deterministicClock();
    const request = vi.fn(async () => fakeResponse({ body: '<html>not json</html>' }));

    await expect(
      readProjectIdeStateWithRetry({ request, jitterMs: () => 0, now: clock.now, sleep: clock.sleep }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReadError(error, 'invalid-json', 1);
      return true;
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'invalid file entry',
      { ideState: { state: { files: { entries: [{ content: 42, path: 'src/main.tsx' }] } }, version: 2 } },
    ],
    ['missing ideState property', {}],
  ])('fails immediately for %s', async (_label, payload) => {
    const request = vi.fn(async () => fakeResponse({ body: JSON.stringify(payload) }));

    await expect(readProjectIdeStateWithRetry({ request, jitterMs: () => 0 })).rejects.toSatisfy((error: unknown) => {
      expectReadError(error, 'invalid-shape', 1);
      return true;
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    ['null ideState', { ideState: null }],
    ['state without files', { ideState: { state: { chat: { messages: [] } }, version: 2 } }],
  ])('accepts %s as a pollable not-ready state', async (_label, payload) => {
    const request = vi.fn(async () => fakeResponse({ body: JSON.stringify(payload) }));

    await expect(readProjectIdeStateWithRetry({ request, jitterMs: () => 0 })).resolves.toMatchObject({
      files: [],
      recoveredTransientCount: 0,
    });
    expect(request).toHaveBeenCalledOnce();
  });
});
