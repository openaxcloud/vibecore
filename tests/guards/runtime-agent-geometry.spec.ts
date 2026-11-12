/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

const selector = '[data-testid="ide-agent-panel"]';
const source = readFileSync('tests/e2e/responsive-ide.spec.ts', 'utf8');
const tree = ts.createSourceFile('responsive-ide.spec.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declarations: ts.VariableDeclaration[] = [];

function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'agentBox') {
    declarations.push(node);
  }

  ts.forEachChild(node, visit);
}
visit(tree);
expect(declarations).toHaveLength(1);

type Box = { x: number; y: number; width: number; height: number };
type PageProbe = {
  evaluate: (read: () => Box | null) => Promise<Box | null>;
  locator: (query: string) => { first: () => { boundingBox: () => Promise<Box | null> } };
};

// Execute the real E2E measurement, including its selector, rather than a copied fix.
const measurement = ts.transpileModule(`return (async () => ${declarations[0].initializer!.getText(tree)})();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const readAgentBox = new Function('page', 'document', 'window', measurement) as (
  page: PageProbe,
  document: Document,
  window: Window,
) => Promise<Box | null>;

function panel(width = 339, height = 608) {
  const element = document.createElement('section');
  element.dataset.testid = 'ide-agent-panel';
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => new DOMRect(49, 80, width, height));

  return element;
}

function probe(beforeRead: () => void = () => undefined) {
  const evaluate = vi.fn(async (read: () => Box | null) => {
    beforeRead();
    return read();
  });

  /*
   * Model Playwright's separate handle resolution and measurement. The callback
   * deterministically replaces the node between those operations. This is a
   * geometry/lifecycle unit reproduction, not a Chromium/CDP execution.
   */
  const locator = vi.fn((query: string) => ({
    first: () => ({
      boundingBox: async () => {
        const resolved = document.querySelector<HTMLElement>(query);
        beforeRead();

        return resolved?.isConnected ? resolved.getBoundingClientRect().toJSON() : null;
      },
    }),
  }));

  return { evaluate, locator };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('runtime Agent geometry snapshot', () => {
  it('avoids the resolve/measure detach gap and reads the current replacement once', async () => {
    const old = panel(301);
    const replacement = panel();
    document.body.append(old);

    const replace = () => old.replaceWith(replacement);

    expect(await probe(replace).locator(selector).first().boundingBox()).toBeNull();
    expect(old.isConnected).toBe(false);
    replacement.replaceWith(old);

    const page = probe(replace);
    expect(await readAgentBox(page, document, window)).toEqual({ x: 49, y: 80, width: 339, height: 608 });
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.locator).not.toHaveBeenCalled();
  });

  it('keeps the first matching node and the original numeric assertions', async () => {
    document.body.append(panel(339), panel(400));
    expect(await readAgentBox(probe(), document, window)).toMatchObject({ width: 339 });
    expect(source).toContain('expect(agentBox?.width).toBeGreaterThan(260);');
    expect(source).toContain('expect(agentBox?.width).toBeLessThan((viewport?.width ?? 1200) * 0.46);');
  });

  it('uses a synchronous callback without retrying or waiting', () => {
    const initializer = declarations[0].initializer!;
    expect(ts.isAwaitExpression(initializer)).toBe(true);

    const call = (initializer as ts.AwaitExpression).expression as ts.CallExpression;
    expect(call.expression.getText(tree)).toBe('page.evaluate');

    const callback = call.arguments[0] as ts.ArrowFunction;
    expect(ts.isArrowFunction(callback)).toBe(true);
    expect(callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)).not.toBe(true);
    expect(callback.getText(tree)).not.toMatch(/\b(?:await|setTimeout|requestAnimationFrame|waitFor)\b/);
  });

  it('rejects an absent panel', async () => {
    expect(await readAgentBox(probe(), document, window)).toBeNull();
  });

  it('rejects a detached node even if a stale query result has nonzero geometry', async () => {
    vi.spyOn(document, 'querySelector').mockReturnValue(panel());
    expect(await readAgentBox(probe(), document, window)).toBeNull();
  });

  it.each([
    ['display', 'none'],
    ['visibility', 'hidden'],
    ['visibility', 'collapse'],
    ['content-visibility', 'hidden'],
    ['opacity', '0'],
  ])('rejects %s: %s on the panel or an ancestor', async (property, value) => {
    for (const ancestor of [false, true]) {
      const element = panel();
      const container = document.createElement('div');
      container.append(element);
      document.body.replaceChildren(container);
      (ancestor ? container : element).style.setProperty(property, value);
      expect(await readAgentBox(probe(), document, window)).toBeNull();
    }
  });

  it('rejects the hidden attribute on the panel or an ancestor', async () => {
    for (const ancestor of [false, true]) {
      const element = panel();
      const container = document.createElement('div');
      container.append(element);
      document.body.replaceChildren(container);
      (ancestor ? container : element).hidden = true;
      expect(await readAgentBox(probe(), document, window)).toBeNull();
    }
  });

  it.each([
    [0, 608],
    [339, 0],
    [0, 0],
  ])('rejects a zero rectangle of %d × %d', async (width, height) => {
    document.body.append(panel(width, height));
    expect(await readAgentBox(probe(), document, window)).toBeNull();
  });
});
