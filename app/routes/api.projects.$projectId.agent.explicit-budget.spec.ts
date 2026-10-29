import { beforeEach, expect, it, vi } from 'vitest';
import { action, loader } from './api.projects.$projectId.agent.explicit-budget';
import { apiRequest } from '~/lib/enterprise-api.server';
vi.mock('~/lib/enterprise-api.server', () => ({ apiRequest: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

const summary = {
  scope: 'explicit-runs-only',
  currency: 'USD',
  limitMicros: 20000000,
  reservedMicros: 15260000,
  remainingMicros: 4740000,
  runCount: 1,
  historicalCostsIncluded: false,
  totalRecipeRemainingMicros: null,
};
const invoke = () =>
  loader({
    request: new Request('https://fixture.test/api/projects/p/agent/explicit-budget'),
    params: { projectId: 'p/one' },
    context: {},
  } as Parameters<typeof loader>[0]);
it('reads authorized project balance without exposing permits or creating a reservation', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ ...summary, permits: ['private'] });

  const response = await invoke();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual(summary);
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith(expect.any(Request), '/projects/p%2Fone/agent/explicit-budget', {
    redirectOn401: false,
  });
});
it.each([
  {},
  { ...summary, remainingMicros: 20000000 },
  { ...summary, historicalCostsIncluded: true },
  { ...summary, totalRecipeRemainingMicros: 4740000 },
  { ...summary, reservedMicros: -1 },
])('refuses an invalid balance %j', async (value) => {
  vi.mocked(apiRequest).mockResolvedValue(value);

  const response = await invoke();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ code: 'BUDGET_UNAVAILABLE' });
});
it('does not leak errors or accept mutations', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('private'));
  expect(await (await invoke()).json()).toEqual({ code: 'BUDGET_UNAVAILABLE' });
  vi.mocked(apiRequest).mockClear();
  expect(action().status).toBe(405);
  expect(apiRequest).not.toHaveBeenCalled();
});
