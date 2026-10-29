/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ExplicitProjectBudget } from './ExplicitProjectBudget';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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
it('shows actual reservations without presenting a total recipe balance', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(summary)));
  vi.stubGlobal('fetch', fetcher);
  render(<ExplicitProjectBudget projectId="synthetic/a" language="en" />);
  expect(screen.getByRole('status').textContent).toContain('Reading');
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('$15.26'));
  expect(screen.getByRole('status').textContent).toContain('$4.74');
  expect(screen.getByRole('status').textContent).toContain('budget is unknown');
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    '/api/projects/synthetic%2Fa/agent/explicit-budget',
    expect.objectContaining({ cache: 'no-store' }),
  );
});
it('does not display stale project balances or failed requests as zero', async () => {
  let resolveFirst!: (value: Response) => void;

  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(new Response('{}', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);

  const view = render(<ExplicitProjectBudget projectId="first" language="en" />);
  view.rerender(<ExplicitProjectBudget projectId="second" language="en" />);
  resolveFirst(new Response(JSON.stringify(summary)));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('unavailable'));
  expect(screen.getByRole('status').textContent).not.toContain('$15.26');
  expect(screen.getByRole('status').textContent).not.toContain('$0.00');
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});

it('times out a suspended read and retries only the read on demand', async () => {
  vi.useFakeTimers();

  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise(() => {
          /* Intentionally suspended transport for the timeout contract. */
        }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(summary)));
  vi.stubGlobal('fetch', fetcher);
  render(<ExplicitProjectBudget projectId="one" language="en" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(screen.getByRole('status').textContent).toContain('unavailable');
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {
    fireEvent.click(screen.getByRole('button'));
  });
  expect(screen.getByRole('status').textContent).toContain('$15.26');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true);
});
