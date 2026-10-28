import { BUILTIN_AGENT_ROUTING_CARD } from '@vibecore/billing/src/agent-routing';
import { buildExplicitRunPermit } from '@vibecore/billing/src/explicit-run';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createExplicitRunExecution } from './bounded-explicit-run';
import { streamText } from './stream-text';
import { LLMManager } from '~/lib/modules/llm/manager';

const boundary = vi.hoisted(() => ({ probe: vi.fn(), fallback: vi.fn(), credentials: vi.fn(), dynamic: vi.fn() }));
vi.mock('./managed-provider-keys', () => ({
  applyManagedProviderKeys: async () => ({ OPENAI_API_KEY: 'fixture-db-managed' }),
}));
vi.mock('./provider-credentials', async (original) => ({
  ...(await original<object>()),
  resolveUsableProvider: boundary.credentials,
}));
vi.mock('./provider-fallback', () => ({
  ensureProviderProbed: boundary.probe,
  resolveRuntimeProvider: boundary.fallback,
}));

const permit = () =>
  buildExplicitRunPermit({
    runId: 'fixture-run',
    projectId: 'fixture-project',
    planKey: 'free',
    card: BUILTIN_AGENT_ROUTING_CARD,
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('explicit stream wiring', () => {
  it('accepts the real Build prompt and a shared-budget continuation for a small isolated app', async () => {
    const generated =
      '<boltArtifact id="fixture" title="Recipe"><boltAction type="file" filePath="index.html"><h1>Recipe</h1></boltAction></boltArtifact>';

    const network = vi.fn<typeof fetch>(async () => {
      const chunk = (delta: Record<string, unknown>, finishReason: string | null) => ({
        id: 'fixture',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-5.6-luna',
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      });
      return new Response(
        'data: ' +
          JSON.stringify(chunk({ content: generated }, null)) +
          '\n\n' +
          'data: ' +
          JSON.stringify({ ...chunk({}, 'stop'), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) +
          '\n\n' +
          'data: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    });
    vi.stubGlobal('fetch', network);

    const execution = createExplicitRunExecution(permit());

    const prompt =
      'Build a tiny static recipe page with a title, ingredient list and three cooking steps. No database, integrations or external images.';

    const initial = await streamText({
      explicitRun: execution,
      chatMode: 'build',
      files: {},
      messages: [{ role: 'user', content: prompt }],
    });
    await initial.consumeStream();
    expect(await initial.text).toBe(generated);

    const continuation = await streamText({
      explicitRun: execution,
      chatMode: 'build',
      files: {},
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: generated },
        { role: 'user', content: 'Continue the remaining recipe instructions without repeating completed files.' },
      ],
    });
    await continuation.consumeStream();
    expect(await continuation.text).toBe(generated);
    expect(network).toHaveBeenCalledTimes(2);
    expect(execution.calls).toBe(2);

    for (const [, options] of network.mock.calls) {
      const wire = JSON.parse(options!.body as string);
      expect(wire.messages[0].content.length).toBeGreaterThan(1000);
      expect(
        new TextEncoder().encode(options!.body as string).length + 1024 * (wire.messages.length + 1),
      ).toBeLessThanOrEqual(64000);
      expect(wire).toMatchObject({ model: 'gpt-5.6-luna', max_completion_tokens: 8192, service_tier: 'default' });
    }
  });

  it('uses only the authorized model and managed key despite client overrides; never probes or falls back', async () => {
    const network = vi.fn<typeof fetch>(
      async () =>
        new Response(
          'data: {"id":"fixture","object":"chat.completion.chunk","created":0,"model":"gpt-5.6-luna","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\ndata: {"id":"fixture","object":"chat.completion.chunk","created":0,"model":"gpt-5.6-luna","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    vi.stubGlobal('fetch', network);

    const chosen = vi.fn();
    const dynamic = vi.spyOn(LLMManager.getInstance(), 'getModelListFromProvider');
    const execution = createExplicitRunExecution(permit());

    const result = await streamText({
      explicitRun: execution,
      messages: [{ role: 'user', content: '[Model: other-model]\n\n[Provider: Anthropic]\n\nSay hello.' }],
      chatMode: 'discuss',
      forcedRoute: { model: 'other-model', provider: 'Anthropic' },
      apiKeys: { OpenAI: 'fixture-user-key' },
      providerSettings: { OpenAI: { baseUrl: 'https://example.invalid' } } as never,
      onModelDecision: chosen,
      options: {
        maxRetries: 7,
        maxSteps: 9,
        maxTokens: 99999,
        tools: { fixture: { description: 'not executable' } },
      } as never,
    });
    await result.consumeStream();
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(new Headers(network.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer fixture-db-managed');

    const payload = JSON.parse(network.mock.calls[0][1]!.body as string);
    expect(payload).toMatchObject({ model: 'gpt-5.6-luna', max_completion_tokens: 8192, service_tier: 'default' });
    expect(payload).not.toHaveProperty('tools');
    expect(payload).not.toHaveProperty('max_tokens');
    expect(chosen).toHaveBeenCalledWith('gpt-5.6-luna', 'OpenAI');
    expect(boundary.probe).not.toHaveBeenCalled();
    expect(boundary.fallback).not.toHaveBeenCalled();
    expect(boundary.credentials).not.toHaveBeenCalled();
    expect(dynamic).not.toHaveBeenCalled();
    dynamic.mockRestore();
  });

  it('does not retry a retryable upstream error even when caller requests retries', async () => {
    const network = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: { message: 'fixture rate limit', type: 'rate_limit_error' } }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', network);

    const execution = createExplicitRunExecution(permit());

    const result = await streamText({
      explicitRun: execution,
      messages: [{ role: 'user', content: 'Hello' }],
      chatMode: 'discuss',
      options: { maxRetries: 7 },
    });
    await result.consumeStream();
    expect(network).toHaveBeenCalledTimes(1);
    expect(execution.calls).toBe(1);
  });
});
