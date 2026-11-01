import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { action } from './api.chat';

const boundary = vi.hoisted(() => ({
  streamText: vi.fn(),
  streamStartup: vi.fn(),
  quota: vi.fn(),
  close: vi.fn(),
  usage: vi.fn(),
  api: vi.fn(),
  fetch: vi.fn(),
  routeEnabled: false,
  planner: vi.fn(),
  summary: vi.fn(),
  context: vi.fn(),
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
  isAgentModeRoutingDisabled: () => !boundary.routeEnabled,
  resolveAgentRoute: vi.fn(async () => ({
    ok: true,
    route: {
      routingVersion: 1,
      mode: 'lite',
      plan: 'enterprise',
      base: { lineKey: 'lite', provider: 'anthropic', model: 'synthetic-card-model', multiplier: 0.5 },
    },
  })),
}));
vi.mock('~/lib/.server/llm/agent-orchestration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/.server/llm/agent-orchestration')>()),
  shouldUseAgentOrchestration: () => boundary.routeEnabled,
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
vi.mock('~/lib/.server/llm/create-agent-plan', () => ({ createAgentPlan: boundary.planner }));
vi.mock('~/lib/.server/llm/create-summary', () => ({ createSummary: boundary.summary }));
vi.mock('~/lib/.server/llm/select-context', () => ({
  selectContext: boundary.context,
  getFilePaths: () => ['src/App.tsx'],
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
    async processToolInvocations(messages: unknown) {
      return messages;
    }
  },
}));

import { getProviderHealth, resetProviderHealth } from '~/lib/.server/llm/provider-fallback';
import { createProviderHealthScope } from '~/lib/.server/llm/provider-health-scope';
import { PROVIDER_LIST } from '~/utils/constants';

vi.mock('~/lib/modules/llm/runtime-env', () => ({ readRuntimeEnv: () => undefined }));

beforeEach(() => {
  vi.clearAllMocks();
  resetProviderHealth();
  boundary.routeEnabled = false;
  boundary.planner.mockResolvedValue(null);
  boundary.summary.mockResolvedValue('synthetic summary');
  boundary.context.mockResolvedValue({});
  boundary.streamText.mockReset();
  boundary.quota.mockResolvedValue({ ok: true });
  boundary.close.mockResolvedValue(undefined);
  boundary.usage.mockResolvedValue(undefined);
  boundary.api.mockResolvedValue({ connections: [] });
  boundary.fetch.mockImplementation(() => {
    throw new Error('External network forbidden in scope route test');
  });
  vi.stubGlobal('fetch', boundary.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetProviderHealth();
});

async function invoke(prompt: string, files: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  const messages = [{ id: 'synthetic-user-message', role: 'user', content: prompt }];

  const response = await action({
    request: new Request('http://synthetic.local/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-language': 'fr' },
      body: JSON.stringify({
        messages,
        files,
        projectId: 'synthetic-project',
        chatMode: 'build',
        contextOptimization: false,
        maxLLMSteps: 1,
        agentPower: { buildTier: 'lite' },
        ...overrides,
      }),
    }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0]);
  expect(response.status).toBe(200);

  const stream = await response.text();
  expect(boundary.fetch).not.toHaveBeenCalled();

  return { stream, messages };
}

function scopes() {
  const provider = PROVIDER_LIST.find((candidate) => candidate.name === 'Anthropic')!;
  return {
    a: createProviderHealthScope({ provider, apiKeys: { Anthropic: 'synthetic-A' }, serverEnv: {} }),
    b: createProviderHealthScope({ provider, apiKeys: { Anthropic: 'synthetic-B' }, serverEnv: {} }),
    managed: createProviderHealthScope({ provider, serverEnv: { ANTHROPIC_API_KEY: 'synthetic-managed' } }),
  };
}

test('route stream 401 marks only the private BYOK scope that actually ran', async () => {
  const { a, b, managed } = scopes();
  boundary.streamText.mockImplementation(async (input) => {
    input.onProviderHealthScope(a);
    input.onModelDecision('synthetic-model', 'Anthropic');
    throw Object.assign(new Error('synthetic unauthorized'), { statusCode: 401 });
  });

  const { stream } = await invoke('Explain this project without changing files');
  expect(boundary.streamText).toHaveBeenCalledTimes(1);
  expect(getProviderHealth(a)?.kind).toBe('auth');
  expect(getProviderHealth(b)).toBeUndefined();
  expect(getProviderHealth(managed)).toBeUndefined();
  expect(stream).not.toContain(a.id);
  expect(stream).not.toContain('synthetic-A');
});

test('clearing invocation scope prevents a later 401 from poisoning the old provider scope', async () => {
  const { a, b, managed } = scopes();
  boundary.streamText.mockImplementation(async (input) => {
    input.onProviderHealthScope(a);
    input.onModelDecision('synthetic-model', 'Anthropic');
    input.onProviderHealthScope(undefined);
    throw Object.assign(new Error('synthetic auxiliary unauthorized'), { statusCode: 401 });
  });
  await invoke('Explain this project without changing files');
  expect(boundary.streamText).toHaveBeenCalledTimes(1);
  expect(getProviderHealth(a)).toBeUndefined();
  expect(getProviderHealth(b)).toBeUndefined();
  expect(getProviderHealth(managed)).toBeUndefined();
});

test('route card primary reaches planner, summary and context helpers without an auxiliary fallback', async () => {
  boundary.routeEnabled = true;
  boundary.streamText.mockRejectedValue(new Error('synthetic end after observing helper arguments'));
  await invoke(
    'Build synthetic project',
    { 'src/App.tsx': { type: 'file', content: 'export default 1;' } },
    {
      contextOptimization: true,
      messages: Array.from({ length: 24 }, (_, index) => ({
        id: `synthetic-history-${index}`,
        role: index % 2 ? 'assistant' : 'user',
        content: `Synthetic history ${index}`,
      })),
    },
  );

  for (const helper of [boundary.planner, boundary.summary, boundary.context]) {
    expect(helper).toHaveBeenCalledTimes(1);
    expect(helper.mock.calls[0][0].routing).toEqual({
      primary: { provider: 'Anthropic', model: 'synthetic-card-model' },
      fallback: null,
    });
  }
  expect(boundary.streamText).toHaveBeenCalledTimes(1);
});
