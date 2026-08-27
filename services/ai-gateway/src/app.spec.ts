import { describe, expect, it, vi } from 'vitest';
import type { AgentRunRateLimiter } from './agent-executor.js';
import { buildAiGatewayApp } from './app.js';
import type { AiGateway } from './gateway.js';

const validPayload = {
  mode: 'parallel-subagents',
  organizationId: 'org_1',
  roles: [
    {
      id: 'architect',
      title: 'Architect',
      responsibility: 'Plan architecture.',
      output: 'Architecture notes.',
    },
  ],
  messages: [{ role: 'user', content: 'Build a dashboard app.' }],
};

function fakeGateway() {
  return {
    health: async () => [],
    models: () => [],
    async *stream() {},
    complete: async () => ({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      content: '{"summary":"agent complete","files":["architecture.md"],"verification":["unit tested"]}',
      usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 0 },
    }),
  } as unknown as AiGateway;
}

describe('AI gateway app', () => {
  it('serves health checks', async () => {
    const app = await buildAiGatewayApp({ gateway: fakeGateway(), logger: false, env: {}, agentRunPersistence: null });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'ai-gateway' });

    await app.close();
  });

  it('requires the configured bearer token for agent runs', async () => {
    const app = await buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_TOKEN: 'secret' },
      agentRunPersistence: null,
    });

    const response = await app.inject({ method: 'POST', url: '/v1/agent-runs', payload: validPayload });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'AGENT_RUN_UNAUTHORIZED' });

    await app.close();
  });

  it('rejects /chat/completions without the shared secret when enforcement is on', async () => {
    const app = await buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { AI_GATEWAY_REQUIRE_AUTH: 'true', AI_GATEWAY_SHARED_SECRET: 's3cret' },
      agentRunPersistence: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/chat/completions',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'AI_GATEWAY_UNAUTHORIZED' });

    await app.close();
  });

  it('allows /chat/completions with the correct shared secret when enforcement is on', async () => {
    const app = await buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { AI_GATEWAY_REQUIRE_AUTH: 'true', AI_GATEWAY_SHARED_SECRET: 's3cret' },
      agentRunPersistence: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/chat/completions',
      headers: { authorization: 'Bearer s3cret' },
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    });

    expect(response.statusCode).not.toBe(401);

    await app.close();
  });

  it('leaves /chat/completions open when enforcement is off (default)', async () => {
    const app = await buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: {},
      agentRunPersistence: null,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/chat/completions',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    });

    expect(response.statusCode).not.toBe(401);

    await app.close();
  });

  it('executes valid agent runs and returns rate-limit headers', async () => {
    const app = await buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_TOKEN: 'secret', ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE: '5' },
      agentRunPersistence: null,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent-runs',
      headers: { authorization: 'Bearer secret' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBe('5');
    expect(response.headers['x-ratelimit-remaining']).toBe('4');
    expect(response.headers['x-ratelimit-backend']).toBe('memory');
    expect(response.json()).toMatchObject({
      status: 'complete',
      results: [{ roleId: 'architect', status: 'complete', summary: 'agent complete' }],
    });

    await app.close();
  });

  it('streams valid agent runs as SSE with rate-limit headers', async () => {
    const stream = vi.fn(async function* () {
      yield {
        type: 'delta' as const,
        content: '{"summary":"streamed architect complete"}',
        provider: 'openai' as const,
        model: 'gpt-4.1-mini',
      };
      yield {
        type: 'done' as const,
        provider: 'openai' as const,
        model: 'gpt-4.1-mini',
        usage: { inputTokens: 17, outputTokens: 9, estimatedCostCents: 1 },
      };
    });
    const app = await buildAiGatewayApp({
      gateway: { ...fakeGateway(), stream } as unknown as AiGateway,
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_TOKEN: 'secret', ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE: '7' },
      agentRunPersistence: null,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent-runs/stream',
      headers: { authorization: 'Bearer secret' },
      payload: validPayload,
    });

    const events = response.payload
      .trim()
      .split('\n\n')
      .map((line) => JSON.parse(line.replace(/^data: /, '')));

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['x-ratelimit-limit']).toBe('7');
    expect(response.headers['x-ratelimit-remaining']).toBe('6');
    expect(response.headers['x-ratelimit-backend']).toBe('memory');
    expect(events.map((event) => event.type)).toEqual(['lane-start', 'lane-delta', 'lane-done', 'run-done']);
    expect(events.at(-1)).toMatchObject({
      type: 'run-done',
      status: 'complete',
      results: [{ roleId: 'architect', summary: 'streamed architect complete' }],
      usage: {
        laneCount: 1,
        inputTokens: 17,
        outputTokens: 9,
        totalTokens: 26,
        calls: [expect.objectContaining({ provider: 'openai', model: 'gpt-4.1-mini', estimated: false })],
      },
    });

    await app.close();
  });

  it('rate limits agent runs by organization id', async () => {
    const app = await buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE: '1', NODE_ENV: 'test' },
      agentRunPersistence: null,
    });

    const first = await app.inject({ method: 'POST', url: '/v1/agent-runs', payload: validPayload });
    const second = await app.inject({ method: 'POST', url: '/v1/agent-runs', payload: validPayload });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ code: 'AGENT_RUN_RATE_LIMITED' });

    await app.close();
  });

  it('uses an injected distributed rate limiter for agent-run routes', async () => {
    const limiter: AgentRunRateLimiter = {
      backend: 'redis',
      check: async () => ({ allowed: true, remaining: 8, resetAt: Date.now() + 60_000 }),
    };
    const app = await buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE: '9', NODE_ENV: 'test' },
      agentRunRateLimiter: limiter,
      agentRunPersistence: null,
    });

    const response = await app.inject({ method: 'POST', url: '/v1/agent-runs', payload: validPayload });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBe('9');
    expect(response.headers['x-ratelimit-remaining']).toBe('8');
    expect(response.headers['x-ratelimit-backend']).toBe('redis');

    await app.close();
  });

  it('rejects invalid agent-run payloads before provider execution', async () => {
    const app = await buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { NODE_ENV: 'test' },
      agentRunPersistence: null,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent-runs',
      payload: { mode: 'parallel-subagents', roles: [], messages: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'AGENT_RUN_BAD_REQUEST' });

    await app.close();
  });
});
