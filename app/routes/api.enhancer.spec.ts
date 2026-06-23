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
  const mod = await import('./api.enhancer');
  return mod.action;
}

/**
 * The enhancer route returns `result.textStream` as the Response body and
 * iterates `result.fullStream` to surface streaming errors, so a usable mock
 * must provide both. Empty async iterables keep the route's non-blocking
 * stream-drain loop from hanging.
 */
function makeStreamTextResult() {
  async function* empty() {
    /* no chunks */
  }

  return {
    textStream: new ReadableStream<string>({
      start(controller) {
        controller.close();
      },
    }),
    fullStream: (empty as any)(),
  };
}

function makeRequest(init: { method?: string; body?: string; cookie?: string } = {}): Request {
  return new Request('https://test.local/api/enhancer', {
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

function validBody() {
  return JSON.stringify({ message: 'make a todo app', model: 'gpt-4o', provider: { name: 'OpenAI' } });
}

describe('POST /api/enhancer', () => {
  beforeEach(() => {
    streamTextMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards request.signal as abortSignal so a client disconnect cancels the upstream provider', async () => {
    streamTextMock.mockResolvedValueOnce(makeStreamTextResult());

    const action = await loadAction();
    const request = makeRequest({ body: validBody() });

    const response = await action(actionArgs(request));

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(1);

    const call = streamTextMock.mock.calls[0][0];

    /*
     * The abort signal must be the *same* signal the client connection carries.
     * Without it, closing the tab mid-enhance only aborts the HTTP read while
     * the LLM provider keeps generating and billing tokens server-side.
     */
    expect(call.abortSignal).toBe(request.signal);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });
});
