import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes: ts.Node[] = [];

function visit(node: ts.Node) {
  nodes.push(node);
  ts.forEachChild(node, visit);
}
visit(tree);

it('the actual status control opens Shell normally and Problems for quota/billing warnings', () => {
  const button = nodes.find(
    (node): node is ts.JsxElement =>
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(tree) === 'button' &&
      node.openingElement.getText(tree).includes('bolt-project-statusbar-workspace'),
  )!;
  const click = button.openingElement.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'onClick',
  )!;

  const expression = (click.initializer as ts.JsxExpression).expression!.getText(tree);

  for (const [quotaWarning, billingUpgradePrompt, destination] of [
    [false, false, 'terminal'],
    [true, false, 'problems'],
    [false, true, 'problems'],
  ]) {
    const openBottomTerminal = vi.fn();
    new Function('quotaWarning', 'billingUpgradePrompt', 'openBottomTerminal', `return (${expression})`)(
      quotaWarning,
      billingUpgradePrompt,
      openBottomTerminal,
    )();
    expect(openBottomTerminal).toHaveBeenCalledExactlyOnceWith(destination);
  }
});

it('actual workspace status distinguishes Starting from Running', () => {
  const declaration = nodes.find(
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) && node.name.getText(tree) === 'workspaceStatusLabel',
  )!;

  const callback = (declaration.initializer as ts.CallExpression).arguments[0].getText(tree);

  const label = (workspaceLoading: boolean, isRuntimeReallyRunning: boolean) =>
    new Function(
      'workspaceLoading',
      'isRuntimeReallyRunning',
      'previewPortLive',
      'workspaceError',
      'projectRuntimeState',
      't',
      'platformStateLabel',
      `return (${callback})()`,
    )(workspaceLoading, isRuntimeReallyRunning, false, null, {}, (key: string) => key, vi.fn());
  expect(label(true, false)).toBe('baseChatAst.status.starting');
  expect(label(false, true)).toBe('baseChatAst.status.running');
});

it('runtime scenario checks Shell and then independently activates Webview before existing toolbar assertions', () => {
  const test = readFileSync('tests/e2e/dashboard.spec.ts', 'utf8');

  const scenario = test.slice(
    test.indexOf('const workspaceStatusButton ='),
    test.indexOf('const webviewToolbarMetrics ='),
  );
  expect(scenario).toContain('Running|Starting|Building|Crashed|Stopped');
  expect(scenario).toContain("name: 'Shell (Terminal)', exact: true");
  expect(scenario).toContain("await webviewTab.getByRole('button', { name: 'Webview', exact: true }).click()");
  expect(scenario).toContain("await expect(webviewTab).toHaveAttribute('aria-selected', 'true')");
  expect(scenario).toContain('timeout: 15000');
  expect(scenario).toContain("name: 'Close terminal panel', exact: true");
  expect(scenario).toContain('await expect(statusTerminal).toBeHidden()');
  expect(scenario.indexOf('await workspaceStatusButton.click()')).toBeLessThan(
    scenario.indexOf('await webviewTab.getByRole'),
  );
});
