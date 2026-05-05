import { describe, expect, it } from 'vitest';
import { buildAiGatewayApp } from './app.js';
import type { AgentRunRateLimiter } from './agent-executor.js';
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
    stream: async function* () {},
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
    const app = buildAiGatewayApp({ gateway: fakeGateway(), logger: false, env: {} });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'ai-gateway' });

    await app.close();
  });

  it('requires the configured bearer token for agent runs', async () => {
    const app = buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_TOKEN: 'secret' },
    });
    const response = await app.inject({ method: 'POST', url: '/v1/agent-runs', payload: validPayload });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'AGENT_RUN_UNAUTHORIZED' });

    await app.close();
  });

  it('executes valid agent runs and returns rate-limit headers', async () => {
    const app = buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_TOKEN: 'secret', ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE: '5' },
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

  it('rate limits agent runs by organization id', async () => {
    const app = buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE: '1' },
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
    const app = buildAiGatewayApp({
      gateway: fakeGateway(),
      logger: false,
      env: { ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE: '9' },
      agentRunRateLimiter: limiter,
    });
    const response = await app.inject({ method: 'POST', url: '/v1/agent-runs', payload: validPayload });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBe('9');
    expect(response.headers['x-ratelimit-remaining']).toBe('8');
    expect(response.headers['x-ratelimit-backend']).toBe('redis');

    await app.close();
  });

  it('rejects invalid agent-run payloads before provider execution', async () => {
    const app = buildAiGatewayApp({ gateway: fakeGateway(), logger: false, env: {} });
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
