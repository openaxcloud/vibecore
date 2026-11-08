/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

const selector = '.bolt-workbench-mobile > div.fixed';
const source = readFileSync('tests/e2e/mobile-device-matrix.spec.ts', 'utf8');

const tree = ts.createSourceFile(
  'mobile-device-matrix.spec.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

const declarations: ts.VariableDeclaration[] = [];
const assertions: ts.ExpressionStatement[] = [];

function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'previewState') {
    declarations.push(node);
  }

  if (
    ts.isExpressionStatement(node) &&
    /^expect\(/.test(node.getText(tree)) &&
    node.getText(tree).includes('previewState.')
  ) {
    assertions.push(node);
  }

  ts.forEachChild(node, visit);
}
visit(tree);
expect(declarations).toHaveLength(1);
expect(assertions).toHaveLength(2);

type PreviewState = { area: number; hasFrame: boolean; hasCanvas: boolean; textLength: number };
type PageProbe = { evaluate: (read: () => PreviewState) => Promise<PreviewState> };
type SurfaceProbe = { evaluate: (read: (element: HTMLElement) => PreviewState) => Promise<PreviewState> };

// Execute the actual measurement and its two assertions, not a copied implementation.
const measurement = ts.transpileModule(`return (async () => ${declarations[0].initializer!.getText(tree)})();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const readPreviewState = new Function(
  'page',
  'previewSurface',
  'document',
  'window',
  'getComputedStyle',
  measurement,
) as (
  page: PageProbe,
  previewSurface: SurfaceProbe,
  document: Document,
  window: Window,
  getComputedStyle: typeof globalThis.getComputedStyle,
) => Promise<PreviewState>;
const assertPreviewState = new Function(
  'previewState',
  'expect',
  'profileName',
  ts.transpileModule(assertions.map((node) => node.getText(tree)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText,
) as (state: PreviewState, assertion: typeof expect, profileName: string) => void;

function surface(width = 932, height = 310, text = 'Preview content has more than twenty characters') {
  const container = document.createElement('div');
  container.className = 'bolt-workbench-mobile';

  const element = document.createElement('div');
  element.className = 'fixed';
  element.textContent = text;
  container.append(element);

  /*
   * JSDOM has no layout. Model a detached or display:none surface's empty box.
   * These dimensions prove the read's lifecycle and assertions, not Chromium geometry.
   */
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
    let ancestor: HTMLElement | null = element;

    while (ancestor) {
      if (ancestor.hidden || getComputedStyle(ancestor).display === 'none') {
        return new DOMRect();
      }

      ancestor = ancestor.parentElement;
    }

    return element.isConnected ? new DOMRect(0, 48, width, height) : new DOMRect();
  });

  return { container, element };
}

function probe(beforeRead: () => void = () => undefined) {
  const evaluate = vi.fn(async (read: () => PreviewState) => {
    beforeRead();
    return read();
  });
  const legacyEvaluate = vi.fn(async (read: (element: HTMLElement) => PreviewState) => {
    const resolved = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return (
        element.isConnected &&
        style.display !== 'none' &&
        style.visibility === 'visible' &&
        (typeof element.checkVisibility !== 'function' || element.checkVisibility()) &&
        rect.width > 0 &&
        rect.height > 0
      );
    });

    if (!resolved) {
      throw new Error('No surface resolved in the locator model');
    }

    // Model the separate locator resolution and handle evaluation operations.
    beforeRead();

    return read(resolved);
  });

  const page = { evaluate };
  const previewSurface = { evaluate: legacyEvaluate };

  return {
    page,
    previewSurface,
    read: () => readPreviewState(page, previewSurface, document, window, getComputedStyle),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('runtime Preview measurement snapshot', () => {
  it('reads the current replacement once instead of a detached resolved node', async () => {
    const old = surface(400, 300);
    const replacement = surface();
    document.body.append(old.container);

    const replace = () => old.container.replaceWith(replacement.container);
    const legacy = probe(replace);

    expect(
      await legacy.previewSurface.evaluate((element) => {
        const rect = element.getBoundingClientRect();

        return { area: rect.width * rect.height, hasFrame: false, hasCanvas: false, textLength: 0 };
      }),
    ).toMatchObject({ area: 0 });
    expect(old.element.isConnected).toBe(false);
    replacement.container.replaceWith(old.container);

    const current = probe(replace);
    const state = await current.read();
    expect(state.area).toBe(288_920);
    expect(current.page.evaluate).toHaveBeenCalledTimes(1);
    expect(current.previewSurface.evaluate).not.toHaveBeenCalled();
    expect(old.element.isConnected).toBe(false);
    expect(replacement.element.isConnected).toBe(true);
    expect(() => assertPreviewState(state, expect, 'android-landscape')).not.toThrow();
  });

  it('uses one synchronous page callback without waits, polling or retries', () => {
    const initializer = declarations[0].initializer!;
    expect(ts.isAwaitExpression(initializer)).toBe(true);

    const call = (initializer as ts.AwaitExpression).expression as ts.CallExpression;
    expect(call.expression.getText(tree)).toBe('page.evaluate');
    expect(call.arguments).toHaveLength(1);

    const callback = call.arguments[0] as ts.ArrowFunction;
    expect(ts.isArrowFunction(callback)).toBe(true);
    expect(callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)).not.toBe(true);
    expect(callback.getText(tree)).not.toMatch(
      /\b(?:await|setTimeout|setInterval|requestAnimationFrame|waitFor|poll|retry)\b/,
    );
  });

  it('retains both original visibility waits and exact area/nonblank assertions', () => {
    expect(source).toContain("page.locator('.bolt-workbench-mobile > div.fixed:visible').first()");
    expect(source).toContain(
      'await expect(previewSurface, `${profileName} preview surface`).toBeVisible({ timeout: 45_000 });',
    );
    expect(source).toContain(
      'await expect(previewControls, `${profileName} preview controls`).toBeVisible({ timeout: 45_000 });',
    );
    expect(assertions[0].getText(tree)).toBe(
      'expect(previewState.area, `${profileName} preview area`).toBeGreaterThan(80_000);',
    );
    expect(assertions[1].getText(tree)).toContain(
      'previewState.hasFrame || previewState.hasCanvas || previewState.textLength > 20',
    );
    expect(assertions[1].getText(tree)).toContain(').toBe(true)');
  });

  it('fails when no current preview surface exists', async () => {
    await expect(probe().read()).rejects.toThrow();
  });

  it('does not substitute a webview or a fixed child outside the workbench', async () => {
    const other = surface();
    other.container.className = 'bolt-project-webview-tool';
    document.body.append(other.container);
    await expect(probe().read()).rejects.toThrow();
  });

  it('rejects a disconnected candidate even if a stale query and rectangle are supplied', async () => {
    const stale = surface();
    vi.mocked(stale.element.getBoundingClientRect).mockReturnValue(new DOMRect(0, 48, 932, 310));
    vi.spyOn(document, 'querySelectorAll').mockReturnValue([stale.element] as unknown as NodeListOf<Element>);
    vi.spyOn(document, 'querySelector').mockReturnValue(stale.element);
    await expect(probe().read()).rejects.toThrow();
  });

  it.each([
    ['display', 'none'],
    ['visibility', 'hidden'],
    ['visibility', 'collapse'],
  ])('rejects %s: %s despite a positive candidate rectangle', async (property, value) => {
    const hidden = surface();
    hidden.element.style.setProperty(property, value);
    vi.mocked(hidden.element.getBoundingClientRect).mockReturnValue(new DOMRect(0, 48, 932, 310));
    document.body.append(hidden.container);
    await expect(probe().read()).rejects.toThrow();
  });

  it('uses native visibility when available, including ancestor suppression', async () => {
    const hidden = surface();
    const checkVisibility = vi.fn(() => false);
    Object.defineProperty(hidden.element, 'checkVisibility', { value: checkVisibility });
    document.body.append(hidden.container);
    await expect(probe().read()).rejects.toThrow();
    expect(checkVisibility).toHaveBeenCalledTimes(1);
    expect(checkVisibility).toHaveBeenCalledWith();
  });

  it('accepts native visibility without adding opacity or viewport restrictions', async () => {
    const visible = surface();
    visible.element.style.opacity = '0';

    const checkVisibility = vi.fn(() => true);
    Object.defineProperty(visible.element, 'checkVisibility', { value: checkVisibility });
    vi.mocked(visible.element.getBoundingClientRect).mockReturnValue(new DOMRect(1500, 48, 932, 310));
    document.body.append(visible.container);
    expect((await probe().read()).area).toBe(288_920);
    expect(checkVisibility).toHaveBeenCalledWith();
  });

  it.each([
    [0, 310],
    [932, 0],
    [0, 0],
  ])('rejects a %d × %d rectangle', async (width, height) => {
    document.body.append(surface(width, height).container);
    await expect(probe().read()).rejects.toThrow();
  });

  it('selects the first visible matching surface rather than the first hidden or last visible one', async () => {
    const hidden = surface(400, 200);
    hidden.element.style.visibility = 'hidden';
    document.body.append(hidden.container, surface(600, 300).container, surface().container);
    expect((await probe().read()).area).toBe(180_000);
  });

  it('does not skip a small visible first surface to make the area assertion pass', async () => {
    document.body.append(surface(400, 200).container, surface().container);

    const state = await probe().read();
    expect(state.area).toBe(80_000);
    expect(() => assertPreviewState(state, expect, 'fixture')).toThrow();
  });

  it('fails on a first display:contents surface rather than measuring a later normal surface', async () => {
    const contents = surface(0, 0);
    contents.element.style.display = 'contents';

    const checkVisibility = vi.fn(() => false);
    Object.defineProperty(contents.element, 'checkVisibility', { value: checkVisibility });

    const child = document.createElement('div');
    child.textContent = 'Visible child of a boxless surface';
    vi.spyOn(child, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 48, 932, 310));
    contents.element.append(child);
    document.body.append(contents.container, surface().container);

    /*
     * Playwright's computeBox recurses into display:contents children before
     * native checkVisibility. It may select this boxless first surface, whose
     * area must fail, rather than the later large one. The current-DOM read
     * deliberately rejects this exceptional layout without choosing a successor.
     * Geometry/native visibility are modeled here; this is not the CI diagnosis.
     */
    expect(getComputedStyle(child).visibility).toBe('visible');
    expect(child.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(contents.element.getBoundingClientRect().width).toBe(0);
    await expect(probe().read()).rejects.toThrow();
    expect(checkVisibility).not.toHaveBeenCalled();
  });

  it.each([
    [400, 200, false],
    [400, 201, true],
  ])('keeps the strict >80,000 area boundary for %d × %d', async (width, height, valid) => {
    document.body.append(surface(width, height).container);

    const state = await probe().read();
    const assertion = () => assertPreviewState(state, expect, 'fixture');

    if (valid) {
      expect(assertion).not.toThrow();
    } else {
      expect(assertion).toThrow();
    }
  });

  it.each([
    ['', '', false],
    ['', 'x'.repeat(20), false],
    ['', ` ${'x'.repeat(20)} \n\t`, false],
    ['', 'x'.repeat(21), true],
    ['iframe', '', true],
    ['canvas', '', true],
  ])('preserves nonblank checks for tag=%s and text=%j', async (tag, text, valid) => {
    const candidate = surface(932, 310, text);

    if (tag) {
      candidate.element.append(document.createElement(tag));
    }

    document.body.append(candidate.container);

    const state = await probe().read();
    expect(state.hasFrame).toBe(tag === 'iframe');
    expect(state.hasCanvas).toBe(tag === 'canvas');
    expect(state.textLength).toBe(text.replace(/\s+/g, '').length);

    const assertion = () => assertPreviewState(state, expect, 'fixture');

    if (valid) {
      expect(assertion).not.toThrow();
    } else {
      expect(assertion).toThrow();
    }
  });
});
