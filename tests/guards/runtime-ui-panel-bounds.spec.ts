import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

function nodesIn(path: string, kind: ts.ScriptKind) {
  const source = readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const nodes: ts.Node[] = [];

  function visit(node: ts.Node) {
    nodes.push(node);
    ts.forEachChild(node, visit);
  }

  visit(tree);

  return { tree, nodes };
}

const dashboard = nodesIn('tests/e2e/dashboard.spec.ts', ts.ScriptKind.TS);
const chat = nodesIn('app/components/chat/BaseChat.tsx', ts.ScriptKind.TSX);

const scenarios = dashboard.nodes.filter(
  (node): node is ts.CallExpression =>
    ts.isCallExpression(node) &&
    node.expression.getText(dashboard.tree) === 'test' &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === 'reopens project IDE with persisted agent memory and panel state',
);
expect(scenarios).toHaveLength(1);

const scenario = scenarios[0];
const scenarioNodes = dashboard.nodes.filter((node) => node.pos > scenario.pos && node.end < scenario.end);

describe('runtime Files width normalization contract', () => {
  it('retains an oversized 512px seed so reload must exercise the clamp', () => {
    const seeds = scenarioNodes.filter(
      (node): node is ts.PropertyAssignment =>
        ts.isPropertyAssignment(node) &&
        node.name.getText(dashboard.tree) === 'rightPanelWidth' &&
        ts.isPropertyAssignment(node.parent.parent) &&
        node.parent.parent.name.getText(dashboard.tree) === 'ui',
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0].initializer.getText(dashboard.tree)).toBe('512');
  });

  it('asserts the documented 360px bound after reload, independently of production constants', () => {
    const assertions = scenarioNodes.filter(
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node) &&
        node.expression.getText(dashboard.tree) === 'expect(persistedMetrics.rightPanelWidth).toBe',
    );
    expect(assertions).toHaveLength(1);
    expect(assertions[0].arguments[0].getText(dashboard.tree)).toBe("'360px'");

    const reload = scenarioNodes.find(
      (node) => ts.isCallExpression(node) && node.expression.getText(dashboard.tree) === 'page.reload',
    );
    expect(reload).toBeDefined();
    expect(reload!.end).toBeLessThan(assertions[0].pos);
  });

  it('restores 512px as 360px and preserves an in-range 300px using the actual production restore block', () => {
    const restores = chat.nodes.filter(
      (node): node is ts.IfStatement =>
        ts.isIfStatement(node) &&
        node.expression.getText(chat.tree).includes("typeof ui?.rightPanelWidth === 'number'"),
    );
    expect(restores).toHaveLength(1);

    const bounds = ['MIN_RIGHT_PANEL_WIDTH', 'MAX_RIGHT_PANEL_WIDTH'].map((name) => {
      const declaration = chat.nodes.find(
        (node): node is ts.VariableDeclaration =>
          ts.isVariableDeclaration(node) && node.name.getText(chat.tree) === name,
      );
      expect(declaration).toBeDefined();

      return `const ${declaration!.getText(chat.tree)};`;
    });
    const restore = new Function(
      'ui',
      'setRightPanelWidth',
      'rightPanelWidthChanged',
      `${bounds.join('\n')}\n${restores[0].getText(chat.tree)}`,
    ) as (ui: { rightPanelWidth: number }, setWidth: (width: number) => void, changed: { current: boolean }) => void;

    const setWidth = vi.fn();
    restore({ rightPanelWidth: 512 }, setWidth, { current: false });
    expect(setWidth).toHaveBeenLastCalledWith(360);
    restore({ rightPanelWidth: 300 }, setWidth, { current: false });
    expect(setWidth).toHaveBeenLastCalledWith(300);
  });
});
