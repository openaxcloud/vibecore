import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

const source = readFileSync(new URL('./projects.$projectId.ide.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const statements = tree.statements.filter((node) => {
  const text = node.getText(tree);
  return (
    text.startsWith('let projectIdeChatImport:') ||
    (ts.isFunctionDeclaration(node) && node.name?.text === 'loadProjectIdeChat') ||
    (ts.isIfStatement(node) && text.includes('loadProjectIdeChat()')) ||
    text.startsWith('const ProjectIdeChat = lazy(')
  );
});
expect(statements).toHaveLength(4);

const code = ts.transpileModule(statements.map((node) => node.getText(tree)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  transformers: {
    before: [
      (context) => {
        const visit: ts.Visitor = (node) => {
          if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            return ts.factory.createCallExpression(ts.factory.createIdentifier('loadModule'), undefined, []);
          }

          return ts.visitEachChild(node, visit, context);
        };
        return (node) => ts.visitNode(node, visit) as ts.SourceFile;
      },
    ],
  },
}).outputText;

function evaluate(browser: boolean, initialFailure?: Error) {
  const chat = () => null;
  const loadModule = vi.fn().mockResolvedValue({ Chat: chat });

  if (initialFailure) {
    loadModule.mockRejectedValueOnce(initialFailure);
  }

  const lazy = vi.fn((load) => load);

  const render = new Function('window', 'loadModule', 'lazy', `${code}\nreturn ProjectIdeChat;`)(
    browser ? {} : undefined,
    loadModule,
    lazy,
  ) as () => Promise<{ default: typeof chat }>;

  return { loadModule, render, chat };
}

it('starts the shell import before its first render and reuses that work', async () => {
  const h = evaluate(true);
  expect(h.loadModule).toHaveBeenCalledOnce();

  const first = h.render();
  expect(h.render()).toBe(first);
  expect(await first).toEqual({ default: h.chat });
  expect(h.loadModule).toHaveBeenCalledOnce();
});

it('does not eagerly import browser code on the server', () => {
  const h = evaluate(false);
  expect(h.loadModule).not.toHaveBeenCalled();
});

it('releases a rejected speculative promise without retrying until the next consumer', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    const failure = new Error('initial transport failed');
    const h = evaluate(true, failure);
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('Unable to preload the interactive IDE shell', failure));

    // Settling the speculative rejection must not itself start another import.
    expect(h.loadModule).toHaveBeenCalledOnce();

    const first = h.render();
    expect(h.render()).toBe(first);
    await expect(first).resolves.toEqual({ default: h.chat });
    expect(h.loadModule).toHaveBeenCalledTimes(2);
  } finally {
    logged.mockRestore();
  }
});
