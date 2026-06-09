/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const streamTextMock = vi.fn();

vi.mock('~/lib/.server/llm/stream-text', () => ({
  streamText: streamTextMock,
}));

vi.mock('~/lib/.server/require-session', () => ({
  requireWebSession: vi.fn(),
}));

async function loadAction() {
  const mod = await import('./api.agent.self-repair');
  return mod.action;
}

function makeRequest(init: { method?: string; body?: string; cookie?: string } = {}): Request {
  return new Request('https://test.local/api/agent/self-repair', {
    method: init.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.body,
  });
}

function actionArgs(request: Request) {
  return { request, context: { cloudflare: { env: {} } }, params: {} } as any;
}

describe('POST /api/agent/self-repair', () => {
  beforeEach(() => {
    streamTextMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 405 for non-POST methods', async () => {
    const action = await loadAction();
    const response = await action(actionArgs(makeRequest({ method: 'GET' })));

    expect(response.status).toBe(405);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Method not allowed') });
  });

  it('returns 400 when the body is not valid JSON', async () => {
    const action = await loadAction();
    const response = await action(actionArgs(makeRequest({ body: 'not-json' })));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Invalid JSON body' });
  });

  it('returns 400 when prompt is missing or empty', async () => {
    const action = await loadAction();

    const missing = await action(actionArgs(makeRequest({ body: JSON.stringify({}) })));
    expect(missing.status).toBe(400);

    const empty = await action(actionArgs(makeRequest({ body: JSON.stringify({ prompt: '' }) })));
    expect(empty.status).toBe(400);
  });

  it('returns 413 when prompt exceeds the size budget', async () => {
    const action = await loadAction();
    const huge = 'x'.repeat(64_001);
    const response = await action(actionArgs(makeRequest({ body: JSON.stringify({ prompt: huge }) })));

    expect(response.status).toBe(413);
  });

  it('forwards the prompt to streamText and returns the resolved content', async () => {
    streamTextMock.mockResolvedValueOnce({ text: Promise.resolve('corrected file body') });

    const action = await loadAction();

    const response = await action(
      actionArgs(
        makeRequest({
          body: JSON.stringify({ prompt: 'fix this hunk' }),
          cookie:
            'apiKeys=' +
            encodeURIComponent(JSON.stringify({ Anthropic: 'sk-test' })) +
            '; providers=' +
            encodeURIComponent(JSON.stringify({ Anthropic: { enabled: true } })),
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: 'corrected file body' });

    expect(streamTextMock).toHaveBeenCalledTimes(1);

    const call = streamTextMock.mock.calls[0][0];
    expect(call.messages).toEqual([{ id: 'self-repair', role: 'user', content: 'fix this hunk' }]);
    expect(call.apiKeys).toEqual({ Anthropic: 'sk-test' });
    expect(call.providerSettings).toEqual({ Anthropic: { enabled: true } });
    expect(call.promptId).toBe('self-repair');
  });

  it('returns 502 when the LLM call rejects', async () => {
    streamTextMock.mockRejectedValueOnce(new Error('provider quota exhausted'));

    const action = await loadAction();
    const response = await action(actionArgs(makeRequest({ body: JSON.stringify({ prompt: 'fix this hunk' }) })));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'provider quota exhausted' });
  });

  it('returns 400 when the apiKeys cookie is malformed JSON', async () => {
    const action = await loadAction();

    const response = await action(
      actionArgs(
        makeRequest({
          body: JSON.stringify({ prompt: 'fix' }),
          cookie: 'apiKeys=' + encodeURIComponent('not-json'),
        }),
      ),
    );

    expect(response.status).toBe(400);
  });
});
