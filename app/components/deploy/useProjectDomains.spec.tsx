/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Suspense, startTransition, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectDomains } from './useProjectDomains';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const response = (domains: unknown[] = []) => ({ ok: true, json: async () => ({ data: { domains } }) });
describe('domain request lifecycle', () => {
  it('shows an HTTP load failure and recovers on refresh', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useProjectDomains('project-a'));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();
    await act(() => result.current.load());
    expect(result.current.error).toBe(false);
    expect(result.current.data.domains).toEqual([]);
  });
  it('never displays a late response from the previous project', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(
          new Promise((done) => {
            resolve = done;
          }),
        )
        .mockResolvedValueOnce(response([{ id: 'b' }])),
    );

    const { result, rerender } = renderHook(({ id }) => useProjectDomains(id), { initialProps: { id: 'a' } });
    rerender({ id: 'b' });
    await waitFor(() => expect(result.current.data?.domains).toEqual([{ id: 'b' }]));
    await act(async () => {
      resolve(response([{ id: 'a' }]));
    });
    expect(result.current.data.domains).toEqual([{ id: 'b' }]);
  });
  it('serializes double submissions and preserves loaded data on failure', async () => {
    let resolve!: (value: unknown) => void;

    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([{ id: 'existing' }]))
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
    vi.stubGlobal('fetch', fetch);

    const { result } = renderHook(() => useProjectDomains('project-a'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first!: Promise<void>;
    act(() => {
      first = result.current.submit(new FormData());
      void result.current.submit(new FormData());
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolve({ ok: false, status: 409 });
      await first;
    });
    expect(result.current.error).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.data.domains).toEqual([{ id: 'existing' }]);
  });
  it('ignores a mutation from an earlier visit to the same project', async () => {
    let resolveOld!: (value: unknown) => void;
    let resolveNew!: (value: unknown) => void;

    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response())
      .mockReturnValueOnce(
        new Promise((done) => {
          resolveOld = done;
        }),
      )
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response())
      .mockReturnValueOnce(
        new Promise((done) => {
          resolveNew = done;
        }),
      );
    vi.stubGlobal('fetch', fetch);

    const { result, rerender } = renderHook(({ id }) => useProjectDomains(id), { initialProps: { id: 'a' } });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let old!: Promise<void>;
    act(() => {
      old = result.current.submit(new FormData());
    });
    rerender({ id: 'b' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ id: 'a' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let current!: Promise<void>;
    act(() => {
      current = result.current.submit(new FormData());
    });
    await act(async () => {
      resolveOld({ ok: false, status: 409 });
      await old;
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.error).toBe(false);
    act(() => {
      void result.current.submit(new FormData());
    });
    expect(fetch).toHaveBeenCalledTimes(5);
    await act(async () => {
      resolveNew({ ok: false, status: 503 });
      await current;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.status).toBe(503);
  });
  it('keeps the committed project request alive during an abandoned suspended transition', async () => {
    let resolve!: (value: unknown) => void;

    const pending = new Promise<never>(() => {
      /* Keep the transition suspended until the test unmounts. */
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      ),
    );

    function Content({ id }: { id: string }) {
      const result = useProjectDomains(id);

      if (id === 'b') {
        throw pending;
      }

      return <span>{result.loading ? 'loading' : result.data.domains[0].id}</span>;
    }

    function App() {
      const [id, setId] = useState('a');
      return (
        <>
          <button onClick={() => startTransition(() => setId('b'))}>Switch</button>
          <Suspense fallback="pending">
            <Content id={id} />
          </Suspense>
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    await act(async () => {
      resolve(response([{ id: 'committed-project-a' }]));
    });
    expect(screen.getByText('committed-project-a')).toBeTruthy();
  });
});
