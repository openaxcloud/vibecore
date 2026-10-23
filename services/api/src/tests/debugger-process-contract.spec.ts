import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Run the exact API handlers with controlled authorization and agent transport.
// Actual child lifecycle tests live in workspace-agent/debugger-process.spec.ts.
const source = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const handlers = new Map<string, ts.Expression>();
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(tree) === 'app.post' &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    handlers.set(node.arguments[0].text, node.arguments[1]);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
function harness(path: string) {
  const binding = {
    parse: (_schema: unknown, value: unknown) => value,
    workspaceParams: {},
    runtimeCommandSchema: {},
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
  const compiled = ts.transpileModule(`return (${handlers.get(path)!.getText(tree)});`, {
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
    run: () =>
      handler(
        {
          params: { workspaceId: 'requested-workspace', id: 'opaque' },
          body: { command: 'synthetic', background: true },
        },
        reply,
      ),
  };
}

describe('runtime process API contract — controlled dependencies', () => {
  const kill = '/api/runtime/workspaces/:workspaceId/processes/:id/kill';
  const launch = '/api/runtime/workspaces/:workspaceId/commands';
  it('propagates killed:false instead of unconditional 204', async () => {
    const h = harness(kill);
    h.binding.agentRequest.mockResolvedValue({ killed: false, id: 'opaque' });
    expect(await h.run()).toEqual({ killed: false, id: 'opaque' });
    expect(h.reply.status).toBe(409);
    expect(h.binding.authorizeRuntimeWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      'requested-workspace',
      'workspaces:write',
    );
    expect(h.binding.agentRequest).toHaveBeenCalledWith('authorized-workspace', '/processes/opaque/kill', {
      method: 'POST',
    });
  });
  it('returns confirmed termination explicitly', async () => {
    const h = harness(kill);
    h.binding.agentRequest.mockResolvedValue({ killed: true, id: 'opaque' });
    expect(await h.run()).toEqual({ killed: true, id: 'opaque' });
    expect(h.reply.status).toBe(200);
  });
  for (const path of [launch, kill]) {
    it(`does not execute ${path} after authorization rejects`, async () => {
      const h = harness(path);
      h.binding.authorizeRuntimeWorkspace.mockRejectedValue(new Error('synthetic forbidden'));
      await expect(h.run()).rejects.toThrow('synthetic forbidden');
      expect(h.binding.agentRequest).not.toHaveBeenCalled();
    });
  }
  it('preserves terminal revocation for background launches', async () => {
    const h = harness(launch);
    h.binding.isTerminalAccessRevoked.mockResolvedValue(true);
    await expect(h.run()).rejects.toMatchObject({ statusCode: 403, code: 'TERMINAL_ACCESS_DENIED' });
    expect(h.binding.agentRequest).not.toHaveBeenCalled();
  });
  it('does not fabricate a local background launch when the agent is unavailable', async () => {
    const h = harness(launch);
    h.binding.agentRequest.mockRejectedValue(new Error('synthetic agent unavailable'));
    h.binding.shouldUseLocalRuntimeFallback.mockReturnValue(true);
    await expect(h.run()).rejects.toThrow('synthetic agent unavailable');
    expect(h.binding.runLocalRuntimeCommand).not.toHaveBeenCalled();
  });
  it('preserves the opaque identity returned by the authorized agent', async () => {
    const h = harness(launch);
    h.binding.agentRequest.mockResolvedValue({ id: 'opaque', status: 'running' });
    expect(await h.run()).toEqual({ processId: 'opaque', status: 'running' });
  });
});
