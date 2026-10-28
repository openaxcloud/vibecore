import { BUILTIN_AGENT_ROUTING_CARD } from '@vibecore/billing/src/agent-routing';
import { buildExplicitRunPermit } from '@vibecore/billing/src/explicit-run';
import { formatDataStreamPart } from 'ai';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { action } from './api.chat';
import { retrieveMemoryForAgentContext, persistAgentMemoryCandidate } from '~/lib/.server/llm/agent-memory';
import { createAgentPlan } from '~/lib/.server/llm/create-agent-plan';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { selectContext } from '~/lib/.server/llm/select-context';
import { loadUserMcpConfig } from '~/lib/.server/mcp/load-config.server';
import { prepareWebReferenceForChat } from '~/lib/.server/web/chat-web-reference';

const boundary = vi.hoisted(() => ({
  streamText: vi.fn(),
  streamStartup: vi.fn(),
  quota: vi.fn(),
  close: vi.fn(),
  usage: vi.fn(),
  api: vi.fn(),
  fetch: vi.fn(),
  toolReplay: vi.fn(),
}));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();

  return {
    ...actual,
    createDataStream: (...args: Parameters<typeof actual.createDataStream>) => {
      boundary.streamStartup();
      return actual.createDataStream(...args);
    },
  };
});
vi.mock('~/lib/.server/llm/stream-text', () => ({ streamText: boundary.streamText }));
vi.mock('~/lib/.server/ai-usage', () => ({
  checkChatQuota: boundary.quota,
  recordChatUsage: boundary.usage,
  recordProviderMetric: vi.fn(),
}));
vi.mock('~/lib/enterprise-api.server', () => ({ apiRequest: boundary.api }));
vi.mock('~/lib/.server/llm/agent-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/.server/llm/agent-mode')>()),
  isAgentModeRoutingDisabled: () => true,
}));
vi.mock('~/lib/.server/llm/agent-orchestration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/.server/llm/agent-orchestration')>()),
  shouldUseAgentOrchestration: () => false,
  buildAgentOrchestrationPlan: () => ({
    enabled: false,
    mode: 'single-model-lanes',
    reason: 'synthetic-test',
    roles: [],
  }),
}));
vi.mock('~/lib/.server/llm/agent-memory', () => ({
  retrieveMemoryForAgentContext: vi.fn(async () => null),
  persistAgentMemoryCandidate: vi.fn(async () => undefined),
  agentMemoryAnnotation: vi.fn(),
}));
vi.mock('~/lib/.server/llm/project-skills', () => ({ retrieveSkillsForAgentContext: vi.fn(async () => null) }));
vi.mock('~/lib/.server/web/rate-limit-redis.server', () => ({
  getWebReferenceRateLimitRedis: vi.fn(async () => null),
}));
vi.mock('~/lib/.server/web/chat-web-reference', () => ({
  prepareWebReferenceForChat: vi.fn(async ({ messages }) => ({ messagesForAgents: messages })),
}));
vi.mock('~/lib/.server/web/web-fetch-tool', () => ({ webFetchToolSet: () => ({}) }));
vi.mock('~/lib/.server/mcp/load-config.server', () => ({
  loadUserMcpConfig: vi.fn(async () => ({ mcpConfig: { mcpServers: {} }, maxLLMSteps: 1 })),
}));
vi.mock('~/lib/services/mcpService', () => ({
  filterEnabledMcpServers: (config: unknown) => config,
  MCPService: class {
    configuredServerCount = 0;
    toolsWithoutExecute = {};
    close = boundary.close;
    processToolInvocations = boundary.toolReplay;
  },
}));

vi.mock('~/lib/.server/llm/create-agent-plan', () => ({ createAgentPlan: vi.fn() }));
vi.mock('~/lib/.server/llm/create-summary', () => ({ createSummary: vi.fn() }));
vi.mock('~/lib/.server/llm/select-context', () => ({ getFilePaths: () => ['src/App.tsx'], selectContext: vi.fn() }));

const permit = () =>
  buildExplicitRunPermit({
    runId: 'fixture-message',
    projectId: 'synthetic-project',
    planKey: 'enterprise',
    card: BUILTIN_AGENT_ROUTING_CARD,
  });
const generated =
  '<boltArtifact id="fixture" title="Fixture"><boltAction type="file" filePath="src/App.tsx">export default () => null;</boltAction></boltArtifact>';

beforeEach(() => {
  vi.clearAllMocks();
  boundary.streamStartup.mockReset();
  boundary.quota.mockResolvedValue({ ok: true });
  boundary.close.mockResolvedValue(undefined);
  boundary.toolReplay.mockImplementation(async (messages) => messages);
  boundary.usage.mockResolvedValue(undefined);
  boundary.api.mockImplementation(async (_request, path) =>
    path.endsWith('/agent/explicit-run') ? permit() : { connections: [] },
  );
  boundary.fetch.mockImplementation(() => {
    throw new Error('No external network in contract fixtures');
  });
  vi.stubGlobal('fetch', boundary.fetch);
  boundary.streamText.mockImplementation(async (input) => ({
    mergeIntoDataStream(writer: { merge: (source: ReadableStream<string>) => void }) {
      writer.merge(
        new ReadableStream<string>({
          async start(controller) {
            controller.enqueue(formatDataStreamPart('text', generated));
            await input.options.onFinish({
              text: generated,
              finishReason: 'length',
              usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            });
            controller.enqueue(
              formatDataStreamPart('finish_message', {
                finishReason: 'length',
                usage: { promptTokens: 10, completionTokens: 10 },
              }),
            );
            controller.close();
          },
        }),
      );
    },
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function invoke(overrides: Record<string, unknown> = {}) {
  const response = await action({
    request: new Request('http://synthetic.local/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-language': 'fr' },
      body: JSON.stringify({
        messages: [{ id: 'fixture-message', role: 'user', content: 'Create a small app' }],
        files: { 'src/App.tsx': { type: 'file', content: 'old content' } },
        projectId: 'synthetic-project',
        chatMode: 'build',
        contextOptimization: true,
        maxLLMSteps: 50,
        agentPower: { buildTier: 'lite' },
        explicitModelChoice: { modele: 'gpt-5.6-luna' },
        explicitRunId: 'fixture-message',
        ...overrides,
      }),
    }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0]);
  return { response, body: await response.text() };
}

test('explicit run reserves before generation, shares permit across bounded continuations and omits every paid auxiliary', async () => {
  const { response, body } = await invoke();
  expect(response.status).toBe(200);
  expect(body).toContain('src/App.tsx');
  expect(boundary.streamText).toHaveBeenCalledTimes(permit().maxCalls);

  const inputs = boundary.streamText.mock.calls.map(([input]) => input);
  expect(inputs.every((input) => input.explicitRun === inputs[0].explicitRun)).toBe(true);
  expect(inputs[0].forcedRoute).toEqual({ provider: 'OpenAI', model: 'gpt-5.6-luna' });
  expect(inputs[0].options.tools).toEqual({});
  expect(inputs[0].options.maxSteps).toBe(1);
  expect(inputs[0].agentOrchestrationPlan.enabled).toBe(false);
  expect(boundary.api.mock.invocationCallOrder[0]).toBeLessThan(boundary.streamText.mock.invocationCallOrder[0]);

  for (const dependency of [
    createAgentPlan,
    createSummary,
    selectContext,
    retrieveMemoryForAgentContext,
    persistAgentMemoryCandidate,
    loadUserMcpConfig,
    prepareWebReferenceForChat,
    boundary.toolReplay,
    boundary.fetch,
  ]) {
    expect(dependency).not.toHaveBeenCalled();
  }
});

test.each([
  { projectId: undefined },
  { explicitRunId: undefined },
  { planFirstEnabled: true },
  { planApproved: true },
  { agentPower: { buildTier: 'lite', extendedThinking: true } },
])('rejects incompatible request before provider or auxiliary calls: %j', async (overrides) => {
  const { response, body } = await invoke(overrides);
  expect(response.status).toBe(400);
  expect(JSON.parse(body)).toMatchObject({ code: 'EXPLICIT_RUN_REFUSED', isRetryable: false });
  expect(boundary.streamText).not.toHaveBeenCalled();
  expect(boundary.fetch).not.toHaveBeenCalled();
  expect(loadUserMcpConfig).not.toHaveBeenCalled();
});

test('API budget/auth refusal is fail closed and private', async () => {
  boundary.api.mockRejectedValue(new Response('private backend detail', { status: 403 }));

  const { response, body } = await invoke();
  expect(response.status).toBe(403);
  expect(body).not.toContain('private backend detail');
  expect(boundary.streamText).not.toHaveBeenCalled();
});

test('Auto retains its existing helper path and carries no strict permit', async () => {
  // Stop after one output; ordinary continuation behaviour is covered separately.
  boundary.streamText.mockImplementation(async (input) => ({
    mergeIntoDataStream(writer: { merge: (source: ReadableStream<string>) => void }) {
      writer.merge(
        new ReadableStream<string>({
          async start(controller) {
            await input.options.onFinish({
              text: generated,
              finishReason: 'stop',
              usage: { promptTokens: 1, completionTokens: 1 },
            });
            controller.close();
          },
        }),
      );
    },
  }));

  const { response } = await invoke({ explicitModelChoice: undefined, contextOptimization: false });
  expect(response.status).toBe(200);
  expect(boundary.streamText.mock.calls[0][0].explicitRun).toBeUndefined();
  expect(loadUserMcpConfig).toHaveBeenCalledOnce();
  expect(retrieveMemoryForAgentContext).toHaveBeenCalledOnce();
  expect(prepareWebReferenceForChat).toHaveBeenCalledOnce();
});
