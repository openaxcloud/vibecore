/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { startCatalogueHydration } from './startup-catalogues';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('keeps SSR intact on failure, focuses retry and restores it before a single hydration', async () => {
  document.body.innerHTML = '<section data-ecode-startup-recovery hidden><button>Retry</button></section>';

  const original = document.body.innerHTML;
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  let resolve!: () => void;

  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );

  const hydrate = vi.fn(() => expect(document.body.innerHTML).toBe(original));
  startCatalogueHydration(load, hydrate);
  await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));

  const button = document.querySelector('button')!;
  expect(document.activeElement).toBe(button);
  expect(document.querySelector('section')!.hidden).toBe(false);
  expect(hydrate).not.toHaveBeenCalled();
  button.click();
  button.click();
  expect(load).toHaveBeenCalledTimes(2);
  expect(hydrate).not.toHaveBeenCalled();
  expect(document.querySelector('section')!.hidden).toBe(true);
  resolve();
  await vi.waitFor(() => expect(hydrate).toHaveBeenCalledTimes(1));
  button.click();
  expect(load).toHaveBeenCalledTimes(2);
});
