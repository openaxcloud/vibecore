/** @vitest-environment jsdom */
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { usePreviewStartNotice } from './usePreviewStartNotice';

afterEach(cleanup);

it('allows one success notice for concurrent or repeated starts, without consuming failed starts', () => {
  const { result } = renderHook(() => usePreviewStartNotice('A'));
  result.current(); // A failed start never claims its notice.

  const first = result.current();
  const second = result.current();
  expect(first()).toBe(true);
  expect(second()).toBe(false);
  expect(result.current()()).toBe(false);
});

it('keeps the factory identity stable and rejects stale completions across A → B → A', () => {
  const { result, rerender } = renderHook(({ id }) => usePreviewStartNotice(id), { initialProps: { id: 'A' } });
  const factory = result.current;
  const staleA = factory();
  rerender({ id: 'B' });
  expect(result.current).toBe(factory);

  const staleB = factory();
  expect(staleA()).toBe(false);
  expect(factory()()).toBe(true);
  rerender({ id: 'A' });
  expect(result.current).toBe(factory);
  expect(staleA()).toBe(false);
  expect(staleB()).toBe(false);
  expect(factory()()).toBe(true);
});

it('does not announce an async completion after unmount', async () => {
  const { result, unmount } = renderHook(() => usePreviewStartNotice(undefined));
  const claim = result.current();

  let complete!: () => void;

  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  }).then(claim);
  unmount();
  complete();
  expect(await pending).toBe(false);
});
