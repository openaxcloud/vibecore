import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './enterprise-api.server';

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest File History conflicts', () => {
  it('preserves latestVersionId in the same-origin error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'The file changed',
              code: 'FILE_HISTORY_CONFLICT',
              latestVersionId: 'version-latest',
            }),
            { status: 409, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const error = await apiRequest(
      new Request('https://app.test/api/projects/p/file-history/v/restore'),
      '/projects/p/file-history/v/restore',
      { method: 'POST', body: '{}', redirectOn401: false },
    ).then(
      () => undefined,
      (caught) => caught,
    );

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(409);
    await expect((error as Response).json()).resolves.toMatchObject({
      code: 'FILE_HISTORY_CONFLICT',
      latestVersionId: 'version-latest',
    });
  });
});
