/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useResponsiveLayout } from '@vibecore/editor';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampProjectAgentPanelWidth } from '~/lib/project-agent-layout';

// The Node export omits layout effects. Use the real browser panel implementation.
const panelsPackage = createRequire(__filename).resolve('react-resizable-panels/package.json');
const panelsBrowserBuild = join(dirname(panelsPackage), 'dist/react-resizable-panels.browser.development.esm.js');

const { Panel, PanelGroup, PanelResizeHandle } = (await import(
  /* @vite-ignore */ panelsBrowserBuild
)) as typeof import('react-resizable-panels');

const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, string>();
const elements = new Map<string, string>();
const positions = new Map<string, number>();
const effects = new Map<string, string>();

let restoration = '';
let resets = '';

const names = [
  'DEFAULT_RIGHT_PANEL_WIDTH',
  'MIN_RIGHT_PANEL_WIDTH',
  'MAX_RIGHT_PANEL_WIDTH',
  'getProjectPanelAvailableWidth',
  'panelPercentToPixels',
  'panelPixelsToPercent',
  'rightPanelDefaultSize',
  'rightPanelMinSize',
  'rightPanelMaxSize',
  'agentPanelDefaultSize',
  'workspacePanelDefaultSize',
  'finishRightPanelResize',
];

function attribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(tree) === name,
  )?.initializer;
}

function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
    declarations.set(node.name.getText(tree), `const ${node.getText(tree)};`);
  }

  if (ts.isIfStatement(node) && node.expression.getText(tree).includes("typeof ui?.rightPanelWidth === 'number'")) {
    expect(restoration).toBe('');
    restoration = node.getText(tree);
  }

  if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect') {
    const callback = node.arguments[0]?.getText(tree) ?? '';

    for (const panel of ['agent', 'right']) {
      if (callback.includes(`${panel}PanelRef.current?.resize`)) {
        effects.set(panel, node.getText(tree));
      }
    }

    if (callback.includes('agentPanelWidthChanged.current = false')) {
      expect(node.arguments[1]?.getText(tree)).toContain('projectId');
      resets = [
        ...callback.matchAll(
          /rightPanel(?:WidthChanged|ResizeActive)\.current = false;|setRightPanelWidth\(DEFAULT_RIGHT_PANEL_WIDTH\);/g,
        ),
      ]
        .map((match) => match[0])
        .join('\n');
    }
  }

  if (ts.isJsxOpeningElement(node)) {
    const id = attribute(node, 'id')?.getText(tree);

    if (['"project-workspace-panel"', '"project-right-panel"', '"project-agent-panel"'].includes(id ?? '')) {
      elements.set(id!, `${node.getText(tree)}Panel content</Panel>`);
      positions.set(id!, node.pos);
    }
  }

  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'PanelResizeHandle') {
    const label = attribute(node, 'aria-label')?.getText(tree) ?? '';

    if (label.includes('resizeFilesPanel')) {
      elements.set('filesHandle', node.getText(tree));
      positions.set('filesHandle', node.pos);
    }

    if (label.includes('resizeAiAgentPanel')) {
      elements.set('agentHandle', node.getText(tree));
      positions.set('agentHandle', node.pos);
    }
  }

  ts.forEachChild(node, visit);
}

visit(tree);

// The optional release callback is absent in the source before this repair.
expect(declarations.size).toBe(names.length - (declarations.has('finishRightPanelResize') ? 0 : 1));
expect(elements.size).toBe(5);
expect(restoration).not.toBe('');

interface Controls {
  width: number;
  agentWidth: number;
  agentPanel: ImperativePanelHandle | null;
  panel: ImperativePanelHandle | null;
  restore: (width: number, agentWidth?: number) => void;
  toggle: () => void;
}

interface HarnessProps {
  projectId?: string;
  capture: (controls: Controls) => void;
}

/*
 * Extract the production calculations, restore condition, effects and JSX props
 * into a small shell with the same three real panels and their DOM order. The
 * content is irrelevant to layout. Keep the actual responsive resize listener.
 * Optional new effects are absent on the pre-fix source so the regression can
 * fail on behavior, rather than failing because a new function was not found.
 */
const compiled = ts.transpileModule(
  `return function WidthHarness({ projectId = 'project-a', capture }) {
    const layout = useResponsiveLayout();
    ${names
      .slice(0, 3)
      .map((name) => declarations.get(name))
      .join('\n')}
    const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
    const [rightPanelOpen, setRightPanelOpen] = useState(true);
    const rightPanelRef = useRef(null);
    const rightPanelResizeActive = useRef(false);
    const rightPanelWidthChanged = useRef(false);
    const [agentWidth, setAgentWidth] = useState(340);
    const agentPanelRef = useRef(null);
    const agentPanelResizeActive = useRef(false);
    const agentPanelWidthChanged = useRef(false);
    const projectIdeMode = true;
    const useMobileIde = false;
    const projectAgentPanelOpen = true;
    const t = (key) => key;
    const setProjectPanelSearchParam = () => {};
    useEffect(() => { ${resets} }, [projectId]);
    ${names
      .slice(3)
      .map((name) => declarations.get(name))
      .join('\n')}
    ${effects.get('agent') ?? ''};
    ${effects.get('right') ?? ''};
    useEffect(() => { capture({
      width: rightPanelWidth,
      agentWidth,
      agentPanel: agentPanelRef.current,
      panel: rightPanelRef.current,
      restore: (width, nextAgentWidth) => {
        const ui = { rightPanelWidth: width };
        ${restoration}
        if (typeof nextAgentWidth === 'number') setAgentWidth(nextAgentWidth);
      },
      toggle: () => setRightPanelOpen((open) => !open),
    }); });
    return <PanelGroup direction="horizontal" data-testid="panel-group">
      ${[...elements.entries()]
        .sort(([a], [b]) => positions.get(a)! - positions.get(b)!)
        .map(([name, jsx]) => {
          const element =
            name === '"project-right-panel"'
              ? jsx.replace(/ref=\{rightPanelRef\}/, '').replace('<Panel', '<Panel ref={rightPanelRef}')
              : jsx;
          return name === 'filesHandle' || name === '"project-right-panel"'
            ? `{rightPanelOpen && (${element})}`
            : element;
        })
        .join('\n')}
    </PanelGroup>;
  };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
).outputText;

const WidthHarness = new Function(
  'React',
  'useState',
  'useRef',
  'useEffect',
  'useCallback',
  'useResponsiveLayout',
  'Panel',
  'PanelGroup',
  'PanelResizeHandle',
  'clampProjectAgentPanelWidth',
  compiled,
)(
  React,
  useState,
  useRef,
  useEffect,
  useCallback,
  useResponsiveLayout,
  Panel,
  PanelGroup,
  PanelResizeHandle,
  clampProjectAgentPanelWidth,
) as React.ComponentType<HarnessProps>;

function filesHandle(view: ReturnType<typeof render>) {
  return view.getByRole('separator', { name: 'chat.copy.resizeFilesPanel_95c3842c' });
}

function agentHandle(view: ReturnType<typeof render>) {
  return view.getByRole('separator', { name: 'chat.copy.resizeAiAgentPanel_2b57c38b' });
}

function installPointerGeometry(read: () => Controls) {
  /*
   * jsdom has no layout engine. Supply only physical hit-test rectangles; the
   * library still owns pointer capture, handle selection, delta and constraints.
   */
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    let x = 0;
    let width = 1600;

    if (this.hasAttribute('data-panel-resize-handle-id')) {
      x = this.getAttribute('aria-label')?.includes('resizeFilesPanel')
        ? 1600 - (read().panel?.getSize() ?? 0) * 16
        : (read().agentPanel?.getSize() ?? 0) * 16;
      width = 8;
    }

    return { x, y: 0, left: x, right: x + width, top: 0, bottom: 900, width, height: 900, toJSON: () => ({}) };
  });
}

function pointer(handle: HTMLElement, type: string, x: number, buttons: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 50, buttons });
  Object.defineProperty(event, 'isPrimary', { value: true });
  fireEvent(handle, event);
}

function drag(handle: HTMLElement, delta: number) {
  const x = handle.getBoundingClientRect().left + 4;
  pointer(handle, 'pointerdown', x, 1);
  pointer(handle, 'pointermove', x + delta, 1);
  pointer(handle, 'pointerup', x + delta, 0);
}

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1649); // 1600px available after the actual rail/border calculation.
  vi.stubGlobal('innerHeight', 900);
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('files panel width restoration', () => {
  it('connects the production Files panel to the imperative restoration ref', () => {
    // The harness also observes old versions without a ref for behavioral red/green proof.
    expect(elements.get('"project-right-panel"')).toContain('ref={rightPanelRef}');
  });

  it('applies a delayed 300px restoration to the mounted panel, including simultaneous agent restoration', async () => {
    let controls!: Controls;
    render(<WidthHarness capture={(next) => (controls = next)} />);
    await act(async () => {
      await Promise.resolve();
      controls.restore(300, 520);
    });
    expect(controls.width).toBe(300);
    expect(controls.panel?.getSize()).toBeCloseTo(18.75);
  });

  it('does not treat programmatic panel notifications as a saved preference', () => {
    let controls!: Controls;
    render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    act(() => controls.panel?.resize(22.5));
    expect(controls.width).toBe(300);
  });

  it('keeps the real existing min/max contract for out-of-range saved values', () => {
    let controls!: Controls;
    render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(512));
    expect(controls.width).toBe(360);
    expect(controls.panel?.getSize()).toBeCloseTo(22.5);
    act(() => controls.restore(100));
    expect(controls.width).toBe(272);
    expect(controls.panel?.getSize()).toBeCloseTo(17);
  });

  it('persists a real keyboard resize and preserves it when older memory arrives', async () => {
    let controls!: Controls;

    const view = render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    fireEvent.keyDown(filesHandle(view), { key: 'ArrowLeft' });
    fireEvent.keyUp(filesHandle(view), { key: 'ArrowLeft' });
    expect(controls.width).toBe(360);
    expect(controls.agentWidth).toBe(340);
    expect(controls.agentPanel?.getSize()).toBeCloseTo(21.25);
    await act(async () => {
      await Promise.resolve();
      controls.restore(300);
    });
    expect(controls.width).toBe(360);
    expect(controls.panel?.getSize()).toBeCloseTo(22.5);
  });

  it('restores the next project after resizing the previous project', () => {
    let controls!: Controls;

    const capture = (next: Controls) => (controls = next);
    const view = render(<WidthHarness projectId="project-a" capture={capture} />);
    act(() => controls.restore(300));
    fireEvent.keyDown(filesHandle(view), { key: 'ArrowLeft' });
    fireEvent.keyUp(filesHandle(view), { key: 'ArrowLeft' });
    expect(controls.width).toBe(360);
    view.rerender(<WidthHarness projectId="project-b" capture={capture} />);
    act(() => controls.restore(320));
    expect(controls.width).toBe(320);
    expect(controls.panel?.getSize()).toBeCloseTo(20);
  });

  it('does not inherit the previous project width when the next project has no saved width', () => {
    let controls!: Controls;

    const capture = (next: Controls) => (controls = next);
    const view = render(<WidthHarness projectId="project-a" capture={capture} />);
    act(() => controls.restore(300));
    fireEvent.keyDown(filesHandle(view), { key: 'ArrowLeft' });
    fireEvent.keyUp(filesHandle(view), { key: 'ArrowLeft' });
    expect(controls.width).toBe(360);
    view.rerender(<WidthHarness projectId="project-b" capture={capture} />);
    expect(controls.width).toBe(280);
    expect(controls.panel?.getSize()).toBeCloseTo(17.5);
  });

  it('routes the Agent keyboard handle to Agent without changing Files', () => {
    let controls!: Controls;

    const view = render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    fireEvent.keyDown(agentHandle(view), { key: 'ArrowRight' });
    fireEvent.keyUp(agentHandle(view), { key: 'ArrowRight' });
    expect(controls.agentWidth).toBe(500);
    expect(controls.agentPanel?.getSize()).toBeCloseTo(31.25);
    expect(controls.width).toBe(300);
    expect(controls.panel?.getSize()).toBeCloseTo(18.75);
  });

  it('routes real Files pointer events without changing Agent, and preserves that choice on late restore', async () => {
    let controls!: Controls;

    const view = render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    installPointerGeometry(() => controls);
    drag(filesHandle(view), -40);
    expect(controls.width).toBe(340);
    expect(controls.panel?.getSize()).toBeCloseTo(21.25);
    expect(controls.agentWidth).toBe(340);
    expect(controls.agentPanel?.getSize()).toBeCloseTo(21.25);
    await act(async () => {
      await Promise.resolve();
      controls.restore(300);
    });
    expect(controls.width).toBe(340);
    act(() => controls.panel?.resize(22.5));
    expect(controls.width).toBe(340); // Pointer-up cleared the interaction marker.
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 1449);
    fireEvent(window, new Event('resize'));
    act(() => vi.advanceTimersByTime(100));
    expect(controls.width).toBe(340);
    expect(controls.panel?.getSize()).toBeCloseTo((340 / 1400) * 100);
  });

  it('routes real Agent pointer events without changing Files', () => {
    let controls!: Controls;

    const view = render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    installPointerGeometry(() => controls);
    drag(agentHandle(view), 40);
    expect(controls.agentWidth).toBe(380);
    expect(controls.agentPanel?.getSize()).toBeCloseTo(23.75);
    expect(controls.width).toBe(300);
    expect(controls.panel?.getSize()).toBeCloseTo(18.75);
  });

  it.each(['pointerup', 'pointercancel'])('finishes a deferred restoration on %s without resizing', async (event) => {
    let controls!: Controls;

    const view = render(<WidthHarness capture={(next) => (controls = next)} />);
    installPointerGeometry(() => controls);

    const handle = filesHandle(view);
    const x = handle.getBoundingClientRect().left + 4;
    pointer(handle, 'pointerdown', x, 1);
    await act(async () => {
      await Promise.resolve();
      controls.restore(320);
    });
    expect(controls.width).toBe(320);
    expect(controls.panel?.getSize()).toBeCloseTo(17.5);
    pointer(handle, event, x, 0);
    expect(controls.panel?.getSize()).toBeCloseTo(20);
  });

  it('clears an interrupted keyboard resize marker when changing projects', () => {
    let controls!: Controls;

    const capture = (next: Controls) => (controls = next);
    const view = render(<WidthHarness projectId="project-a" capture={capture} />);
    act(() => controls.restore(300));
    fireEvent.keyDown(filesHandle(view), { key: 'ArrowLeft' });
    expect(controls.width).toBe(360);
    view.rerender(<WidthHarness projectId="project-b" capture={capture} />);
    act(() => controls.restore(320));
    expect(controls.width).toBe(320);
    expect(controls.panel?.getSize()).toBeCloseTo(20);
    act(() => controls.panel?.resize(22.5));
    expect(controls.width).toBe(320);
  });

  it('clears the keyboard resize marker on blur, even without a keyup', () => {
    let controls!: Controls;

    const view = render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    fireEvent.keyDown(filesHandle(view), { key: 'ArrowLeft' });
    fireEvent.blur(filesHandle(view));
    expect(controls.width).toBe(360);
    act(() => controls.panel?.resize(20));
    expect(controls.width).toBe(360);
  });

  it('recomputes the same saved width after a real viewport resize', () => {
    vi.useFakeTimers();

    let controls!: Controls;
    render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    vi.stubGlobal('innerWidth', 1449);
    fireEvent(window, new Event('resize'));
    act(() => vi.advanceTimersByTime(100));
    expect(controls.width).toBe(300);
    expect(controls.panel?.getSize()).toBeCloseTo((300 / 1400) * 100);
  });

  it('retains the preferred width when the Files panel closes and reopens', () => {
    let controls!: Controls;
    render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    act(() => controls.toggle());
    act(() => controls.toggle());
    expect(controls.width).toBe(300);
    expect(controls.panel?.getSize()).toBeCloseTo(18.75);
  });

  it('can close and reopen while a resize handle is held', () => {
    let controls!: Controls;

    const view = render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    installPointerGeometry(() => controls);

    const handle = filesHandle(view);
    const x = handle.getBoundingClientRect().left + 4;
    pointer(handle, 'pointerdown', x, 1);
    act(() => controls.toggle());
    pointer(document.body, 'pointerup', x, 0);
    act(() => controls.toggle());
    expect(controls.width).toBe(300);
    expect(controls.panel?.getSize()).toBeCloseTo(18.75);
  });

  it('preserves width and clears interaction state when keyboard resizing collapses Files before keyup', () => {
    let controls!: Controls;

    const view = render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(300));
    fireEvent.keyDown(filesHandle(view), { key: 'End' });
    expect(view.queryByRole('separator', { name: 'chat.copy.resizeFilesPanel_95c3842c' })).toBeNull();
    act(() => controls.toggle());
    expect(controls.width).toBe(300);
    expect(controls.panel?.getSize()).toBeCloseTo(18.75);
    act(() => controls.panel?.resize(22.5));
    expect(controls.width).toBe(300);
  });
});
