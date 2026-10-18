// @vitest-environment jsdom
import { EventEmitter } from 'node:events';
import type { Page, Request, Response } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- Test helpers live outside the web-only ~/ alias.
import {
  collectIdeFailureState,
  createIdeRequestDiagnostics,
  withIdeRequestDiagnostics,
} from '../tests/e2e/helpers/ide-failure-metadata';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const width = (this as HTMLElement).style.display === 'none' ? 0 : 390;
    return { x: 0, y: 0, width, height: 100, top: 0, left: 0, right: width, bottom: 100, toJSON: () => ({}) };
  });
});

afterEach(() => vi.restoreAllMocks());

describe('IDE failure DOM evidence', () => {
  it('sees the real outer database loading container without requiring its absent title', () => {
    document.body.innerHTML = `
      <div data-mobile-panel="deploy">
        <button data-testid="tab-database" aria-pressed="true"></button>
        <div data-testid="ide-service-panel" data-panel="database">
          <section aria-busy="true" aria-live="polite"><p>Chargement</p></section>
        </div>
      </div>
      <div role="status"></div><div role="status"></div>`;
    expect(collectIdeFailureState()).toMatchObject({
      mobilePanel: 'deploy',
      databaseTabActive: true,
      databaseMounted: true,
      databaseVisible: true,
      databaseOuterBusy: true,
      databaseHeadingPresent: false,
      databaseHeadingVisible: false,
      statuses: 2,
      cards: 0,
    });
  });

  it('distinguishes mounted but hidden database content from an unrelated visible heading', () => {
    document.body.innerHTML = `
      <div data-testid="ide-service-panel" data-panel="database" style="display:none">
        <section aria-busy="true"></section>
      </div>
      <section><header><h2>All databases</h2></header><p>No database yet</p></section>`;
    expect(collectIdeFailureState()).toMatchObject({
      databaseMounted: true,
      databaseVisible: false,
      databaseOuterBusy: false,
      databaseHeadingPresent: false,
      databaseEmpty: false,
    });
  });

  it.each(['All databases', 'Toutes les bases de données'])('keeps the loaded %s state observable', (title) => {
    document.body.innerHTML = `
      <div data-testid="ide-service-panel" data-panel="database">
        <section><header><h2>${title}</h2></header><button data-testid="db-carte"></button></section>
      </div>`;
    expect(collectIdeFailureState()).toMatchObject({
      databaseMounted: true,
      databaseVisible: true,
      databaseOuterBusy: false,
      databaseHeadingPresent: true,
      databaseHeadingVisible: true,
      cards: 1,
    });
  });

  it('distinguishes a heading mounted in a hidden database panel from a visible heading', () => {
    document.body.innerHTML = `<div data-testid="ide-service-panel" data-panel="database" style="display:none"><h2>All databases</h2></div>`;
    expect(collectIdeFailureState()).toMatchObject({
      databaseMounted: true,
      databaseVisible: false,
      databaseHeadingPresent: true,
      databaseHeadingVisible: false,
    });
  });

  it('does not serialize DOM content, form values or the URL', () => {
    const privateValue = 'PRIVATE_SENTINEL_ONLY';
    document.body.innerHTML = `<div data-mobile-panel="${privateValue}"><input value="${privateValue}">${privateValue}</div>`;
    window.history.replaceState(null, '', `/?panel=database&token=${privateValue}`);

    const state = collectIdeFailureState();
    expect(state.databasePanelInUrl).toBe(true);
    expect(state.mobilePanel).toBe('other');
    expect(JSON.stringify(state)).not.toContain(privateValue);
  });

  it('uses the visible matching heading when another matching heading is hidden in the same panel', () => {
    document.body.innerHTML = `
      <div data-testid="ide-service-panel" data-panel="database">
        <h2 style="display:none">All databases</h2>
        <section><header><h2>All databases</h2></header><p>No database yet</p></section>
      </div>`;
    expect(collectIdeFailureState()).toMatchObject({
      databaseHeadingPresent: true,
      databaseHeadingVisible: true,
      databaseEmpty: true,
    });
  });
});

function request(
  url = 'https://app.example/api/projects/private-project/ide-panel/database',
  errorText?: string,
): Request {
  return { url: () => url, method: () => 'GET', failure: () => (errorText ? { errorText } : null) } as Request;
}

function response(req: Request, status = 200): Response {
  return { url: () => req.url(), request: () => req, status: () => status } as Response;
}

describe('IDE failure network evidence', () => {
  it('distinguishes no request, awaiting headers and receiving an unfinished body', () => {
    let now = 100;

    const diagnostics = createIdeRequestDiagnostics(100, () => now);
    expect(diagnostics.snapshot()).toMatchObject({ requests: [], responses: [], pendingRequests: [] });

    const req = request();
    now = 110;
    diagnostics.onRequest(req);
    now = 140;
    expect(diagnostics.snapshot()).toMatchObject({
      responses: [],
      requests: [{ id: 1, kind: 'database-panel', method: 'GET', startedAtMs: 10, state: 'awaiting-response' }],
      pendingRequests: [{ id: 1, kind: 'database-panel', state: 'awaiting-response', ageMs: 30 }],
    });
    diagnostics.onResponse(response(req));
    expect(diagnostics.snapshot()).toMatchObject({
      responses: [{ kind: 'database-panel', status: 200, elapsedMs: 40 }],
      pendingRequests: [{ state: 'receiving-body' }],
    });
    now = 150;
    diagnostics.onRequestFinished(req);
    expect(diagnostics.snapshot()).toMatchObject({
      requests: [{ state: 'finished', responseAtMs: 40, finishedAtMs: 50 }],
      pendingRequests: [],
    });
  });

  it.each(['ERR_ABORTED', 'ERR_NETWORK_CHANGED', 'ERR_NAME_NOT_RESOLVED', 'ERR_TIMED_OUT'])(
    'records %s without a response',
    (code) => {
      const diagnostics = createIdeRequestDiagnostics(100, () => 150);
      const req = request(undefined, `net::${code}`);
      diagnostics.onRequest(req);
      diagnostics.onRequestFailed(req);
      expect(diagnostics.snapshot()).toMatchObject({
        responses: [],
        requests: [{ state: 'failed', failureCode: code, failedAtMs: 50 }],
        pendingRequests: [],
      });
    },
  );

  it('keeps simultaneous requests to the same endpoint distinct', () => {
    const diagnostics = createIdeRequestDiagnostics(0, () => 10);
    const first = request();
    const second = request();
    diagnostics.onRequest(first);
    diagnostics.onRequest(second);
    diagnostics.onResponse(response(second));
    diagnostics.onRequestFinished(second);
    expect(diagnostics.snapshot()).toMatchObject({
      requests: [
        { id: 1, state: 'awaiting-response' },
        { id: 2, state: 'finished' },
      ],
      pendingRequests: [{ id: 1 }],
    });
  });

  it('bounds records and reports truncation instead of implying complete coverage', () => {
    const diagnostics = createIdeRequestDiagnostics(0, () => 10);

    for (let index = 0; index < 30; index += 1) {
      const req = request();
      diagnostics.onRequest(req);
      diagnostics.onResponse(response(req));
    }

    const snapshot = diagnostics.snapshot();
    expect(snapshot.requests).toHaveLength(24);
    expect(snapshot.responses).toHaveLength(24);
    expect(snapshot.pendingRequests).toHaveLength(24);
    expect(snapshot.droppedRequests).toBe(6);
  });

  it('ignores unrelated paths and sanitizes credentials, queries, identifiers and arbitrary error text', () => {
    const privateValue = 'PRIVATE_SENTINEL_ONLY';
    const diagnostics = createIdeRequestDiagnostics(0, () => 10);
    diagnostics.onRequest(request(`https://app.example/${privateValue}`));
    diagnostics.onRequest(request('malformed-url'));

    const req = request(
      `https://user:${privateValue}@app.example/api/projects/${privateValue}/ide-panel/database?schemaKey=${privateValue}`,
      `failure at https://app.example/${privateValue}`,
    );
    diagnostics.onRequest(req);
    diagnostics.onRequestFailed(req);

    const snapshot = diagnostics.snapshot();
    expect(snapshot.requests).toHaveLength(1);
    expect(snapshot.requests[0].failureCode).toBe('OTHER');

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(privateValue);
    expect(serialized).not.toContain('https:');
    expect(serialized).not.toContain('schemaKey');
  });

  it('takes immutable snapshots even if a request completes afterwards', () => {
    const diagnostics = createIdeRequestDiagnostics(0, () => 10);
    const req = request();
    diagnostics.onRequest(req);

    const first = diagnostics.snapshot();
    diagnostics.onResponse(response(req));
    diagnostics.onRequestFinished(req);
    expect(first.requests[0].state).toBe('awaiting-response');
    expect(first.responses).toEqual([]);
  });

  it('observes a response during the final asynchronous sample, then removes every listener', async () => {
    const emitter = new EventEmitter();
    const req = request();

    const result = await withIdeRequestDiagnostics(
      emitter as unknown as Pick<Page, 'on' | 'off'>,
      Date.now(),
      async (network) => {
        emitter.emit('request', req);
        await Promise.resolve().then(() => {
          emitter.emit('response', response(req));
          emitter.emit('requestfinished', req);
        });

        return network.snapshot();
      },
    );
    expect(result.responses).toHaveLength(1);
    expect(result.requests[0].state).toBe('finished');
    expect(emitter.eventNames()).toEqual([]);
  });

  it('removes every listener on a diagnostic failure without swallowing the error', async () => {
    const emitter = new EventEmitter();
    await expect(
      withIdeRequestDiagnostics(emitter as unknown as Pick<Page, 'on' | 'off'>, Date.now(), async () => {
        throw new Error('diagnostic-test');
      }),
    ).rejects.toThrow('diagnostic-test');
    expect(emitter.eventNames()).toEqual([]);
  });
});
