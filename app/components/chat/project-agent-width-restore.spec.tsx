/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useResponsiveLayout } from '@vibecore/editor';
import { useEffect, useRef, useState } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampProjectAgentPanelWidth } from '~/lib/project-agent-layout';

/*
 * The package's Node export omits layout effects. Exercise its real browser
 * build in jsdom, rather than replacing panels with test doubles.
 */
const panelsPackage = createRequire(__filename).resolve('react-resizable-panels/package.json');
const panelsBrowserBuild = join(dirname(panelsPackage), 'dist/react-resizable-panels.browser.development.esm.js');

const { Panel, PanelGroup, PanelResizeHandle } = (await import(
  /* @vite-ignore */ panelsBrowserBuild
)) as typeof import('react-resizable-panels');

/*
 * Run the shell's actual size calculation, restore block and resize handlers
 * against the real panel library. Its initial onResize callback is the event
 * that used to replace a saved 520px preference with the 340px mount default.
 */
const source = readFileSync(join(__dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const extracted = new Map<string, string>();

function attribute(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(tree) === name,
  )?.initializer;
}

function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'agentPanelDefaultSize') {
    extracted.set('size', node.initializer!.getText(tree));
  }

  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'getProjectPanelAvailableWidth') {
    extracted.set('availableWidth', (node.initializer as ts.CallExpression).arguments[0].getText(tree));
  }

  if (ts.isIfStatement(node) && node.expression.getText(tree).includes("typeof ui?.agentWidth === 'number'")) {
    extracted.set('restore', node.getText(tree));
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.getText(tree) === 'useEffect' &&
    node.arguments[0]?.getText(tree).includes('agentPanelRef.current?.resize')
  ) {
    extracted.set('synchronize', node.arguments[0].getText(tree));
  }

  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    if (attribute(node, 'id')?.getText(tree) === '"project-agent-panel"') {
      extracted.set('resize', (attribute(node, 'onResize') as ts.JsxExpression).expression!.getText(tree));
    }

    if (attribute(node, 'className')?.getText(tree).includes('bolt-project-agent-resize-handle')) {
      for (const name of ['onDragging', 'onKeyDownCapture', 'onKeyUpCapture', 'onBlur']) {
        extracted.set(name, (attribute(node, name) as ts.JsxExpression).expression!.getText(tree));
      }
    }
  }

  ts.forEachChild(node, visit);
}

visit(tree);
expect(extracted.size).toBe(9);
expect(source).toContain('const layout = useResponsiveLayout();');

function execute<T>(body: string, bindings: Record<string, unknown>): T {
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as T;
}

interface Controls {
  width: number;
  restore: (width: number) => void;
  drag: (active: boolean) => void;
  panel: { current: ImperativePanelHandle | null };
}

function WidthHarness({
  initialWidth = 340,
  availableWidth = 1600,
  capture,
}: {
  initialWidth?: number;
  availableWidth?: number;
  capture: (controls: Controls) => void;
}) {
  const [agentWidth, setAgentWidth] = useState(initialWidth);
  const agentPanelRef = useRef<ImperativePanelHandle>(null);
  const agentPanelResizeActive = useRef(false);
  const agentPanelWidthChanged = useRef(false);

  const bindings = {
    agentWidth,
    setAgentWidth,
    agentPanelRef,
    agentPanelResizeActive,
    agentPanelWidthChanged,
    clampProjectAgentPanelWidth,
    getProjectPanelAvailableWidth: () => availableWidth,
    panelPercentToPixels: (size: number) => Math.round((availableWidth * size) / 100),
    projectIdeMode: true,
    useMobileIde: false,
    projectAgentPanelOpen: true,
  };

  const size = execute<number>(`return ${extracted.get('size')};`, bindings);

  const synchronize = execute<() => void>(`return (${extracted.get('synchronize')});`, {
    ...bindings,
    agentPanelDefaultSize: size,
  });
  useEffect(synchronize, [synchronize]);

  const handler = <T,>(name: string) => execute<T>(`return (${extracted.get(name)});`, bindings);
  const onDragging = handler<(active: boolean) => void>('onDragging');
  capture({
    width: agentWidth,
    restore: (width) => execute(extracted.get('restore')!, { ...bindings, ui: { agentWidth: width } }),
    drag: onDragging,
    panel: agentPanelRef,
  });

  return (
    <PanelGroup direction="horizontal">
      <Panel
        id="test-agent"
        ref={agentPanelRef}
        defaultSize={size}
        minSize={20}
        maxSize={36}
        onResize={handler('resize')}
      >
        Agent
      </Panel>
      <PanelResizeHandle
        data-testid="resize-agent"
        onDragging={onDragging}
        onKeyDownCapture={handler('onKeyDownCapture')}
        onKeyUpCapture={handler('onKeyUpCapture')}
        onBlur={handler('onBlur')}
      />
      <Panel defaultSize={100 - size} minSize={35}>
        Workspace
      </Panel>
    </PanelGroup>
  );
}

function ResponsiveWidthHarness({ capture }: { capture: (controls: Controls) => void }) {
  const layout = useResponsiveLayout();

  const readAvailableWidth = execute<() => number>(`return (${extracted.get('availableWidth')});`, {
    window,
    document,
  });

  return (
    <div data-testid="responsive-layout" data-breakpoint={layout.breakpoint}>
      <WidthHarness initialWidth={520} availableWidth={readAvailableWidth()} capture={capture} />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('project agent width restoration', () => {
  it('renders the saved preference on mount instead of replacing it with the initial panel notification', () => {
    let controls!: Controls;
    render(<WidthHarness initialWidth={520} capture={(next) => (controls = next)} />);
    expect(controls.width).toBe(520);
    expect(controls.panel.current?.getSize()).toBe(32.5);
  });

  it('applies a delayed restored width to the live panel, not only a CSS variable', () => {
    let controls!: Controls;
    render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => controls.restore(520));
    expect(controls.width).toBe(520);
    expect(controls.panel.current?.getSize()).toBe(32.5);
  });

  it('keeps a preferred width while constrained and reapplies it on a wider viewport', () => {
    let controls!: Controls;

    const capture = (next: Controls) => (controls = next);
    const view = render(<WidthHarness initialWidth={520} availableWidth={1231} capture={capture} />);
    expect(controls.panel.current?.getSize()).toBe(36);
    expect(controls.width).toBe(520);
    view.rerender(<WidthHarness initialWidth={520} availableWidth={1600} capture={capture} />);
    expect(controls.panel.current?.getSize()).toBe(32.5);
    expect(controls.width).toBe(520);
  });

  it('recomputes after an actual viewport resize within the desktop breakpoint', () => {
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 900);
    vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media }));

    let controls!: Controls;

    const view = render(<ResponsiveWidthHarness capture={(next) => (controls = next)} />);
    expect(view.getByTestId('responsive-layout').getAttribute('data-breakpoint')).toBe('desktop');
    expect(controls.panel.current?.getSize()).toBe(36);
    expect(controls.width).toBe(520);

    // No manual rerender: the production hook's resize listener must schedule it.
    vi.stubGlobal('innerWidth', 1649);
    fireEvent(window, new Event('resize'));
    expect(controls.panel.current?.getSize()).toBe(36);
    act(() => vi.advanceTimersByTime(100));
    expect(view.getByTestId('responsive-layout').getAttribute('data-breakpoint')).toBe('desktop');
    expect(controls.panel.current?.getSize()).toBe(32.5);
    expect(controls.width).toBe(520);
  });

  it('does not persist programmatic panel measurements', () => {
    let controls!: Controls;
    render(<WidthHarness initialWidth={520} capture={(next) => (controls = next)} />);
    act(() => controls.panel.current?.resize(25));
    expect(controls.width).toBe(520);
  });

  it('persists an explicit drag and does not overwrite it when restoration finishes', () => {
    let controls!: Controls;
    render(<WidthHarness capture={(next) => (controls = next)} />);
    act(() => {
      controls.drag(true);
      controls.panel.current?.resize(30);
    });
    act(() => controls.drag(false));
    expect(controls.width).toBe(480);
    act(() => controls.restore(520));
    expect(controls.width).toBe(480);
    expect(controls.panel.current?.getSize()).toBe(30);
  });

  it('persists accessible keyboard resizing', () => {
    let controls!: Controls;

    const view = render(<WidthHarness initialWidth={520} capture={(next) => (controls = next)} />);
    fireEvent.keyDown(view.getByTestId('resize-agent'), { key: 'ArrowLeft' });
    fireEvent.keyUp(view.getByTestId('resize-agent'), { key: 'ArrowLeft' });
    expect(controls.width).toBe(360);
    expect(controls.panel.current?.getSize()).toBe(22.5);
  });
});
