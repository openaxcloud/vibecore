import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/*
 * Run the exact API handlers with controlled authorization and agent transport.
 * Actual child lifecycle tests live in workspace-agent/debugger-process.spec.ts.
 */
const source = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const declarations = new Map<string, ts.Expression>();
const handlers = new Map<string, ts.Expression>();

function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    declarations.set(node.name.text, node.initializer);
  }

  if (
    ts.isCallExpression(node) &&
    ['app.post', 'app.get'].includes(node.expression.getText(tree)) &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    handlers.set(node.arguments[0].text, node.arguments[1]);
  }

  ts.forEachChild(node, visit);
}
visit(tree);

function harness(path: string) {
  const binding = {
    z,
    parse: (schema: z.ZodTypeAny, value: unknown) => schema.parse(value),
    authorizeRuntimeWorkspace: vi
      .fn()
      .mockResolvedValue({ workspaceId: 'authorized-workspace', organizationId: 'synthetic-org' }),
    isTerminalAccessRevoked: vi.fn().mockResolvedValue(false),
    detectCommandAbuse: vi.fn().mockReturnValue(null),
    appPublicEnglish: (key: string) => key,
    agentRequest: vi.fn(),
    shouldUseLocalRuntimeFallback: vi.fn().mockReturnValue(false),
    stopLocalRuntimeProcess: vi.fn(),
    runLocalRuntimeCommand: vi.fn(),
  };

  const expression = handlers.get(path)!;
  const resolved = ts.isIdentifier(expression) ? declarations.get(expression.text)! : expression;

  const shared = [
    'workspaceParams',
    'runtimeDebuggerParams',
    'runtimeDebuggerStartSchema',
    'runtimeDebuggerControlSchema',
    'authorizeDebugger',
  ]
    .map((name) => `const ${name} = ${declarations.get(name)!.getText(tree)};`)
    .join('\n');
  const compiled = ts.transpileModule(`${shared} return (${resolved.getText(tree)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const handler = new Function(...Object.keys(binding), compiled)(...Object.values(binding));

  const reply = {
    status: 0,
    code(code: number) {
      this.status = code;
      return this;
    },
    send: (body: unknown) => body,
  };

  return {
    binding,
    reply,
    run: (body: unknown = { operationId: id, program: 'fixture.cjs' }, sessionId = id) =>
      handler(
        {
          params: { workspaceId: 'requested-workspace', id: sessionId },
          body,
        },
        reply,
      ),
  };
}

const id = '00000000-0000-4000-8000-000000000001';
const base = '/api/runtime/workspaces/:workspaceId/debugger/v1';
describe('structured debugger API — controlled dependencies', () => {
  for (const suffix of ['/start', '/:id', '/:id/control', '/:id/stop']) {
    it(`rejects unauthorized ${suffix} before transport`, async () => {
      const h = harness(base + suffix);
      h.binding.authorizeRuntimeWorkspace.mockRejectedValue(new Error('forbidden'));
      await expect(h.run()).rejects.toThrow('forbidden');
      expect(h.binding.agentRequest).not.toHaveBeenCalled();
    });
  }

  for (const suffix of ['/start', '/:id', '/:id/control']) {
    it(`honors terminal revocation for ${suffix}`, async () => {
      const h = harness(base + suffix);
      h.binding.isTerminalAccessRevoked.mockResolvedValue(true);
      await expect(h.run()).rejects.toMatchObject({ statusCode: 403, code: 'TERMINAL_ACCESS_DENIED' });
      expect(h.binding.agentRequest).not.toHaveBeenCalled();
      expect(h.binding.authorizeRuntimeWorkspace).toHaveBeenCalledWith(
        expect.anything(),
        'requested-workspace',
        'workspaces:write',
      );
    });
  }
  it('allows confirmed stop after terminal revocation', async () => {
    const h = harness(base + '/:id/stop');
    h.binding.isTerminalAccessRevoked.mockResolvedValue(true);
    h.binding.agentRequest.mockResolvedValue({ killed: true });
    expect(await h.run()).toEqual({ killed: true });
    expect(h.reply.status).toBe(200);
    expect(h.binding.isTerminalAccessRevoked).not.toHaveBeenCalled();
  });
  it('preserves an unconfirmed stop as conflict', async () => {
    const h = harness(base + '/:id/stop');
    h.binding.agentRequest.mockResolvedValue({ killed: false });
    await h.run();
    expect(h.reply.status).toBe(409);
  });
  it('uses single-attempt transport for control and does not replay a lost response', async () => {
    const h = harness(base + '/:id/control');
    h.binding.agentRequest.mockRejectedValue(new Error('response lost'));
    await expect(h.run({ action: 'step-over' })).rejects.toThrow('response lost');
    expect(h.binding.agentRequest).toHaveBeenCalledExactlyOnceWith(
      'authorized-workspace',
      `/debugger/v1/${id}/control`,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'step-over' }),
      },
      undefined,
      1,
    );
  });

  for (const body of [{ action: 'Runtime.evaluate' }, { action: 'continue', url: 'http://external.invalid' }]) {
    it(`rejects unsupported inspector input ${JSON.stringify(body)}`, async () => {
      const h = harness(base + '/:id/control');
      await expect(h.run(body)).rejects.toThrow();
      expect(h.binding.agentRequest).not.toHaveBeenCalled();
    });
  }
  it('rejects path injection in identity', async () => {
    const h = harness(base + '/:id');
    await expect(h.run(undefined, '../commands')).rejects.toThrow();
    expect(h.binding.agentRequest).not.toHaveBeenCalled();
  });

  for (const capability of [{}, { trackedSessions: 1 }, { nodeDebugger: '1' }]) {
    it(`fails closed for ${JSON.stringify(capability)}`, async () => {
      const h = harness(base + '/start');
      h.binding.agentRequest.mockResolvedValue(capability);
      await expect(h.run()).rejects.toMatchObject({ statusCode: 503, code: 'DEBUG_AGENT_INCOMPATIBLE' });
      expect(h.binding.agentRequest).toHaveBeenCalledExactlyOnceWith('authorized-workspace', '/sessions/capabilities');
    });
  }
  it('preserves structured launch fields without a shell or fallback', async () => {
    const h = harness(base + '/start');
    h.binding.agentRequest.mockResolvedValue({ nodeDebugger: 1 });

    const body = {
      operationId: id,
      program: 'fixture.cjs',
      stopOnEntry: false,
      breakpoints: [{ file: 'fixture.cjs', line: 2 }],
      watches: ['counter'],
    };
    await h.run(body);
    expect(h.binding.agentRequest).toHaveBeenLastCalledWith('authorized-workspace', '/debugger/v1/start', {
      method: 'POST',
      body: expect.any(String),
    });
    expect(JSON.parse(h.binding.agentRequest.mock.calls.at(-1)![2].body)).toEqual(body);
  });
});

describe('debugger control transport — lost-response regression', () => {
  it('does not re-send the POST after a connection reset', async () => {
    const retry = tree.statements.find(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) && node.name?.text === 'shouldRetryAgentHop',
    )!;
    const binding = {
      AGENT_REQUEST_ATTEMPTS: 3,
      agentToken: async () => 'synthetic-token',
      agentBaseUrl: () => 'http://synthetic.invalid',
      withRequestTimeout: (init: RequestInit) => ({ init, done: () => undefined }),
      fetch: vi.fn().mockRejectedValue(Object.assign(new Error('response lost'), { code: 'ECONNRESET' })),
      agentSleep: vi.fn(),
      agentRetryDelay: () => 0,
      isWorkspaceDnsNotResolvedYet: () => false,
      appPublicEnglish: (key: string) => key,
    };
    const compiled = ts.transpileModule(
      `${retry.getText(tree).replace(/^export\s+/, '')}\nreturn (${declarations.get('agentRequest')!.getText(tree)});`,
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      },
    ).outputText;

    const transport = new Function(...Object.keys(binding), compiled)(...Object.values(binding));
    await expect(
      transport(
        'authorized',
        `/debugger/v1/${id}/control`,
        { method: 'POST', body: '{"action":"step-over"}' },
        undefined,
        1,
      ),
    ).rejects.toMatchObject({ code: 'WORKSPACE_AGENT_REQUEST_FAILED' });
    expect(binding.fetch).toHaveBeenCalledTimes(1);
    expect(binding.agentSleep).not.toHaveBeenCalled();
  });
});
