import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkChatQuota, recordChatUsage } from './ai-usage';

const originalSaasApiUrl = process.env.SAAS_API_URL;
const originalInternalSecret = process.env.INTERNAL_API_SHARED_SECRET;

describe('ai usage API authentication', () => {
  beforeEach(() => {
    process.env.SAAS_API_URL = 'https://api.test';
    process.env.INTERNAL_API_SHARED_SECRET = 'canonical-ai-test-secret-2026-08-27';
  });

  afterEach(() => {
    process.env.SAAS_API_URL = originalSaasApiUrl;

    if (originalInternalSecret === undefined) {
      delete process.env.INTERNAL_API_SHARED_SECRET;
    } else {
      process.env.INTERNAL_API_SHARED_SECRET = originalInternalSecret;
    }

    vi.unstubAllGlobals();
  });

  it('converts the web vc_session cookie into an API bearer token for quota checks', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ai: { inputTokens: { remaining: 10 }, messages: { remaining: 2 } },
          entitlements: { version: '2026-08-27.1', plan: 'core', parallelAgents: 2 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
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

  it('fails closed when the entitlement lookup is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await expect(
      checkChatQuota({
        projectId: 'project_1',
        estimatedInputTokens: 123,
        bearerToken: 'session-token',
      }),
    ).resolves.toMatchObject({
      ok: false,
      statusCode: 503,
      code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE',
    });
  });

  it('fails closed when a 200 response omits or overstates the signed contract shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entitlements: { version: 'corrupt', plan: 'enterprise', parallelAgents: 50 },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    for (let index = 0; index < 2; index += 1) {
      await expect(
        checkChatQuota({
          projectId: 'project_1',
          estimatedInputTokens: 123,
          bearerToken: 'session-token',
        }),
      ).resolves.toMatchObject({ ok: false, code: 'PLAN_ENTITLEMENT_CHECK_UNAVAILABLE' });
    }
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
      requestId: 'request_12345678',
      executionToken: '00000000-0000-4000-8000-000000000001',
      userSpendReservationId: 'reservation_1',
      calls: [
        {
          callId: 'main',
          kind: 'main',
          provider: 'Anthropic',
          model: 'claude-haiku-4-5-20251001',
          inputTokens: 10,
          outputTokens: 20,
        },
      ],
      cookieHeader: 'vc_session=session-token',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/projects/project_1/ai/record-usage',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
          'x-vibecore-internal-secret': 'canonical-ai-test-secret-2026-08-27',
        }),
      }),
    );
  });

  it('fails closed before transport when the SSR service proof is unavailable', async () => {
    delete process.env.INTERNAL_API_SHARED_SECRET;

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      recordChatUsage({
        projectId: 'project_1',
        requestId: 'request_12345678',
        executionToken: '00000000-0000-4000-8000-000000000001',
        userSpendReservationId: 'reservation_1',
        calls: [
          {
            callId: 'main',
            kind: 'main',
            provider: 'Anthropic',
            model: 'claude-haiku-4-5-20251001',
            inputTokens: 10,
            outputTokens: 20,
          },
        ],
        bearerToken: 'session-token',
      }),
    ).rejects.toMatchObject({ code: 'CANONICAL_AI_INTERNAL_AUTH_REQUIRED', statusCode: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
