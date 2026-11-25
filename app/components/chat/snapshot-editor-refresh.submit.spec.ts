import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const servicePanel = tree.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectIdeApiServicePanel',
)!;
const submit = servicePanel.body!.statements.find(
  (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'submit',
)!;
const compiled = ts.transpileModule(`return (${submit.getText(tree)});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(options: { workspaceId?: string } = { workspaceId: 'synthetic-workspace' }) {
  const refresh = vi
    .fn<(archive?: string, workspace?: string, runtimeSynced?: boolean) => Promise<string>>()
    .mockResolvedValue('refreshed');

  const release = vi.fn();
  const setError = vi.fn();

  const prepareSnapshotFileRefresh = vi
    .fn<() => { refresh: typeof refresh; release: typeof release } | undefined>()
    .mockReturnValue({ refresh, release });
  const bindings = {
    projectId: 'synthetic-project',
    panel: 'snapshots',
    requestedWorkspaceId: options.workspaceId,
    FormData,
    fetchPanel: vi.fn<(path: string, init: { body: FormData }) => Promise<Response>>().mockImplementation(async () =>
      Response.json({
        ok: true,
        filesRestore: 'restored',
        editorArchive: 'file-archive',
        editorWorkspaceId: 'synthetic-workspace',
        editorRuntimeSynced: true,
      }),
    ),
    setBusy: vi.fn(),
    setActionNotice: vi.fn(),
    setError,
    loadPanel: vi.fn(async () => setError(undefined)),
    t: (key: string) => key,
    workbenchStore: { prepareSnapshotFileRefresh },
    formatProjectPanelActionNotice: () => 'success',
    panelActionFailureMessage: (result: { error: string }) => ({ message: result.error }),
    window: { dispatchEvent: vi.fn() },
    CustomEvent,
    console: { warn: vi.fn(), error: vi.fn() },
  };

  const run = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
  const form = new FormData();
  form.set('intent', 'restore');
  form.set('snapshotId', 'test-checkpoint');

  return { ...bindings, refresh, release, prepareSnapshotFileRefresh, run: () => run(form) };
}

describe('file-only restore submit and editor refresh', () => {
  it('waits for the editor to apply acknowledged bytes before announcing success', async () => {
    const f = fixture();

    let finish!: (value: string) => void;

    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    f.refresh.mockImplementationOnce(() => pending);

    const submit = f.run();
    await vi.waitFor(() => expect(f.refresh).toHaveBeenCalledWith('file-archive', 'synthetic-workspace', true));
    expect(f.setActionNotice).not.toHaveBeenCalledWith('success');
    expect(f.fetchPanel.mock.calls[0]?.[1]?.body.get('includeEditorArchive')).toBe('1');
    expect(f.fetchPanel.mock.calls[0]?.[1]?.body.get('editorWorkspaceId')).toBe('synthetic-workspace');
    expect(f.release).not.toHaveBeenCalled();
    finish('refreshed');
    await expect(submit).resolves.toBe(true);
    expect(f.setActionNotice).toHaveBeenLastCalledWith('success');
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('does not send a restore when drafts are present', async () => {
    const f = fixture();
    f.prepareSnapshotFileRefresh.mockReturnValueOnce(undefined);
    await expect(f.run()).resolves.toBe(false);
    expect(f.fetchPanel).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('restores the project without opting in or applying bytes when the workspace context is absent', async () => {
    const f = fixture({});
    f.refresh.mockResolvedValueOnce('unavailable');
    await expect(f.run()).resolves.toBe(false);
    expect(f.fetchPanel).toHaveBeenCalledOnce();
    expect(f.fetchPanel.mock.calls[0]?.[1]?.body.has('includeEditorArchive')).toBe(false);
    expect(f.fetchPanel.mock.calls[0]?.[1]?.body.has('editorWorkspaceId')).toBe(false);
    expect(f.refresh.mock.calls).toEqual([[]]);
    expect(f.setError).toHaveBeenLastCalledWith('baseChatAst.panel.snapshotRestoredWithoutWorkspace');
    expect(f.setActionNotice).not.toHaveBeenCalledWith('success');
  });

  it('still blocks legacy project restore if the editor guard detects a draft', async () => {
    const f = fixture({});
    f.prepareSnapshotFileRefresh.mockReturnValueOnce(undefined);
    await expect(f.run()).resolves.toBe(false);
    expect(f.fetchPanel).not.toHaveBeenCalled();
  });

  it('does not apply bytes after a failed restore, even if a payload includes them', async () => {
    const f = fixture();
    f.fetchPanel.mockImplementationOnce(async () =>
      Response.json({ ok: false, error: 'restore rejected', editorArchive: 'stale' }, { status: 409 }),
    );
    await expect(f.run()).resolves.toBe(false);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.setError).toHaveBeenLastCalledWith('restore rejected');
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('never marks the editor refreshed when the bound live runtime did not synchronize', async () => {
    const f = fixture();
    f.refresh.mockResolvedValueOnce('runtime-pending');
    await expect(f.run()).resolves.toBe(false);
    expect(f.setError).toHaveBeenLastCalledWith('baseChatAst.panel.snapshotRestoredRuntimePending');
    expect(f.setActionNotice).not.toHaveBeenCalledWith('success');
  });

  it('reports a separate refresh warning after the server restored, despite the panel reload', async () => {
    const f = fixture();
    f.refresh.mockResolvedValueOnce('newer-edits');
    await expect(f.run()).resolves.toBe(false);
    expect(f.loadPanel).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(f.setError).toHaveBeenLastCalledWith('baseChatAst.panel.snapshotRestoredNewerEdits');
    expect(f.setActionNotice).not.toHaveBeenCalledWith('success');
    expect(f.release).toHaveBeenCalledOnce();
  });
});
