import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkChatQuota, recordChatUsage } from './ai-usage';

const originalSaasApiUrl = process.env.SAAS_API_URL;

describe('ai usage API authentication', () => {
  beforeEach(() => {
    process.env.SAAS_API_URL = 'https://api.test';
  });

  afterEach(() => {
    process.env.SAAS_API_URL = originalSaasApiUrl;
    vi.unstubAllGlobals();
  });

  it('converts the web vc_session cookie into an API bearer token for quota checks', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ai: { inputTokens: { remaining: 10 }, messages: { remaining: 2 } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await checkChatQuota({
      projectId: 'project_1',
      estimatedInputTokens: 123,
      cookieHeader: 'theme=dark; vc_session=session-token; other=value',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/projects/project_1/ai/check-quota',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
  });

  it('converts the web vc_session cookie into an API bearer token for usage records', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await recordChatUsage({
      projectId: 'project_1',
      provider: 'Anthropic',
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 10,
      outputTokens: 20,
      cookieHeader: 'vc_session=session-token',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/projects/project_1/ai/record-usage',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
        }),
      }),
    );
  });
});
