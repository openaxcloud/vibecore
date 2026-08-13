import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AiGateway,
  anthropicPayload,
  countTokens,
  ensureGptTokenizer,
  extractProviderErrorMessage,
  isProviderAccountLimit,
  maxCompletionTokensForModel,
  modelCatalog,
  modelDisallowsTemperature,
  openAiPromptCacheKey,
  providerConfigs,
} from './gateway.js';

describe('anthropicPayload shared-context caching', () => {
  it('sets cache_control on the last SHARED message when the prefix clears the min', () => {
    const bigShared = 'C'.repeat(8000); // ~2000 tok, clears the 1024 sonnet min

    const req = {
      messages: [
        { role: 'system' as const, content: 'preamble' },
        { role: 'user' as const, content: bigShared },
        { role: 'assistant' as const, content: 'ack' },
        { role: 'user' as const, content: 'act as the architect lane' }, // per-lane tail
      ],
    };

    const payload = anthropicPayload(req, 'claude-3-5-sonnet-latest', false) as any;

    // System block is cached (1h)...
    expect(payload.system[0].cache_control.ttl).toBe('1h');

    // ...and the last SHARED message (index len-2 = the assistant 'ack') carries a breakpoint.
    const boundary = payload.messages[payload.messages.length - 2];
    expect(Array.isArray(boundary.content)).toBe(true);
    expect(boundary.content[0].cache_control).toEqual({ type: 'ephemeral' });

    // The per-lane tail stays a plain string (not cached — it differs per lane).
    expect(typeof payload.messages[payload.messages.length - 1].content).toBe('string');
  });

  it('does not add a shared-message breakpoint below the min (short prefix)', () => {
    const req = {
      messages: [
        { role: 'system' as const, content: 'preamble' },
        { role: 'user' as const, content: 'small shared' },
        { role: 'user' as const, content: 'per-lane tail' },
      ],
    };

    const payload = anthropicPayload(req, 'claude-3-5-sonnet-latest', false) as any;

    // messages[len-2] stays a plain string (no wasted breakpoint on a tiny prefix).
    expect(typeof payload.messages[payload.messages.length - 2].content).toBe('string');
  });
});

describe('openAiPromptCacheKey', () => {
  it('is stable for the same system prefix across lanes and org-scoped', () => {
    const sys = { role: 'system' as const, content: 'S'.repeat(2000) };
    const laneA = { organizationId: 'org1', messages: [sys, { role: 'user' as const, content: 'lane A' }] };
    const laneB = { organizationId: 'org1', messages: [sys, { role: 'user' as const, content: 'lane B' }] };
    const otherOrg = { organizationId: 'org2', messages: [sys, { role: 'user' as const, content: 'lane A' }] };

    // Same system + org, different per-lane tail → identical cache key (all lanes hit one node).
    expect(openAiPromptCacheKey(laneA)).toBe(openAiPromptCacheKey(laneB));

    // Different org → different key (no cross-org cache sharing).
    expect(openAiPromptCacheKey(laneA)).not.toBe(openAiPromptCacheKey(otherOrg));
    expect(openAiPromptCacheKey(laneA)).toMatch(/^ecode-org1-/);
  });

  it('changes when the shared prefix (system or shared context) changes', () => {
    const tail = { role: 'user' as const, content: 'per-lane role' };
    const a = { messages: [{ role: 'system' as const, content: 'alpha' }, tail] };
    const b = { messages: [{ role: 'system' as const, content: 'beta' }, tail] };
    expect(openAiPromptCacheKey(a)).not.toBe(openAiPromptCacheKey(b));

    // Shared context (a user message before the per-lane tail) is part of the key too.
    const c = {
      messages: [{ role: 'system' as const, content: 'x' }, { role: 'user' as const, content: 'ctx-A' }, tail],
    };
    const d = {
      messages: [{ role: 'system' as const, content: 'x' }, { role: 'user' as const, content: 'ctx-B' }, tail],
    };
    expect(openAiPromptCacheKey(c)).not.toBe(openAiPromptCacheKey(d));
  });
});

/*
 * The verbatim body Anthropic's API returns when the account's own monthly
 * usage/spend limit (configured in the Anthropic Console) is exceeded. The
 * reset date is always the first of the next month at 00:00 UTC.
 */
const ANTHROPIC_ACCOUNT_LIMIT_BODY = JSON.stringify({
  type: 'error',
  error: {
    type: 'rate_limit_error',
    message: 'You have reached your specified API usage limits. You will regain access on 2026-08-01 at 00:00 UTC.',
  },
});

async function startProvider(responder: (body: string, response: import('node:http').ServerResponse) => void) {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
    });
    request.on('end', () => responder(body, response));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Provider test server did not start');
  }

  return { server, url: `http://127.0.0.1:${address.port}/v1` };
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.AI_FALLBACK_PROVIDERS;
});

describe('AiGateway', () => {
  it('counts tokens with the BPE tokenizer before falling back to character estimates', async () => {
    await ensureGptTokenizer();

    expect(countTokens('hello world')).toBe(2);
    expect(countTokens('antidisestablishmentarianism')).toBe(6);
    expect(countTokens([{ role: 'user', content: 'hello world' }])).toBe(2);
  });

  it('hard-blocks a plan-forbidden model by default, but planFallback swaps in a plan-allowed model', () => {
    process.env.OPENAI_API_KEY = 'k';

    const gateway = new AiGateway();

    // Default (main chat): a premium model on Free is rejected.
    expect(() =>
      gateway.route({ plan: 'free', provider: 'anthropic', model: 'claude-3-5-sonnet-latest', messages: [] }),
    ).toThrow('Model is not available on this plan');

    // planFallback (agent lanes): transparently resolves to a Free-allowed model — no throw.
    const routed = gateway.route({
      plan: 'free',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      planFallback: true,
      messages: [],
    });
    expect(routed.model.plans).toContain('free');
    expect(routed.model.id).toBe('gpt-4.1-mini');
  });

  it('runs the EXACT chosen frontier model (no silent downgrade) once it is in the synced catalog', () => {
    process.env.ANTHROPIC_API_KEY = 'k';

    const gateway = new AiGateway();

    // Enterprise user picks a current frontier model — the lane must use THAT model.
    const routed = gateway.route({
      plan: 'enterprise',
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      planFallback: true,
      messages: [],
    });
    expect(routed.model.id).toBe('claude-opus-4-8');
    expect(routed.providers[0].id).toBe('anthropic');
  });

  it('GUARD-RAIL: an UNKNOWN model fails loud (AI_MODEL_UNKNOWN), never a silent downgrade', () => {
    process.env.OPENAI_API_KEY = 'k';

    const gateway = new AiGateway();

    let caught: any;

    try {
      gateway.route({
        plan: 'enterprise',
        provider: 'anthropic',
        model: 'claude-does-not-exist-9',
        planFallback: true,
        messages: [],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught?.code).toBe('AI_MODEL_UNKNOWN');
    expect(caught?.statusCode).toBe(400);
  });

  it('routes by plan and falls back to the next configured provider', async () => {
    const failing = await startProvider((_body, response) => {
      response.writeHead(503).end('down');
    });
    const working = await startProvider((body, response) => {
      expect(JSON.parse(body).messages[1].content).toContain('change');
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ choices: [{ message: { content: 'patched' } }] }));
    });
    servers.push(failing.server, working.server);
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENROUTER_API_KEY = 'openrouter-key';
    process.env.OPENAI_BASE_URL = failing.url;
    process.env.OPENROUTER_BASE_URL = working.url;
    process.env.AI_FALLBACK_PROVIDERS = 'openrouter';

    const gateway = new AiGateway();

    const result = await gateway.complete({
      plan: 'business',
      provider: 'openai',
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: 'system policy' },
        { role: 'user', content: 'change the file' },
      ],
    });

    expect(result.provider).toBe('openrouter');
    expect(result.content).toBe('patched');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.estimatedCostCents).toBeGreaterThanOrEqual(0);
  });

  it('streams deltas from OpenAI-compatible providers', async () => {
    const provider = await startProvider((_body, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"content":"hel"}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n');
      response.end('data: [DONE]\n\n');
    });
    servers.push(provider.server);
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_BASE_URL = provider.url;

    const gateway = new AiGateway();
    const chunks = [];

    for await (const chunk of gateway.stream({
      plan: 'pro',
      provider: 'openai',
      model: 'gpt-4.1',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(chunk);
    }

    expect(
      chunks
        .filter((chunk) => chunk.type === 'delta')
        .map((chunk) => chunk.content)
        .join(''),
    ).toBe('hello');
    expect(chunks.at(-1)?.type).toBe('done');
  });

  it('does not inject temperature into OpenAI-compatible requests', async () => {
    const provider = await startProvider((body, response) => {
      const payload = JSON.parse(body);
      expect(payload.model).toBe('gpt-4.1');
      expect(payload).not.toHaveProperty('temperature');
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ choices: [{ message: { content: 'temperature omitted' } }] }));
    });
    servers.push(provider.server);
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_BASE_URL = provider.url;

    const gateway = new AiGateway();

    const result = await gateway.complete({
      plan: 'pro',
      provider: 'openai',
      model: 'gpt-4.1',
      temperature: 0,
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.content).toBe('temperature omitted');
  });

  it('sets the OpenAI `user` field to the org for cache-affinity when an org is bound', async () => {
    const provider = await startProvider((body, response) => {
      const payload = JSON.parse(body);
      expect(payload.user).toBe('org-cache-1');
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    servers.push(provider.server);
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_BASE_URL = provider.url;

    const gateway = new AiGateway();
    await gateway.complete({
      plan: 'pro',
      provider: 'openai',
      model: 'gpt-4.1',
      organizationId: 'org-cache-1',
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('omits the `user` field entirely when no org is bound (byte-identical to today)', async () => {
    const provider = await startProvider((body, response) => {
      const payload = JSON.parse(body);
      expect(payload).not.toHaveProperty('user');
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
    });
    servers.push(provider.server);
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_BASE_URL = provider.url;

    const gateway = new AiGateway();
    await gateway.complete({
      plan: 'pro',
      provider: 'openai',
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('does not send deprecated temperature to Claude Opus 4.7', async () => {
    const provider = await startProvider((body, response) => {
      const payload = JSON.parse(body);
      expect(payload.model).toBe('claude-opus-4-7');
      expect(payload).not.toHaveProperty('temperature');
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          content: [{ type: 'text', text: 'temperature omitted' }],
        }),
      );
    });
    servers.push(provider.server);
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.ANTHROPIC_BASE_URL = provider.url.replace(/\/v1$/, '');

    const gateway = new AiGateway();

    const result = await gateway.complete({
      plan: 'enterprise',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      temperature: 0,
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(modelDisallowsTemperature('claude-opus-4-7')).toBe(true);
    expect(result.content).toBe('temperature omitted');
  });

  it('omits temperature for all gateway models by default', () => {
    expect(modelDisallowsTemperature('claude-3-5-sonnet-latest')).toBe(true);
    expect(modelDisallowsTemperature('claude-3-7-sonnet-latest')).toBe(true);
    expect(modelDisallowsTemperature('claude-sonnet-4-6')).toBe(true);
    expect(modelDisallowsTemperature('claude-sonnet-4-5-20250929')).toBe(true);
    expect(modelDisallowsTemperature('claude-haiku-4-5-20251001')).toBe(true);
    expect(modelDisallowsTemperature('gpt-4.1')).toBe(true);
    expect(modelDisallowsTemperature('gemini-2.0-flash')).toBe(true);
  });

  /*
   * Regression guard for the "specified API usage limits" incident: a provider
   * ACCOUNT usage-cap 429 (Anthropic Console monthly spend limit) is a real
   * provider response, not an internal E-Code quota gate. The gateway must (a)
   * classify it distinctly, (b) surface the provider's REAL message instead of
   * a bare "Provider stream failed: 429", and — the key requirement — (c) NOT
   * block an account that has no such cap: a healthy provider streams normally.
   */
  it('classifies an Anthropic account usage-limit body but not a transient rate limit', () => {
    expect(isProviderAccountLimit(429, ANTHROPIC_ACCOUNT_LIMIT_BODY)).toBe(true);

    // A per-minute rate limit clears on its own — it is NOT an account cap.
    expect(
      isProviderAccountLimit(429, JSON.stringify({ error: { message: 'Rate limit exceeded, retry soon.' } })),
    ).toBe(false);

    // A non-429 (or empty body) is never an account cap.
    expect(isProviderAccountLimit(500, ANTHROPIC_ACCOUNT_LIMIT_BODY)).toBe(false);
    expect(isProviderAccountLimit(429, '')).toBe(false);
  });

  it('extracts the human-readable provider message from JSON and raw bodies', () => {
    expect(extractProviderErrorMessage(ANTHROPIC_ACCOUNT_LIMIT_BODY)).toContain('specified API usage limits');
    expect(extractProviderErrorMessage('gateway timeout')).toBe('gateway timeout');
    expect(extractProviderErrorMessage('')).toBeUndefined();
    expect(extractProviderErrorMessage(undefined)).toBeUndefined();
  });

  it('surfaces the real Anthropic account-limit message on the stream error part (not a bare 429)', async () => {
    const provider = await startProvider((_body, response) => {
      response.writeHead(429, { 'content-type': 'application/json' }).end(ANTHROPIC_ACCOUNT_LIMIT_BODY);
    });
    servers.push(provider.server);
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.ANTHROPIC_BASE_URL = provider.url.replace(/\/v1$/, '');

    const gateway = new AiGateway();
    const chunks = [];

    for await (const chunk of gateway.stream({
      plan: 'enterprise',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      stream: true,
      messages: [{ role: 'user', content: 'build me an app' }],
    })) {
      chunks.push(chunk);
    }

    const errorChunk = chunks.find((chunk) => chunk.type === 'error');
    expect(errorChunk).toBeDefined();

    // The real provider reason is preserved, not swallowed into "Provider stream failed: 429".
    expect(errorChunk?.error).toContain('specified API usage limits');
    expect(chunks.some((chunk) => chunk.type === 'delta')).toBe(false);
  });

  it('lets an account with no real usage cap generate — a healthy Anthropic key streams unblocked', async () => {
    const provider = await startProvider((_body, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hel"}}\n\n');
      response.write('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n');
      response.end('data: [DONE]\n\n');
    });
    servers.push(provider.server);
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.ANTHROPIC_BASE_URL = provider.url.replace(/\/v1$/, '');

    const gateway = new AiGateway();
    const chunks = [];

    for await (const chunk of gateway.stream({
      plan: 'enterprise',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      stream: true,
      messages: [{ role: 'user', content: 'build me an app' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
    expect(
      chunks
        .filter((chunk) => chunk.type === 'delta')
        .map((chunk) => chunk.content)
        .join(''),
    ).toBe('hello');
    expect(chunks.at(-1)?.type).toBe('done');
  });

  /*
   * Regression guard: `max_tokens` must be clamped to the SELECTED model's real
   * completion ceiling. gpt-4-turbo caps at 4096; sending the requested 8192
   * makes the provider hard-reject the whole request ("max_tokens is too large:
   * 8192. This model supports at most 4096 completion tokens") → zero files.
   */
  it('resolves each model to its real completion ceiling', () => {
    // OpenAI GPT-4 Turbo + preview snapshots really cap at 4096.
    expect(maxCompletionTokensForModel('gpt-4-turbo')).toBe(4096);
    expect(maxCompletionTokensForModel('gpt-4-turbo-2024-04-09')).toBe(4096);
    expect(maxCompletionTokensForModel('gpt-4-1106-preview')).toBe(4096);
    expect(maxCompletionTokensForModel('gpt-3.5-turbo')).toBe(4096);

    // Standard gpt-4 / gpt-4o keep their higher ceilings.
    expect(maxCompletionTokensForModel('gpt-4-0613')).toBe(8192);
    expect(maxCompletionTokensForModel('gpt-4o')).toBe(16384);

    // Catalog-declared values win (Claude 3.5 Sonnet = 8192).
    expect(maxCompletionTokensForModel('claude-3-5-sonnet-latest')).toBe(8192);

    // Anthropic (not just OpenAI): 3.5/3.7 → 8192, 3.x/2.x → 4096.
    expect(maxCompletionTokensForModel('claude-3-7-sonnet-20250219')).toBe(8192);
    expect(maxCompletionTokensForModel('claude-3-opus-20240229')).toBe(4096);
    expect(maxCompletionTokensForModel('claude-3-haiku-20240307')).toBe(4096);

    // Google Gemini: 1.x / 2.0 → 8192.
    expect(maxCompletionTokensForModel('gemini-1.5-flash')).toBe(8192);
    expect(maxCompletionTokensForModel('gemini-2.0-flash')).toBe(8192);

    // Newer premium families keep the hard cap (not over-clamped).
    expect(maxCompletionTokensForModel('claude-sonnet-4-5')).toBe(32768);

    // Gemini 2.5 Pro is now a catalog entry declaring 65536; catalog value wins.
    expect(maxCompletionTokensForModel('gemini-2.5-pro')).toBe(65536);

    // A 2.5 id NOT in the catalog still falls through past the legacy 1.x/2.0 branch to the hard cap.
    expect(maxCompletionTokensForModel('gemini-2.5-flash-lite')).toBe(32768);

    // Unknown ids keep the global hard cap — never over-clamp a large-output model.
    expect(maxCompletionTokensForModel('some-unknown-model')).toBe(32768);
    expect(maxCompletionTokensForModel(undefined)).toBe(32768);
  });

  it('uses a GA/stable Gemini default model (no removed gemini-1.5 alias)', () => {
    const gemini = providerConfigs().find((config) => config.id === 'google-gemini');
    expect(gemini).toBeDefined();

    // gemini-1.5-* aliases were removed by Google and 404 under v1beta generateContent.
    expect(gemini!.defaultModel).not.toMatch(/gemini-1\.5/);
    expect(gemini!.defaultModel).toBe('gemini-2.5-flash');
  });

  it('exposes GA Gemini catalog entries and no bare gemini-1.5 ids', () => {
    const geminiModels = modelCatalog.filter((model) => model.provider === 'google-gemini');
    expect(geminiModels.length).toBeGreaterThan(0);
    expect(geminiModels.some((model) => /^gemini-1\.5/.test(model.id))).toBe(false);

    // The canonical GA set is present.
    const ids = geminiModels.map((model) => model.id);
    expect(ids).toContain('gemini-2.5-pro');
    expect(ids).toContain('gemini-2.5-flash');
    expect(ids).toContain('gemini-3.5-flash');
  });

  it('clamps the outgoing max_tokens to the model ceiling even when a larger value is requested', async () => {
    let sentMaxTokens = -1;

    const provider = await startProvider((body, response) => {
      sentMaxTokens = JSON.parse(body).max_tokens;
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          content: [{ type: 'text', text: 'ok' }],
        }),
      );
    });
    servers.push(provider.server);
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.ANTHROPIC_BASE_URL = provider.url.replace(/\/v1$/, '');

    const gateway = new AiGateway();
    await gateway.complete({
      plan: 'enterprise',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',

      // Ask for far more than Claude 3.5 Sonnet's 8192 completion ceiling.
      maxTokens: 32000,
      messages: [{ role: 'user', content: 'build me an app' }],
    });

    // The provider must receive at most the model's real ceiling, not 32000.
    expect(sentMaxTokens).toBe(8192);
    expect(sentMaxTokens).toBeLessThanOrEqual(8192);
  });
});
