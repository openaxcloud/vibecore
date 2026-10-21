import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('./api.projects.$projectId.ide-panel.$panel.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);

const declaration = tree.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'streamOverviewPanel',
);
expect(declaration).toBeDefined();

const compiled = ts.transpileModule(`${declaration!.getText(tree)}\nreturn streamOverviewPanel;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(load = vi.fn().mockResolvedValue({ ready: true })) {
  const bindings = {
    loadOverviewPanelEnvelope: load,
    encodeServerSentEvent: (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`,
    panelEnvelopeError: () => ({ error: true }),
    OVERVIEW_STREAM_INTERVAL_MS: 15_000,
  };
  const stream = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as (
    request: Request,
  ) => Response;

  const abort = new AbortController();
  const request = new Request('http://localhost/overview', { signal: abort.signal });

  return { load, stream, abort, request };
}

afterEach(() => vi.useRealTimers());

it('does not start polling when the client left during the preceding project lookup', async () => {
  vi.useFakeTimers();

  const { load, stream, abort, request } = harness();
  abort.abort();

  const response = stream(request);
  await vi.advanceTimersByTimeAsync(45_000);
  expect(load).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  expect(await response.body!.getReader().read()).toEqual({ done: true, value: undefined });
});

it('stops polling and releases the abort listener when the reader cancels', async () => {
  vi.useFakeTimers();

  const { load, stream, request } = harness();
  const remove = vi.spyOn(request.signal, 'removeEventListener');
  const reader = stream(request).body!.getReader();
  expect((await reader.read()).done).toBe(false);
  await reader.cancel();
  await vi.advanceTimersByTimeAsync(45_000);
  expect(load).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('cleans up if cancellation occurs synchronously inside the initial load', async () => {
  vi.useFakeTimers();

  const h = harness();
  h.load.mockImplementation(() => {
    h.abort.abort();
    return Promise.resolve({ ready: true });
  });

  const response = h.stream(h.request);
  await vi.advanceTimersByTimeAsync(45_000);
  expect(h.load).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  expect((await response.body!.getReader().read()).done).toBe(true);
});

it('keeps live polling working without overlapping an unfinished load', async () => {
  vi.useFakeTimers();

  let resolve!: (value: unknown) => void;

  const h = harness(
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
  );

  const reader = h.stream(h.request).body!.getReader();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(h.load).toHaveBeenCalledTimes(1);
  resolve({ ready: true });
  expect((await reader.read()).done).toBe(false);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(h.load).toHaveBeenCalledTimes(2);
  h.abort.abort();
  resolve({ ready: true });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(h.load).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('reports a load failure and resumes live updates on the next tick', async () => {
  vi.useFakeTimers();

  const h = harness(vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ ready: true }));
  const reader = h.stream(h.request).body!.getReader();
  const decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain('event: error');
  await vi.advanceTimersByTimeAsync(15_000);
  expect(decoder.decode((await reader.read()).value)).toContain('event: overview');
  await reader.cancel();
  expect(vi.getTimerCount()).toBe(0);
});
