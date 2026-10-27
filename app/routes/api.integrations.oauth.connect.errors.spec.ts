/** @vitest-environment node */
import { afterEach, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('~/lib/enterprise-api.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/enterprise-api.server')>()),
  apiRequest,
}));
import { action } from './api.integrations.oauth.$provider.connect';

afterEach(() => vi.restoreAllMocks());

it('retains the missing provider configuration diagnosis without returning upstream details', async () => {
  apiRequest.mockRejectedValueOnce(
    new Response(
      JSON.stringify({
        code: 'PROVIDER_NOT_CONFIGURED',
        error: 'private configuration details',
      }),
      { status: 503 },
    ),
  );

  const response = await action({
    request: new Request('https://e-code.ai/api/integrations/oauth/github/connect?lang=fr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'synthetic' }),
    }),
    params: { provider: 'github' },
    context: {},
  } as never);
  expect(response.status).toBe(503);

  const payload = await response.json();
  expect(payload).toMatchObject({ code: 'OAUTH_PROVIDER_NOT_CONFIGURED' });
  expect(JSON.stringify(payload)).not.toContain('private configuration details');
});

it.each([
  [503, '{}'],
  [503, 'null'],
  [503, '<html>unavailable</html>'],
  [403, '{"code":"PROVIDER_NOT_CONFIGURED"}'],
])('does not infer missing credentials from unrelated HTTP %s errors', async (status, body) => {
  apiRequest.mockRejectedValueOnce(new Response(body, { status }));

  const response = await action({
    request: new Request('https://e-code.ai/api/integrations/oauth/github/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
    params: { provider: 'github' },
    context: {},
  } as never);
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ code: 'OAUTH_START_FAILED' });
});
