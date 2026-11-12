import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Page, Request, Route } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  databaseRequestCategory,
  installDatabaseResponseGate,
  withDatabaseCleanup,
} from './e2e/helpers/database-response-gate';

const origin = 'http://localhost:5173';
const projectId = 'private-project-id';
const panelPath = `/api/projects/${projectId}/ide-panel/database`;

function fixture() {
  const page = new EventEmitter() as EventEmitter & {
    route: ReturnType<typeof vi.fn>;
    unroute: ReturnType<typeof vi.fn>;
  };

  let handler: (route: Route) => Promise<void>;
  page.route = vi.fn(async (_pattern, callback) => (handler = callback));
  page.unroute = vi.fn(async () => undefined);

  function request(path = panelPath) {
    return { url: () => `${origin}${path}`, method: () => 'GET' } as Request;
  }

  function route(
    path = panelPath,
    options: { failure?: 'fetch' | 'body' | 'fulfill' | 'continue'; status?: number } = {},
  ) {
    const req = request(path);
    const body = Buffer.from('exact upstream bytes\u0000private-credential');

    const fail = () => {
      throw new Error('secret upstream error: private-credential private-project-id');
    };
    const response = {
      status: () => options.status ?? 200,
      body: options.failure === 'body' ? fail : async () => body,
      headers: () => ({ 'content-type': 'application/octet-stream', 'x-upstream-header': 'preserved' }),
    };
    const value = {
      request: () => req,
      fetch: vi.fn(options.failure === 'fetch' ? fail : async () => response),
      fulfill: vi.fn(options.failure === 'fulfill' ? fail : async () => undefined),
      continue: vi.fn(options.failure === 'continue' ? fail : async (): Promise<void> => undefined),
      abort: vi.fn(async () => undefined),
    };

    return {
      value,
      response,
      body,
      async run() {
        page.emit('request', req);
        return handler(value as unknown as Route);
      },
    };
  }

  return {
    page,
    request,
    route,
    install: () => installDatabaseResponseGate(page as unknown as Page, projectId, origin),
  };
}

afterEach(() => vi.useRealTimers());

describe('database initial-response capture', () => {
  it('arms after the real binding but before navigation or hydration', () => {
    const source = readFileSync(new URL('./e2e/database-loading-context.spec.ts', import.meta.url), 'utf8');
    const binding = source.indexOf('const setup = await request.put(');
    const armed = source.indexOf('capture = await installDatabaseResponseGate(');
    const navigation = source.indexOf('page.goto(');
    expect(binding).toBeGreaterThan(-1);
    expect(armed).toBeGreaterThan(binding);
    expect(navigation).toBeGreaterThan(armed);

    const cleanup = source.indexOf('await capture?.dispose()');
    expect(source.indexOf("await attachCapture('before-cleanup')")).toBeLessThan(cleanup);
    expect(source.indexOf("await attachCapture('after-cleanup')")).toBeGreaterThan(cleanup);
    expect(source).toContain('await withDatabaseCleanup(');
  });

  it('recognizes the exact origin and native/data transports, never schema as a list', () => {
    const classify = (path: string, method = 'GET') =>
      databaseRequestCategory(`${origin}${path}`, method, origin, panelPath);
    expect(classify(panelPath)).toBe('list-native');
    expect(classify(`${panelPath}.data?_routes=private-route`)).toBe('list-data');
    expect(classify(`${panelPath}?schemaKey=private-key`)).toBe('schema-native');
    expect(classify(`${panelPath}.data?schemaKey=private-key&_routes=private-route`)).toBe('schema-data');
    expect(classify(`${panelPath}-other`)).toBeNull();
    expect(classify(panelPath.replace(projectId, 'other-project'))).toBeNull();
    expect(classify(panelPath, 'POST')).toBeNull();
    expect(databaseRequestCategory(`http://other.test${panelPath}`, 'GET', origin, panelPath)).toBeNull();
  });

  for (const suffix of ['', '.data?_routes=private-route']) {
    it(`retains the real ${suffix ? 'data' : 'native'} bytes, with no fulfillment before release`, async () => {
      const f = fixture();
      const gate = await f.install();
      const route = f.route(`${panelPath}${suffix}`);
      const handled = route.run();
      await gate.waitForInitialResponse();
      expect(route.value.fetch).toHaveBeenCalledWith({ timeout: 60_000, maxRetries: 0, maxRedirects: 0 });
      expect(route.value.fetch).toHaveBeenCalledOnce();
      expect(route.value.fulfill).not.toHaveBeenCalled();
      expect(gate.snapshot()).toMatchObject({
        initialRequests: 1,
        listRequests: 1,
        routeListRequests: 1,
        failed: false,
      });
      expect(gate.snapshot().responses).toMatchObject([{ unchanged: false, bytes: route.body.length, status: 200 }]);
      gate.release();
      await handled;
      gate.assertHealthy();
      expect(route.value.fulfill).toHaveBeenCalledWith({ response: route.response, body: route.body });
      expect(gate.snapshot().responses[0].unchanged).toBe(true);
      expect(JSON.stringify(gate.snapshot())).not.toMatch(/private-|localhost|http:|schemaKey|_routes/);
      await gate.dispose();
      expect(f.page.unroute).toHaveBeenCalledOnce();
      expect(f.page.eventNames()).toEqual([]);
    });
  }

  it('counts a post-release child .data list as an extra real request, but not its schema request', async () => {
    const f = fixture();
    const gate = await f.install();
    const initial = f.route();
    const handled = initial.run();
    await gate.waitForInitialResponse();
    gate.release();
    await handled;

    const child = f.route(`${panelPath}.data?_routes=private-route`);
    await child.run();

    const schema = f.route(`${panelPath}.data?schemaKey=private-key&_routes=private-route`);
    await schema.run();
    expect(child.value.continue).toHaveBeenCalledOnce();
    expect(schema.value.continue).toHaveBeenCalledOnce();
    expect(child.value.fetch).not.toHaveBeenCalled();
    expect(schema.value.fetch).not.toHaveBeenCalled();
    expect(gate.snapshot()).toMatchObject({ initialRequests: 1, listRequests: 2, routeListRequests: 2 });
    expect(() => expect(gate.snapshot().listRequests).toBe(1)).toThrow();
    expect(() => gate.assertHealthy()).toThrow('duplicate');
    await gate.dispose();
  });

  it('rejects a second initial list immediately rather than fabricating or hiding it', async () => {
    const f = fixture();
    const gate = await f.install();
    const first = f.route().run();
    await gate.waitForInitialResponse();

    const duplicate = f.route(`${panelPath}.data`);
    await duplicate.run();
    await expect(gate.waitForInitialResponse()).rejects.toThrow('duplicate');
    await expect(gate.guard(async () => undefined)).rejects.toThrow('duplicate');
    expect(duplicate.value.fetch).not.toHaveBeenCalled();
    expect(duplicate.value.abort).toHaveBeenCalledOnce();
    expect(gate.snapshot().listRequests).toBe(2);
    gate.release();
    await first;
    await gate.dispose();
  });

  for (const stage of ['fetch', 'body'] as const) {
    it(`surfaces a ${stage} handler error before waiting 60 seconds, without leaking its message`, async () => {
      const f = fixture();
      const gate = await f.install();
      const route = f.route(panelPath, { failure: stage });
      await route.run();
      await expect(gate.waitForInitialResponse()).rejects.toThrow(`failed at ${stage}`);
      expect(() => gate.assertHealthy()).toThrow(`failed at ${stage}`);
      expect(route.value.fulfill).not.toHaveBeenCalled();
      expect(JSON.stringify(gate.snapshot())).not.toMatch(/private-|credential/);
      await gate.dispose();
    });
  }

  it('fails on real upstream HTTP failure instead of treating it as a ready success', async () => {
    const f = fixture();
    const gate = await f.install();
    const route = f.route(panelPath, { status: 503 });
    await route.run();
    await expect(gate.waitForInitialResponse()).rejects.toThrow('failed at fetch');
    expect(gate.snapshot().responses).toHaveLength(0);
    expect(gate.snapshot().events).toContainEqual(expect.objectContaining({ event: 'upstream-response', status: 503 }));
    expect(route.value.fulfill).not.toHaveBeenCalled();
    await gate.dispose();
  });

  it('rejects altered upstream bytes rather than delivering a manufactured response', async () => {
    const f = fixture();
    const gate = await f.install();
    const route = f.route();
    const handled = route.run();
    await gate.waitForInitialResponse();
    route.body[0] ^= 1;
    gate.release();
    await handled;
    expect(() => gate.assertHealthy()).toThrow('failed at integrity');
    expect(route.value.fulfill).not.toHaveBeenCalled();
    expect(gate.snapshot().responses[0].unchanged).toBe(false);
    await gate.dispose();
  });

  it('retains a fulfillment failure in the final diagnostic and verdict', async () => {
    const f = fixture();
    const gate = await f.install();
    const route = f.route(panelPath, { failure: 'fulfill' });
    const handled = route.run();
    await gate.waitForInitialResponse();
    gate.release();
    await handled;
    expect(() => gate.assertHealthy()).toThrow('failed at fulfill');
    expect(gate.snapshot().responses[0].unchanged).toBe(false);
    await gate.dispose();
  });

  it('reports a failed schema continuation without swallowing the handler failure', async () => {
    const f = fixture();
    const gate = await f.install();
    await f.route(`${panelPath}.data?schemaKey=private-key`, { failure: 'continue' }).run();
    await expect(gate.guard(async () => undefined)).rejects.toThrow('failed at continue');
    expect(gate.snapshot().listRequests).toBe(0);
    await gate.dispose();
  });

  it('detects a browser response which bypassed the hold', async () => {
    const f = fixture();
    const gate = await f.install();
    f.page.emit('response', { request: () => f.request(), status: () => 200 });
    await expect(gate.waitForInitialResponse()).rejects.toThrow('unheld-response');
    await gate.dispose();
  });

  it('records a browser request failure without logging URLs or network error strings', async () => {
    const f = fixture();
    const gate = await f.install();
    f.page.emit('requestfailed', f.request());
    await expect(gate.waitForInitialResponse()).rejects.toThrow('request-failed');
    expect(JSON.stringify(gate.snapshot())).not.toMatch(/private-|localhost/);
    await gate.dispose();
  });

  it('keeps the existing 60-second limit and diagnoses no observed response', async () => {
    vi.useFakeTimers();

    const f = fixture();
    const gate = await f.install();
    const rejected = expect(gate.waitForInitialResponse()).rejects.toThrow('60000 ms');
    await vi.advanceTimersByTimeAsync(60_000);
    await rejected;
    expect(gate.snapshot()).toMatchObject({ listRequests: 0, routeListRequests: 0, responses: [], failed: true });
    expect(gate.snapshot().events.at(-1)?.event).toBe('initial-response-timeout');
    await gate.dispose();
  });

  it('bounds diagnostics while counting all browser requests and returns detached snapshots', async () => {
    const f = fixture();
    const gate = await f.install();

    for (let index = 0; index < 200; index++) {
      f.page.emit('request', f.request());
    }

    const snapshot = gate.snapshot();
    expect(snapshot.events).toHaveLength(128);
    expect(snapshot.omittedEvents).toBe(272);
    expect(snapshot.listRequests).toBe(200);
    snapshot.events.length = 0;
    expect(gate.snapshot().events).toHaveLength(128);
    await gate.dispose();
  });

  it('rejects redirects rather than following extra upstream requests or converting them to 200', async () => {
    const f = fixture();
    const gate = await f.install();
    const route = f.route(panelPath, { status: 302 });
    await route.run();
    await expect(gate.waitForInitialResponse()).rejects.toThrow('failed at fetch');
    expect(route.value.fetch).toHaveBeenCalledExactlyOnceWith({ timeout: 60_000, maxRetries: 0, maxRedirects: 0 });
    expect(route.value.fulfill).not.toHaveBeenCalled();
    await gate.dispose();
  });

  it('does not fulfill a retained request cancelled by navigation', async () => {
    const f = fixture();
    const gate = await f.install();
    const route = f.route();
    const handled = route.run();
    await gate.waitForInitialResponse();
    f.page.emit('requestfailed', route.value.request());
    await expect(gate.guard(async () => undefined)).rejects.toThrow('request-failed');
    gate.release();
    await handled;
    expect(route.value.fulfill).not.toHaveBeenCalled();
    expect(route.value.abort).toHaveBeenCalledOnce();
    expect(gate.snapshot().responses[0].unchanged).toBe(false);
    await gate.dispose();
  });

  it('drains a late upstream response during disposal without creating a second request', async () => {
    const f = fixture();
    const gate = await f.install();
    const route = f.route();

    let deliver!: () => void;

    const upstream = new Promise<void>((resolve) => (deliver = resolve));
    route.value.fetch.mockImplementation(async () => {
      await upstream;
      return route.response;
    });

    const handled = route.run();

    let disposed = false;

    const disposal = gate.dispose().then(() => (disposed = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(disposed).toBe(false);
    expect(f.page.unroute).toHaveBeenCalledOnce();
    deliver();
    await Promise.all([handled, disposal]);
    expect(route.value.fetch).toHaveBeenCalledOnce();
    expect(route.value.fulfill).toHaveBeenCalledWith({ response: route.response, body: route.body });
    expect(f.page.eventNames()).toEqual([]);
  });

  it('waits for a handler entering during unroute before removing observers', async () => {
    const f = fixture();
    const gate = await f.install();
    const late = f.route(`${panelPath}.data?schemaKey=private-key`);

    let finish!: () => void;

    const continued = new Promise<void>((resolve) => (finish = resolve));
    late.value.continue.mockImplementation(async () => continued);

    let handled!: Promise<void>;
    f.page.unroute.mockImplementation(async () => {
      handled = late.run();
    });

    let disposed = false;

    const disposal = gate.dispose().then(() => (disposed = true));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(disposed).toBe(false);
    expect(f.page.listenerCount('request')).toBe(1);
    finish();
    await Promise.all([handled, disposal]);
    expect(f.page.eventNames()).toEqual([]);
  });

  it('removes only its own observers even when unroute rejects', async () => {
    const f = fixture();
    const unrelated = vi.fn();
    f.page.on('request', unrelated);

    const gate = await f.install();
    const error = new Error('unroute failed');
    f.page.unroute.mockRejectedValueOnce(error);
    await expect(gate.dispose()).rejects.toBe(error);
    expect(f.page.listeners('request')).toEqual([unrelated]);
    expect(f.page.listenerCount('response')).toBe(0);
    expect(f.page.listenerCount('requestfailed')).toBe(0);
  });

  it('removes observers if route installation rejects before a gate can be returned', async () => {
    const f = fixture();
    const error = new Error('page closed');
    f.page.route.mockRejectedValueOnce(error);
    await expect(f.install()).rejects.toBe(error);
    expect(f.page.eventNames()).toEqual([]);
  });

  it('records a second list arriving during teardown and preserves the failed verdict', async () => {
    const f = fixture();
    const gate = await f.install();
    const handled = f.route().run();
    await gate.waitForInitialResponse();
    f.page.unroute.mockImplementation(async () => {
      f.page.emit('request', f.request(`${panelPath}.data`));
    });
    await gate.dispose();
    await handled;
    expect(gate.snapshot().listRequests).toBe(2);
    expect(() => gate.assertHealthy()).toThrow('duplicate');
  });

  for (const primary of [new Error('primary scenario failure'), undefined]) {
    it(`preserves the exact primary ${primary ? 'error' : 'thrown undefined'} through all cleanup failures`, async () => {
      const steps: string[] = [];

      const result = withDatabaseCleanup(async () => {
        throw primary;
      }, [
        async () => {
          steps.push('before');
        },
        async () => {
          steps.push('dispose');
          throw new Error('dispose');
        },
        async () => {
          steps.push('after');
        },
        async () => {
          steps.push('binding-and-project');
          throw new Error('delete');
        },
        async () => {
          steps.push('health');
          throw new Error('gate');
        },
      ]);
      await expect(result).rejects.toBe(primary);
      expect(steps).toEqual(['before', 'dispose', 'after', 'binding-and-project', 'health']);
    });
  }

  it('fails a successful scenario on its first cleanup error after attempting every step', async () => {
    const first = new Error('dispose');

    const deleted = vi.fn(async () => {
      throw new Error('delete');
    });
    await expect(
      withDatabaseCleanup(
        async () => undefined,
        [
          async () => {
            throw first;
          },
          deleted,
        ],
      ),
    ).rejects.toBe(first);
    expect(deleted).toHaveBeenCalledOnce();
  });

  it('preserves the actual EN/FR scenario error when project cleanup also fails', async () => {
    type Scenario = (fixtures: unknown, info: unknown) => Promise<void>;

    const scenarios: Scenario[] = [];

    const register = Object.assign((_name: string, scenario: Scenario) => scenarios.push(scenario), {
      use: vi.fn(),
      setTimeout: vi.fn(),
    });
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', 'unit-fixture-only-never-sent');
    vi.doMock('@playwright/test', () => ({ test: register, expect }));

    try {
      await import('./e2e/database-loading-context.spec');
      expect(scenarios).toHaveLength(2);

      for (const scenario of scenarios) {
        const primary = new Error('primary cookie setup failure');

        const request = {
          post: vi
            .fn()
            .mockResolvedValueOnce({
              ok: () => true,
              json: async () => ({ token: 'test', organization: { id: 'test' } }),
            })
            .mockResolvedValueOnce({ ok: () => true, json: async () => ({ project: { id: 'test' } }) }),
          delete: vi.fn(async () => ({ status: () => 503 })),
        };
        const page = {
          context: () => ({
            addCookies: async () => {
              throw primary;
            },
          }),
        };
        await expect(scenario({ request, page }, {})).rejects.toBe(primary);
        expect(request.delete).toHaveBeenCalledOnce();
      }
    } finally {
      vi.doUnmock('@playwright/test');
      vi.unstubAllEnvs();
    }
  });
});
