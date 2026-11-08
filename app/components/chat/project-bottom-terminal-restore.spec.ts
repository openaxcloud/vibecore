import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/*
 * Exercise the actual shell's read, write and restore blocks. A copy of the
 * storage algorithm would miss the mount-effect ordering that caused this bug.
 */
const source = readFileSync(new URL('./BaseChat.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const readers: ts.FunctionDeclaration[] = [];
const initializers: ts.VariableStatement[] = [];
const writers: ts.Expression[] = [];
const restorers: string[] = [];

function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'readProjectBottomTerminalUiState') {
    readers.push(node);
  }

  if (ts.isVariableStatement(node)) {
    const names = node.declarationList.declarations.map((declaration) => declaration.name.getText(tree));

    if (names.includes('lastBottomTerminalUiState')) {
      initializers.push(node);
    }

    if (names.includes('localBottomTerminalUiState') && ts.isBlock(node.parent)) {
      const index = node.parent.statements.indexOf(node);
      restorers.push(
        node.parent.statements
          .slice(index, index + 3)
          .map((statement) => statement.getText(tree))
          .join('\n'),
      );
    }
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.getText(tree) === 'useEffect' &&
    node.arguments[0]?.getText(tree).includes('PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY')
  ) {
    writers.push(node.arguments[0]);
  }

  ts.forEachChild(node, visit);
}

visit(tree);
expect(readers).toHaveLength(1);
expect(initializers).toHaveLength(1);
expect(writers).toHaveLength(1);
expect(restorers).toHaveLength(1);

function execute<T>(body: string, bindings: Record<string, unknown>): T {
  const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

  return new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as T;
}

type TerminalUi = { height: number; open: boolean };

function harness(saved?: TerminalUi) {
  const key = 'vibecore-project-bottom-terminal-ui-v1';
  const storage = new Map<string, string>(saved ? [[key, JSON.stringify(saved)]] : []);

  const window = {
    localStorage: {
      getItem: (name: string) => storage.get(name) ?? null,
      setItem: (name: string, value: string) => storage.set(name, value),
    },
  };
  const read = execute<() => TerminalUi & { stored: boolean }>(
    `${readers[0].getText(tree)}; return readProjectBottomTerminalUiState;`,
    { window, PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY: key },
  );

  const initial = read();

  let state: TerminalUi = { height: initial.height, open: initial.open };

  const lastBottomTerminalUiState = execute<{ current: TerminalUi }>(
    `${initializers[0].getText(tree)}; return lastBottomTerminalUiState;`,
    { initialBottomTerminalUiState: initial, useRef: (current: TerminalUi) => ({ current }) },
  );

  function persist() {
    execute(`return (${writers[0].getText(tree)})();`, {
      window,
      PROJECT_BOTTOM_TERMINAL_UI_STORAGE_KEY: key,
      lastBottomTerminalUiState,
      terminalBottomHeight: state.height,
      terminalBottomOpen: state.open,
    });
  }

  return {
    read,
    persist,
    state: () => state,
    change(next: TerminalUi) {
      state = next;
      persist();
    },
    restore(ui: { terminalBottomHeight?: number; terminalBottomOpen?: boolean }) {
      execute(restorers[0], {
        ui,
        readProjectBottomTerminalUiState: read,
        setTerminalBottomHeight: (height: number) => (state = { ...state, height }),
        setTerminalBottomOpen: (open: boolean) => (state = { ...state, open }),
      });
      persist();
    },
  };
}

describe('bottom terminal preference restoration', () => {
  it('does not turn untouched mount defaults into a stored preference', () => {
    const shell = harness();
    shell.persist();
    shell.persist();
    expect(shell.read()).toEqual({ height: 420, open: false, stored: false });
  });

  it('restores the server height and open state after the mount effect runs', () => {
    const shell = harness();
    shell.persist();
    shell.restore({ terminalBottomHeight: 320, terminalBottomOpen: true });
    expect(shell.state()).toEqual({ height: 320, open: true });
    expect(shell.read()).toEqual({ height: 320, open: true, stored: true });
  });

  it('preserves a real local preference over the saved project layout', () => {
    const shell = harness({ height: 550, open: true });
    shell.persist();
    shell.restore({ terminalBottomHeight: 320, terminalBottomOpen: false });
    expect(shell.state()).toEqual({ height: 550, open: true });
  });

  it('preserves an explicit resize while server restoration is pending', () => {
    const shell = harness();
    shell.persist();
    shell.change({ height: 600, open: true });
    shell.restore({ terminalBottomHeight: 320, terminalBottomOpen: false });
    expect(shell.state()).toEqual({ height: 600, open: true });
  });

  it('persists a deliberate return to the defaults after an earlier change', () => {
    const shell = harness();
    shell.persist();
    shell.change({ height: 420, open: true });
    shell.change({ height: 420, open: false });
    shell.restore({ terminalBottomHeight: 320, terminalBottomOpen: true });
    expect(shell.state()).toEqual({ height: 420, open: false });
    expect(shell.read()).toEqual({ height: 420, open: false, stored: true });
  });

  it('keeps an absent project preference absent instead of pinning mount defaults', () => {
    const shell = harness();
    shell.persist();
    shell.restore({});
    expect(shell.read()).toEqual({ height: 420, open: false, stored: false });
  });
});
