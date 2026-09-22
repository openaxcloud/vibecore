import type { LoaderFunctionArgs } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toResponse } from '~/lib/test/rr7-data';

/*
 * AUDX-004 — the route that used to leak the session token.
 *
 * It was literally:
 *
 *     const token = readSessionToken(request);
 *     return json({ token });
 *
 * i.e. it read the httpOnly session cookie and returned its value to
 * JavaScript, defeating httpOnly outright.
 *
 * ⚠️ This spec exists because the route had NO test at all: reverting it to the
 * leaking version passed the entire 1114-test suite. A fix nothing pins is a fix
 * that comes back.
 *
 * The upstream API call is mocked so this tests the ROUTE's contract — what
 * reaches the browser — rather than the API service, which is covered by
 * services/api/src/tests/runtime-ticket-auth.spec.ts.
 */
const SESSION_TOKEN = 'super-secret-session-token';

vi.mock('~/lib/enterprise-api.server', async () => {
  const actual = await vi.importActual<typeof import('~/lib/enterprise-api.server')>('~/lib/enterprise-api.server');

  return {
    ...actual,
    readSessionToken: () => SESSION_TOKEN,
    apiRequest: vi.fn(async () => ({ ticket: 'vcrt_minted-ticket', expiresInMs: 120_000 })),
  };
});

const { loader } = await import('./api.runtime-token');

function loaderArgs(url: string): LoaderFunctionArgs {
  return { context: {}, params: {}, request: new Request(url) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AUDX-004 /api/runtime-token', () => {
  it('never returns the session token to the browser', async () => {
    const response = toResponse(await loader(loaderArgs('http://app.e-code.ai/api/runtime-token?projectId=project-1')));

    const body = await response.text();

    /*
     * The decisive assertion: whatever shape the payload takes, the session
     * token must not appear anywhere in it.
     */
    expect(body).not.toContain(SESSION_TOKEN);
    expect(body).toContain('vcrt_minted-ticket');
  });

  /*
   * Fail closed. Without a project there is nothing to scope a ticket to, and
   * falling back to an unscoped credential is exactly the removed defect.
   */
  it('refuses to mint an unscoped ticket when no project is given', async () => {
    const response = toResponse(await loader(loaderArgs('http://app.e-code.ai/api/runtime-token')));

    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(SESSION_TOKEN);
  });

  it('forwards the requested project to the API', async () => {
    const { apiRequest } = await import('~/lib/enterprise-api.server');

    await loader(loaderArgs('http://app.e-code.ai/api/runtime-token?projectId=project-42'));

    expect(apiRequest).toHaveBeenCalledWith(
      expect.anything(),
      '/auth/runtime-ticket',
      expect.objectContaining({ body: JSON.stringify({ projectId: 'project-42' }) }),
    );
  });
});
