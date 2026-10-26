import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action } from './api.projects.$projectId.ide-panel.$panel';
import { DEPLOY_REQUEST_TIMEOUT_MS } from './projects.$projectId.deployments.view';
import type { EnterpriseActionArgs } from '~/lib/enterprise-api.server';

function actionArgs(intent: string): EnterpriseActionArgs {
  const form = new FormData();

  for (const [key, value] of Object.entries({
    intent,
    deploymentId: 'isolated-deployment',
    workspaceId: 'isolated-workspace',
    provider: 'server',
    machineSize: 'medium',
    environment: 'preview',
  })) {
    form.set(key, value);
  }

  return {
    request: new Request('https://app.test/api/projects/isolated-project/ide-panel/deployments', {
      method: 'POST',
      body: form,
    }),
    params: { projectId: 'isolated-project', panel: 'deployments' },
  } as EnterpriseActionArgs;
}

/*
 * Exercise the real BFF action AND apiRequest. Only the outbound transport and
 * the clock behind AbortSignal.timeout are controlled; no deployment is made.
 */
function pendingTransport() {
  let signal!: AbortSignal;
  let init!: RequestInit;
  let url = '';
  let finish!: () => void;
  let started!: () => void;

  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((target: string, options: RequestInit) => {
      url = target;
      init = options;
      signal = options.signal!;
      started();

      return new Promise<Response>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        finish = () => resolve(Response.json({ deployment: { id: 'isolated-deployment' } }));
      });
    }),
  );

  return {
    ready,
    get signal() {
      return signal;
    },
    get init() {
      return init;
    },
    get url() {
      return url;
    },
    finish: () => finish(),
  };
}

describe('IDE deployment transport parity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), milliseconds);

      return controller.signal;
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const intent of ['create', 'redeploy']) {
    it(`${intent} keeps synchronous builds alive beyond 30s and aborts at 610s`, async () => {
      const transport = pendingTransport();

      let settled = false;

      const result = action(actionArgs(intent)).then(
        (value) => {
          settled = true;
          return value;
        },
        (error: unknown) => {
          settled = true;
          return error;
        },
      );
      await transport.ready;
      expect(AbortSignal.timeout).toHaveBeenCalledWith(DEPLOY_REQUEST_TIMEOUT_MS);
      expect(transport.url).toContain(
        intent === 'redeploy' ? '/isolated-deployment/redeploy' : '/isolated-project/deployments',
      );
      await vi.advanceTimersByTimeAsync(30_001);
      expect(transport.signal.aborted).toBe(false);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(DEPLOY_REQUEST_TIMEOUT_MS - 30_002);
      expect(transport.signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(transport.signal.aborted).toBe(true);
      expect(transport.signal.reason.name).toBe('TimeoutError');
      await result;
      expect(settled).toBe(true);
    });
  }

  it('forwards machine size and workspace and accepts a build completing after 30s', async () => {
    const transport = pendingTransport();
    const result = action(actionArgs('create'));
    await transport.ready;
    expect(JSON.parse(String(transport.init.body))).toMatchObject({
      machineSize: 'medium',
      workspaceId: 'isolated-workspace',
      provider: 'server',
      environment: 'preview',
    });
    await vi.advanceTimersByTimeAsync(31_000);
    transport.finish();
    expect(await result).toMatchObject({ data: { ok: true } });
    expect(transport.signal.aborted).toBe(false);
  });

  for (const intent of ['cancel', 'rollback']) {
    it(`${intent} retains the ordinary 30s request bound`, async () => {
      const transport = pendingTransport();
      const result = action(actionArgs(intent)).catch((error: unknown) => error);
      await transport.ready;
      expect(AbortSignal.timeout).toHaveBeenCalledWith(30_000);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(transport.signal.aborted).toBe(true);
      await result;
    });
  }
});
