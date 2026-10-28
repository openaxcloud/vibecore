import { beforeEach, expect, it, vi } from 'vitest';
import { action, loader } from './api.projects.$projectId.agent.explicit-run';
import { apiRequest } from '~/lib/enterprise-api.server';

vi.mock('~/lib/enterprise-api.server', () => ({ apiRequest: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

const invoke = () =>
  loader({
    request: new Request('https://fixture.test/api/projects/p/agent/explicit-run'),
    params: { projectId: 'p/one' },
    context: {},
  } as Parameters<typeof loader>[0]);

it.each([true, false])('forwards authorization to the read-only API and exposes only bounded=%s', async (bounded) => {
  vi.mocked(apiRequest).mockResolvedValue({ bounded, privateLedger: 'private' });

  const result = await invoke();
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(await result.json()).toEqual({ bounded });
  expect(apiRequest).toHaveBeenCalledWith(expect.any(Request), '/projects/p%2Fone/agent/explicit-run', {
    redirectOn401: false,
  });
});

it.each([undefined, {}, { bounded: 'false' }, { bounded: false, error: 'private' }])(
  'fails closed on malformed upstream %j',
  async (value) => {
    vi.mocked(apiRequest).mockResolvedValue(value);

    const result = await invoke();
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ bounded: true });
  },
);

it('does not leak an upstream failure', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Response('private', { status: 403 }));

  const result = await invoke();
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({ bounded: true });
});

it('rejects mutations without contacting the API', async () => {
  expect(action().status).toBe(405);
  expect(apiRequest).not.toHaveBeenCalled();
});
