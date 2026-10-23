import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Real submit callback, controlled transport/state; not a browser recipe.
const source = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const panel = tree.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectIdeApiServicePanel',
)!;
const submit = panel.body!.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'submit',
)!;

function harness(panelName: string, session?: object) {
  const setError = vi.fn();
  const reset = vi.fn();

  const loadPanel = vi.fn(async () => {
    setError(undefined);
  });
  const bindings = {
    projectId: 'synthetic-project',
    panel: panelName,
    FormData,
    donneesDuFormulaire: () => {
      const data = new FormData();
      data.set('intent', 'stop-session');

      return data;
    },
    fetchPanel: vi.fn().mockResolvedValue(
      Response.json(
        {
          ok: false,
          code: 'DEBUG_STATE_CONFLICT',
          error: 'Confirmed process status; persistence conflicted',
          ...(session ? { session } : {}),
        },
        { status: 409 },
      ),
    ),
    setBusy: vi.fn(),
    setError,
    setActionNotice: vi.fn(),
    loadPanel,
    t: (key: string) => key,
    panelActionFailureMessage: (result: { error: string }) => ({ message: result.error }),
    window: { dispatchEvent: vi.fn() },
    CustomEvent: class {
      constructor(
        public type: string,
        public options: unknown,
      ) {}
    },
    console: { warn: vi.fn(), error: vi.fn() },
    shouldResetIdePanelFormAfterSubmit: () => true,
    formatProjectPanelActionNotice: () => 'success',
  };
  const compiled = ts.transpileModule(`return (${submit.getText(tree)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const run = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));

  return { ...bindings, reset, run: () => run({ currentTarget: { reset }, preventDefault: vi.fn() }) };
}

describe('Debugger confirmed process with persistence conflict', () => {
  it('reloads authoritative state and keeps the failure notice without resetting the form', async () => {
    const h = harness('debugger', { id: 'synthetic-session', status: 'stopped', persistencePending: true });
    await h.run();
    expect(h.loadPanel).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(h.setError).toHaveBeenLastCalledWith('Confirmed process status; persistence conflicted');
    expect(h.setActionNotice).toHaveBeenLastCalledWith(undefined);
    expect(h.reset).not.toHaveBeenCalled();
    expect(h.setBusy).toHaveBeenLastCalledWith(false);
  });
  it('does not reload a plain configuration conflict or a different panel', async () => {
    for (const h of [harness('debugger'), harness('workflows', { persistencePending: true })]) {
      await h.run();
      expect(h.loadPanel).not.toHaveBeenCalled();
      expect(h.reset).not.toHaveBeenCalled();
      expect(h.setActionNotice).toHaveBeenLastCalledWith(undefined);
    }
  });
});
