import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { describeSnapshotRestoreFailure } from './base-chat-panels';

// Execute the actual callback, keeping the large IDE shell outside this test.
const source = readFileSync(
  process.env.CHECKPOINT_CLIENT_SOURCE ?? resolve(import.meta.dirname, 'BaseChat.tsx'),
  'utf8',
);

const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

let callback: ts.Expression | undefined;

const availability: ts.Expression[] = [];

let confirmDisabled: ts.Expression | undefined;

function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'confirmProjectRollback') {
    expect(node.initializer && ts.isCallExpression(node.initializer)).toBe(true);
    callback = (node.initializer as ts.CallExpression).arguments[0];
  }

  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'rollbackAvailable' && node.initializer) {
    availability.push(node.initializer);
  }

  if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === 'button') {
    const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
    const testId = attributes.find((attribute) => attribute.name.getText(tree) === 'data-testid')?.initializer;

    if (testId && ts.isStringLiteral(testId) && testId.text === 'rollback-confirm') {
      const disabled = attributes.find((attribute) => attribute.name.getText(tree) === 'disabled')?.initializer;

      if (disabled && ts.isJsxExpression(disabled)) {
        confirmDisabled = disabled.expression;
      }
    }
  }

  ts.forEachChild(node, visit);
}

visit(tree);
expect(callback).toBeDefined();
expect(availability).toHaveLength(2);
expect(confirmDisabled).toBeDefined();

function evaluate(expression: ts.Expression, bindings: Record<string, unknown>) {
  const compiled = ts.transpileModule(`return (${expression.getText(tree)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}

function harness(snapshot: unknown, rollbackDatabase: boolean) {
  const rollbackTarget = {
    snapshot,
    title: 'Earlier conversation',
    createdAt: '2026-10-20T00:00:00.000Z',
    messages: [{ id: 'old-message', role: 'user', content: 'Earlier message' }],
  };
  const bindings = {
    projectId: 'qa-project',
    currentWorkspaceId: 'qa-workspace',
    rollbackTarget,
    rollbackDatabase,
    language: 'fr',
    t: (key: string) => key,
    setRollbackBusy: vi.fn(),
    toast: { error: vi.fn() },
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 503 })),
    saveProjectIdeMemory: vi.fn(),
    window: { location: { reload: vi.fn() } },
    describeSnapshotRestoreFailure,
  };

  const confirm = evaluate(callback!, bindings) as () => Promise<void>;

  return { confirm, bindings };
}

describe('checkpoint rollback client admission', () => {
  for (const snapshot of [undefined, null, {}, { id: '' }]) {
    for (const rollbackDatabase of [true, false]) {
      it(`refuses missing snapshot ${JSON.stringify(snapshot)} with database=${rollbackDatabase} before mutation`, async () => {
        const { confirm, bindings } = harness(snapshot, rollbackDatabase);
        await confirm();

        expect(bindings.fetch).not.toHaveBeenCalled();
        expect(bindings.saveProjectIdeMemory).not.toHaveBeenCalled();
        expect(bindings.window.location.reload).not.toHaveBeenCalled();
        expect(bindings.setRollbackBusy).not.toHaveBeenCalled();
        expect(bindings.toast.error).toHaveBeenCalledOnce();
      });
    }

    it(`disables both history actions and the dialog for snapshot ${JSON.stringify(snapshot)}`, () => {
      const checkpoint = { snapshot, messages: [{ id: 'existing-message' }] };

      for (const expression of availability) {
        expect(Boolean(evaluate(expression, { checkpoint }))).toBe(false);
      }

      expect(
        evaluate(confirmDisabled!, {
          rollbackBusy: false,
          rollbackTarget: checkpoint,
        }),
      ).toBe(true);
    });
  }

  it('preserves chat memory when a snapshot restore is refused', async () => {
    const { confirm, bindings } = harness({ id: 'snapshot-1' }, true);
    await confirm();

    expect(bindings.fetch).toHaveBeenCalledOnce();
    expect(bindings.saveProjectIdeMemory).not.toHaveBeenCalled();
    expect(bindings.window.location.reload).not.toHaveBeenCalled();
    expect(bindings.toast.error).toHaveBeenCalledOnce();
    expect(bindings.setRollbackBusy.mock.calls).toEqual([[true], [false]]);
  });

  it('keeps the existing file-only success path for an available snapshot', async () => {
    const { confirm, bindings } = harness({ id: 'snapshot-1' }, false);
    bindings.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await confirm();

    expect(bindings.saveProjectIdeMemory).toHaveBeenCalledOnce();
    expect(bindings.window.location.reload).toHaveBeenCalledOnce();
    expect(bindings.toast.error).not.toHaveBeenCalled();

    for (const expression of availability) {
      expect(Boolean(evaluate(expression, { checkpoint: bindings.rollbackTarget }))).toBe(true);
    }
  });
});
