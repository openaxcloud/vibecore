import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = readFileSync('tests/e2e/dashboard.spec.ts', 'utf8');
const tree = ts.createSourceFile('dashboard.spec.ts', source, ts.ScriptTarget.Latest, true);
const scenarioName = 'edit file workflow surfaces editor, files, terminal and preview affordances';
const calls: ts.CallExpression[] = [];

function visit(node: ts.Node) {
  if (ts.isCallExpression(node)) {
    calls.push(node);
  }

  ts.forEachChild(node, visit);
}

visit(tree);

describe('runtime UI color assertions declare their theme', () => {
  it('sets dark before the edit workflow measures the dark command-palette surface', () => {
    const scenarios = calls.filter(
      (node) =>
        node.expression.getText(tree) === 'test' &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === scenarioName,
    );

    expect(scenarios).toHaveLength(1);

    const scenario = scenarios[0];

    const darkSetup = calls.find(
      (node) =>
        node.pos > scenario.pos && node.end < scenario.end && node.expression.getText(tree) === 'forceDarkTheme',
    );
    const measurement = calls.find(
      (node) =>
        node.pos > scenario.pos &&
        node.end < scenario.end &&
        node.expression.getText(tree) === "page.locator('.bolt-project-command-palette').evaluate",
    );
    expect(measurement).toBeDefined();
    expect(darkSetup).toBeDefined();
    expect(darkSetup!.end).toBeLessThan(measurement!.pos);
    expect(ts.isAwaitExpression(darkSetup!.parent)).toBe(true);
    expect(scenario.getText(tree)).toContain("expect(commandPaletteMetrics.background).toBe('rgb(26, 32, 48)')");
  });

  it('sets both server and browser preferences before reloading the theme helper', () => {
    const helper = tree.statements.find(
      (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'forceDarkTheme',
    );
    expect(helper).toBeDefined();

    const body = helper!.getText(tree);
    expect(body).toContain("document.cookie = 'ecode_theme=dark; path=/; SameSite=Lax'");
    expect(body).toContain("localStorage.setItem('bolt_theme', 'dark')");
    expect(body).toContain("await page.reload({ waitUntil: 'domcontentloaded' })");
    expect(body.indexOf("localStorage.setItem('bolt_theme', 'dark')")).toBeLessThan(body.indexOf('await page.reload'));
  });
});
