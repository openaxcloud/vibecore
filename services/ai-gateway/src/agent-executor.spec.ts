import { describe, expect, it, vi } from 'vitest';
import {
  authorizeAgentRun,
  createAgentRunRateLimiter,
  createRedisAgentRunRateLimiter,
  executeAgentRun,
  parseAgentRunRequest,
  positiveIntegerOrDefault,
  type AgentRunRole,
  type RedisRateLimitClient,
} from './agent-executor.js';
import type { AiGateway } from './gateway.js';

const architect: AgentRunRole = {
  id: 'architect',
  title: 'Architect',
  responsibility: 'Plan architecture.',
  output: 'Architecture notes.',
};

const frontend: AgentRunRole = {
  id: 'frontend',
  title: 'Frontend',
  responsibility: 'Build UI.',
  output: 'Frontend code notes.',
};

describe('agent executor', () => {
  it('authorizes agent runs only when the bearer token matches the configured token', () => {
    // No configured token fails CLOSED by default; only an explicit allowInsecure opts dev/test back open.
    expect(authorizeAgentRun({ expectedToken: undefined })).toBe(false);
    expect(authorizeAgentRun({ expectedToken: undefined, allowInsecure: true })).toBe(true);
    expect(authorizeAgentRun({ expectedToken: 'secret', authorizationHeader: 'Bearer secret' })).toBe(true);
    expect(authorizeAgentRun({ expectedToken: 'secret', authorizationHeader: 'Bearer wrong' })).toBe(false);
    expect(authorizeAgentRun({ expectedToken: 'secret' })).toBe(false);
    // allowInsecure must NOT override a configured token.
    expect(authorizeAgentRun({ expectedToken: 'secret', allowInsecure: true })).toBe(false);
  });

  it('validates agent run requests', () => {
    const request = parseAgentRunRequest({
      mode: 'parallel-subagents',
      roles: [architect],
      messages: [{ role: 'user', content: 'Build a dashboard app.' }],
      plan: 'pro',
      provider: 'openai',
      model: 'gpt-4.1',
      maxTokens: 900,
    });

    expect(request.roles).toEqual([architect]);
    expect(request.messages).toEqual([{ role: 'user', content: 'Build a dashboard app.' }]);
    expect(request.plan).toBe('pro');
    expect(request.maxTokens).toBe(900);
  });

  it('rejects invalid requests before execution', () => {
    expect(() => parseAgentRunRequest({ mode: 'single-model-lanes', roles: [], messages: [] })).toThrow(
      'mode must be parallel-subagents.',
    );
    expect(() => parseAgentRunRequest({ mode: 'parallel-subagents', roles: [], messages: [] })).toThrow(
      'roles must include at least one supported agent role.',
    );
    expect(() =>
      parseAgentRunRequest({
        mode: 'parallel-subagents',
        roles: [architect, architect],
        messages: [{ role: 'user', content: 'Build a dashboard app.' }],
      }),
    ).toThrow('roles must not contain duplicate role ids.');
    expect(() =>
      parseAgentRunRequest({
        mode: 'parallel-subagents',
        roles: [architect],
        messages: Array.from({ length: 31 }, () => ({ role: 'user', content: 'Build a dashboard app.' })),
      }),
    ).toThrow('messages cannot include more than 30 entries.');
    expect(() =>
      parseAgentRunRequest({
        mode: 'parallel-subagents',
        roles: [architect],
        messages: [{ role: 'user', content: 'x'.repeat(200_001) }],
      }),
    ).toThrow('messages cannot exceed 200000 characters.');
  });

  it('normalizes numeric limits and caps requested max tokens', () => {
    expect(positiveIntegerOrDefault(Number.NaN, 30)).toBe(30);
    expect(positiveIntegerOrDefault(0, 30)).toBe(1);
    expect(positiveIntegerOrDefault(2.8, 30)).toBe(2);

    const request = parseAgentRunRequest({
      mode: 'parallel-subagents',
      roles: [architect],
      messages: [{ role: 'user', content: 'Build a dashboard app.' }],
      maxTokens: 20_000,
    });

    expect(request.maxTokens).toBe(4000);
  });

  it('rate limits agent runs per key and resets after the window', () => {
    let now = 1_000;
    const limiter = createAgentRunRateLimiter({ limit: 2, windowMs: 10_000, now: () => now });

    expect(limiter.check('org_1')).toMatchObject({ allowed: true, remaining: 1, resetAt: 11_000 });
    expect(limiter.check('org_1')).toMatchObject({ allowed: true, remaining: 0, resetAt: 11_000 });
    expect(limiter.check('org_1')).toMatchObject({ allowed: false, remaining: 0, resetAt: 11_000 });
    expect(limiter.check('org_2')).toMatchObject({ allowed: true, remaining: 1 });

    now = 11_000;

    expect(limiter.check('org_1')).toMatchObject({ allowed: true, remaining: 1, resetAt: 21_000 });
  });

  it('rate limits agent runs atomically through Redis when configured', async () => {
    let now = 50_000;
    const buckets = new Map<string, { count: number; expiresAt: number }>();
    const redis: RedisRateLimitClient = {
      eval: vi.fn(async (_script, _numberOfKeys, key, _limit, windowMs): Promise<[number, number]> => {
        const window = Number(windowMs);
        const bucket = buckets.get(key);

        if (!bucket || now >= bucket.expiresAt) {
          buckets.set(key, { count: 1, expiresAt: now + window });
          return [1, window];
        }

        bucket.count += 1;
        return [bucket.count, bucket.expiresAt - now];
      }),
    };
    const limiter = createRedisAgentRunRateLimiter({
      redis,
      limit: 2,
      windowMs: 10_000,
      now: () => now,
      prefix: 'test',
    });

    expect(limiter.backend).toBe('redis');
    await expect(limiter.check('org_1')).resolves.toMatchObject({ allowed: true, remaining: 1, resetAt: 60_000 });
    await expect(limiter.check('org_1')).resolves.toMatchObject({ allowed: true, remaining: 0, resetAt: 60_000 });
    await expect(limiter.check('org_1')).resolves.toMatchObject({ allowed: false, remaining: 0, resetAt: 60_000 });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.stringMatching(/^test:agent-runs:/),
      '2',
      '10000',
    );

    now = 60_000;

    await expect(limiter.check('org_1')).resolves.toMatchObject({ allowed: true, remaining: 1, resetAt: 70_000 });
  });

  it('executes roles through the AI gateway and normalizes strict JSON output', async () => {
    const complete = vi.fn(async (request) => {
      const roleId = request.messages[0].content.includes('Architect') ? 'architect' : 'frontend';
      return {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        content: JSON.stringify({
          summary: `${roleId} complete`,
          files: [`${roleId}.md`],
          risks: ['none'],
          verification: ['unit tested'],
        }),
        usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 0 },
      };
    });
    const gateway = { complete } as unknown as AiGateway;

    const result = await executeAgentRun({
      gateway,
      request: {
        mode: 'parallel-subagents',
        roles: [architect, frontend],
        messages: [{ role: 'user', content: 'Build a SaaS app.' }],
      },
    });

    expect(result.runId).toEqual(expect.any(String));
    expect(result.status).toBe('complete');
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      roleId: 'architect',
      status: 'complete',
      summary: 'architect complete',
      files: ['architect.md'],
    });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('returns a partial run when one role fails', async () => {
    const complete = vi.fn(async (request) => {
      if (request.messages[0].content.includes('Frontend')) {
        throw new Error('provider unavailable');
      }

      return {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        content: '{"summary":"architecture complete"}',
        usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: 0 },
      };
    });

    const result = await executeAgentRun({
      gateway: { complete } as unknown as AiGateway,
      request: {
        mode: 'parallel-subagents',
        roles: [architect, frontend],
        messages: [{ role: 'user', content: 'Build a SaaS app.' }],
      },
    });

    expect(result.status).toBe('partial');
    expect(result.results.find((item) => item.roleId === 'frontend')).toMatchObject({
      status: 'failed',
      summary: 'provider unavailable',
    });
  });
});
