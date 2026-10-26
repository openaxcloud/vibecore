import { formatDataStreamPart } from 'ai';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { action } from './api.chat';
import { consignePremierProjet } from '~/lib/common/prompts/premier-projet';

const boundary = vi.hoisted(() => ({
  streamText: vi.fn(),
  quota: vi.fn(),
  close: vi.fn(),
  usage: vi.fn(),
  api: vi.fn(),
  fetch: vi.fn(),
}));
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
    async processToolInvocations(messages: unknown) {
      return messages;
    }
  },
}));

const frenchPrompt =
  'Créez un portfolio soigné avec études de cas, articles de blog et formulaires de contact dédié à l’ia';
const englishPrompt =
  'Create an AI portfolio with searchable case studies, editable blog articles and working contact forms';
const generatedFixture =
  '<boltArtifact id="synthetic-model-output" title="Synthetic model boundary"><boltAction type="file" filePath="src/RequestedPortfolio.tsx">export const source = "synthetic model fixture";</boltAction></boltArtifact>';

beforeEach(() => {
  vi.clearAllMocks();
  boundary.quota.mockResolvedValue({ ok: true });
  boundary.close.mockResolvedValue(undefined);
  boundary.usage.mockResolvedValue(undefined);
  boundary.api.mockResolvedValue({ connections: [] });
  boundary.fetch.mockImplementation(() => {
    throw new Error('External network forbidden in this route test');
  });
  vi.stubGlobal('fetch', boundary.fetch);
  boundary.streamText.mockImplementation(async (input) => ({
    mergeIntoDataStream(writer: { merge: (source: ReadableStream<string>) => void }) {
      writer.merge(
        new ReadableStream<string>({
          async start(controller) {
            controller.enqueue(formatDataStreamPart('text', generatedFixture));
            await input.options.onFinish({
              text: generatedFixture,
              finishReason: 'stop',
              usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            });
            controller.enqueue(
              formatDataStreamPart('finish_message', {
                finishReason: 'stop',
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

async function invoke(prompt: string, files: Record<string, unknown> = {}) {
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

const wrappedFrenchPrompt = consignePremierProjet(frenchPrompt, {
  label: 'Website',
  framework: 'React + Vite + TypeScript',
  generationHint:
    'Build this as a React/Vite web application with TypeScript, sized to the idea, with a live preview that starts with npm run dev.',
});

for (const [language, prompt] of [
  ['FR', frenchPrompt],
  ['EN', englishPrompt],
  ['FR wrapped', wrappedFrenchPrompt],
]) {
  test(`${language}: fresh portfolio intent reaches generation intact instead of a static unrelated site`, async () => {
    const { stream, messages } = await invoke(prompt);

    /*
     * On the old route these discriminating assertions expose the actual bad
     * response, rather than merely checking whether a helper is mentioned.
     */
    expect(stream, `model calls=${boundary.streamText.mock.calls.length}`).not.toContain(
      'Have a product worth sharpening?',
    );
    expect(boundary.streamText).toHaveBeenCalledTimes(1);
    expect(boundary.streamText.mock.calls[0][0]).toMatchObject({ messages, files: {}, chatMode: 'build' });
    expect(stream).toContain('synthetic-model-output');
    expect(stream).not.toContain('cached-portfolio-site');
    expect(boundary.quota).toHaveBeenCalledTimes(1);
    expect(boundary.close).toHaveBeenCalled();
  });
}

test('existing workspace and user request reach generation without rewriting files to a starter template', async () => {
  const files = Object.fromEntries(
    ['App.tsx', 'billing.ts', 'api.ts', 'Chart.tsx', 'Header.tsx', 'Table.tsx', 'settings.tsx', 'dashboard.tsx'].map(
      (name) => [`/home/project/src/${name}`, { type: 'file', content: `// existing ${name}` }],
    ),
  );

  const original = JSON.stringify(files);
  const { stream, messages } = await invoke(frenchPrompt, files);
  expect(boundary.streamText).toHaveBeenCalledTimes(1);
  expect(boundary.streamText.mock.calls[0][0]).toMatchObject({ messages, files });
  expect(JSON.stringify(files)).toBe(original);
  expect(stream).toContain('synthetic-model-output');
  expect(stream).not.toContain('cached-portfolio-site');
});

test('quota refusal still blocks both generation and any portfolio artifact', async () => {
  boundary.quota.mockResolvedValue({
    ok: false,
    statusCode: 429,
    code: 'QUOTA_EXCEEDED',
    message: 'Synthetic quota refusal',
  });

  const { stream } = await invoke(frenchPrompt);
  expect(boundary.quota).toHaveBeenCalledTimes(1);
  expect(boundary.streamText).not.toHaveBeenCalled();
  expect(stream).toContain('QUOTA_EXCEEDED');
  expect(stream).not.toContain('cached-portfolio-site');
  expect(stream).not.toContain('synthetic-model-output');
  expect(boundary.close).toHaveBeenCalled();
});
