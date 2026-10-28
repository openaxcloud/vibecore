import { BUILTIN_AGENT_ROUTING_CARD } from '@vibecore/billing/src/agent-routing';
import { buildExplicitRunPermit } from '@vibecore/billing/src/explicit-run';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createExplicitRunExecution, createExplicitRunFetch, createExplicitRunModel } from './bounded-explicit-run';

const endpoint = 'https://api.openai.com/v1/chat/completions';

const permit = () =>
  buildExplicitRunPermit({
    runId: 'fixture-run',
    projectId: 'fixture-project',
    planKey: 'free',
    card: BUILTIN_AGENT_ROUTING_CARD,
  });
const body = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ model: 'gpt-5.6-luna', messages: [{ role: 'user', content: 'Hello fixture' }], ...extra });

const request = (extra: Record<string, unknown> = {}) => ({ method: 'POST', body: body(extra) });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('bounded explicit wire', () => {
  it('refuses the ninth network call even with an eight-call permit', async () => {
    const approved = buildExplicitRunPermit({
      runId: 'fixture-eight',
      projectId: 'fixture',
      planKey: 'free',
      card: { ...BUILTIN_AGENT_ROUTING_CARD, baseUserInCentsPerM: 1, baseUserOutCentsPerM: 1 },
    });
    expect(approved.maxCalls).toBe(8);

    const execution = createExplicitRunExecution(approved);
    const network = vi.fn<typeof fetch>(async () => new Response('{}'));
    const wire = createExplicitRunFetch(execution, network);
    await Promise.all(Array.from({ length: 8 }, () => wire(endpoint, request())));
    await expect(wire(endpoint, request())).rejects.toThrow('call limit');
    expect(network).toHaveBeenCalledTimes(8);
  });

  it('refuses unknown prices or insufficient reservation', () => {
    const approved = permit();
    expect(() =>
      createExplicitRunExecution({
        ...approved,
        pricing: { ...approved.pricing, providerInputCentsPerMillion: 1 },
      } as never),
    ).toThrow();
    expect(() => createExplicitRunExecution({ ...approved, reservedBudgetMicros: 1 })).toThrow();
  });

  it('does not open a transport without a managed credential', () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    expect(() => createExplicitRunModel(createExplicitRunExecution(permit()), {})).toThrow('credential unavailable');
    expect(network).not.toHaveBeenCalled();
  });

  it('enforces the reserved call count across fetch wrappers and refuses the next before network', async () => {
    const execution = createExplicitRunExecution(permit());
    const network = vi.fn<typeof fetch>(async () => new Response('{}'));
    const first = createExplicitRunFetch(execution, network);
    const continuation = createExplicitRunFetch(execution, network);

    for (let i = 0; i < execution.permit.maxCalls; i++) {
      await (i % 2 ? first : continuation)(endpoint, request());
    }
    await expect(first(endpoint, request())).rejects.toMatchObject({ code: 'EXPLICIT_RUN_LIMIT', isRetryable: false });
    expect(network).toHaveBeenCalledTimes(execution.permit.maxCalls);
    expect(execution.calls).toBe(execution.permit.maxCalls);
  });

  it('counts uncertain upstream failures without refund', async () => {
    const execution = createExplicitRunExecution(permit());

    const network = vi.fn<typeof fetch>(async () => {
      throw new Error('fixture timeout');
    });
    await expect(createExplicitRunFetch(execution, network)(endpoint, request())).rejects.toThrow('fixture timeout');
    expect(execution.calls).toBe(1);
  });

  it.each([
    { messages: [{ role: 'user', content: 'x'.repeat(64000) }] },
    { messages: [{ role: 'user', content: '🙂'.repeat(17000) }] },
    {
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.invalid/image' } }] },
      ],
    },
    { messages: [{ role: 'tool', content: 'tool result' }] },
    { tools: [] },
    { model: 'other-model' },
    { service_tier: 'priority' },
    { n: 2 },
    { audio: {} },
  ])('refuses unsupported/oversized payload before spending %#', async (extra) => {
    const execution = createExplicitRunExecution(permit());
    const network = vi.fn();
    await expect(createExplicitRunFetch(execution, network)(endpoint, request(extra))).rejects.toThrow();
    expect(network).not.toHaveBeenCalled();
    expect(execution.calls).toBe(0);
  });

  it('canonicalizes output tokens and standard tier at the final wire boundary', async () => {
    const execution = createExplicitRunExecution(permit());
    const network = vi.fn<typeof fetch>(async () => new Response('{}'));
    await createExplicitRunFetch(execution, network)(
      endpoint,
      request({ max_tokens: 999999, max_completion_tokens: 999999, temperature: 1 }),
    );

    const final = JSON.parse(network.mock.calls[0][1]!.body as string);
    expect(final).toMatchObject({
      model: 'gpt-5.6-luna',
      service_tier: 'default',
      max_completion_tokens: 8192,
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(final).not.toHaveProperty('max_tokens');
    expect(final).not.toHaveProperty('temperature');
    expect(network.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('rejects other endpoints and forged execution objects', async () => {
    const execution = createExplicitRunExecution(permit());
    const network = vi.fn();
    await expect(
      createExplicitRunFetch(execution, network)('https://example.invalid/v1/chat/completions', request()),
    ).rejects.toThrow();
    expect(() => createExplicitRunFetch({ ...execution }, network)).toThrow();
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    { model: 'other' },
    { serviceTier: 'priority' },
    { maxCalls: 9 },
    { maxCalls: 0 },
    { maxOutputTokens: 9000 },
    { maxBillableInputTokens: 64000 },
  ])('rejects unsupported permits %#', (extra) => {
    expect(() => createExplicitRunExecution({ ...permit(), ...extra } as never)).toThrow();
  });

  it('uses the managed credential and fixed endpoint through the real SDK with an isolated transport', async () => {
    const network = vi.fn<typeof fetch>(
      async () => new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }),
    );
    vi.stubGlobal('fetch', network);

    const execution = createExplicitRunExecution(permit());

    const model = createExplicitRunModel(execution, {
      OPENAI_API_KEY: 'fixture-managed-key',
      OPENAI_BASE_URL: 'https://example.invalid',
    });
    const response = await model.doStream({
      inputFormat: 'messages',
      mode: { type: 'regular' },
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello fixture' }] }],
    });

    const reader = response.stream.getReader();

    while (!(await reader.read()).done) {
      /* drain fixture */
    }
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toBe(endpoint);
    expect(new Headers(network.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer fixture-managed-key');
    expect(JSON.parse(network.mock.calls[0][1]!.body as string)).toMatchObject({
      service_tier: 'default',
      max_completion_tokens: 8192,
    });
  });
});
