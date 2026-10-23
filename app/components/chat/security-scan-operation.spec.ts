import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * Execute the real panel callbacks with deferred transport promises. This is a
 * controlled client race test, not evidence of a real scanner or browser run.
 */
const source = readFileSync(
  process.env.SECURITY_SCAN_CLIENT_SOURCE ?? new URL('./BaseChat.tsx', import.meta.url),
  'utf8',
);

const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = new Map<string, ts.Expression>();

const panel = tree.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectSecurityPanel',
)!;

for (const statement of panel.body!.statements) {
  if (!ts.isVariableStatement(statement)) {
    continue;
  }

  for (const declaration of statement.declarationList.declarations) {
    if (declaration.initializer) {
      callbacks.set(declaration.name.getText(tree), declaration.initializer);
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });

  return { promise, resolve, reject };
}

function harness() {
  type State = { status: string; progress: number };

  let state: State = { status: 'idle', progress: 0 };

  const requests: ReturnType<typeof deferred<Response>>[] = [];
  const scanAbortRef: { current: AbortController | null } = { current: null };
  const reload = vi.fn().mockResolvedValue(undefined);

  const bindings = {
    scanAbortRef,
    reload,
    projectId: 'synthetic-project',
    PROJECT_SECURITY_SCAN_TIMEOUT_MS: 90_000,
    window: { setTimeout, clearTimeout },
    FormData: class {},
    t: (key: string) => key,
    setScanState: (next: State | ((current: State) => State)) => {
      state = typeof next === 'function' ? next(state) : next;
    },
    fetch: vi.fn(() => {
      const request = deferred<Response>();
      requests.push(request);

      return request.promise;
    }),
  };

  function evaluate(name: string) {
    const compiled = ts.transpileModule(`return (${callbacks.get(name)!.getText(tree)});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
  }

  const run = evaluate('runScan');

  return {
    start: () => run({ preventDefault: vi.fn(), currentTarget: {} }) as Promise<void>,
    cancel: evaluate('cancelScan') as () => void,
    state: () => state,
    requests,
    reload,
    scanAbortRef,
  };
}

const completed = () => new Response(JSON.stringify({ ok: true, scan: { status: 'completed' } }));

afterEach(() => vi.useRealTimers());

describe('Security scan operation ownership', () => {
  it('keeps a restarted scan running when the cancelled request rejects late', async () => {
    vi.useFakeTimers();

    const h = harness();
    const first = h.start();
    h.cancel();
    expect(h.state().status).toBe('cancelled');

    const second = h.start();
    const secondController = h.scanAbortRef.current;
    h.requests[0].reject(new DOMException('Aborted', 'AbortError'));
    await first;
    expect(h.state().status).toBe('running');
    expect(h.scanAbortRef.current).toBe(secondController);
    h.requests[1].resolve(completed());
    await second;
    expect(h.state().status).toBe('completed');
    expect(h.reload).toHaveBeenCalledOnce();
  });

  it('ignores a completed response received after timeout', async () => {
    vi.useFakeTimers();

    const h = harness();
    const first = h.start();
    await vi.advanceTimersByTimeAsync(90_001);
    expect(h.state().status).toBe('timeout');
    h.requests[0].resolve(completed());
    await first;
    expect(h.state().status).toBe('timeout');
    expect(h.reload).not.toHaveBeenCalled();
  });

  it('ignores the old timeout while a replacement scan is still running', async () => {
    vi.useFakeTimers();

    const h = harness();
    const first = h.start();
    await vi.advanceTimersByTimeAsync(1_000);
    h.cancel();

    const second = h.start();
    await vi.advanceTimersByTimeAsync(89_001);
    expect(h.state().status).toBe('running');
    h.requests[0].resolve(completed());
    await first;
    expect(h.state().status).toBe('running');
    h.requests[1].resolve(completed());
    await second;
    expect(h.state().status).toBe('completed');
    expect(h.reload).toHaveBeenCalledOnce();
  });

  it('keeps cancellation when the aborted transport never settles before its timeout', async () => {
    vi.useFakeTimers();

    const h = harness();
    const first = h.start();
    h.cancel();
    await vi.advanceTimersByTimeAsync(90_001);
    expect(h.state().status).toBe('cancelled');
    h.requests[0].resolve(completed());
    await first;
    expect(h.state().status).toBe('cancelled');
    expect(h.reload).not.toHaveBeenCalled();
  });

  it('keeps timeout when abort rejects the current request', async () => {
    vi.useFakeTimers();

    const h = harness();
    const first = h.start();
    await vi.advanceTimersByTimeAsync(90_001);
    h.requests[0].reject(new DOMException('Aborted', 'AbortError'));
    await first;
    expect(h.state().status).toBe('timeout');
    expect(h.reload).not.toHaveBeenCalled();
  });

  it('preserves the new completion when the cancelled request rejects afterwards', async () => {
    vi.useFakeTimers();

    const h = harness();
    const first = h.start();
    h.cancel();

    const second = h.start();
    h.requests[1].resolve(completed());
    await second;
    h.requests[0].reject(new DOMException('Aborted', 'AbortError'));
    await first;
    expect(h.state().status).toBe('completed');
    expect(h.reload).toHaveBeenCalledOnce();
  });
});
