/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Suspense, lazy } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadWorkbenchWithRecovery } from './load-workbench';
import { PanelBoundary } from '~/components/ui/PanelBoundary';
import { createI18nInstance } from '~/lib/i18n/runtime';

vi.mock('~/lib/stores/logs', () => ({ logStore: { logError: vi.fn() } }));

const origin = 'https://app.example.test';
const chunk = `${origin}/assets/Workbench.client-Abc_123-x.js`;
const networkError = (url = chunk) => new TypeError(`Failed to fetch dynamically imported module: ${url}`);
const module = { Workbench: () => <div>Recovered editor</div>, additionalExport: 'preserved' };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadWorkbenchWithRecovery', () => {
  it('preserves the initial module and performs no recovery on success', async () => {
    const load = vi.fn().mockResolvedValue(module);
    const retryImport = vi.fn();
    expect(await loadWorkbenchWithRecovery(load, { origin, retryImport })).toBe(module);
    expect(load).toHaveBeenCalledTimes(1);
    expect(retryImport).not.toHaveBeenCalled();
  });

  it('recovers exactly once with a fixed new URL and preserves all module exports', async () => {
    const load = vi.fn().mockRejectedValue(networkError());
    const retryImport = vi.fn().mockResolvedValue(module);
    expect(await loadWorkbenchWithRecovery(load, { origin, retryImport })).toBe(module);
    expect(load).toHaveBeenCalledTimes(1);
    expect(retryImport.mock.calls).toEqual([[`${chunk}?vibecore-retry=1`]]);
  });

  it.each([
    new Error(`Failed to fetch dynamically imported module: ${chunk}`),
    new TypeError('Cannot read properties of undefined'),
    networkError('https://outside.example/assets/Workbench.client-Abc.js'),
    networkError(`${origin}/assets/Other.client-Abc.js`),
    networkError(`${origin}/other/assets/Workbench.client-Abc.js`),
    networkError(`${origin}/assets/Workbench.client-Abc.js/extra`),
    networkError(`${origin}/assets/Workbench.client-Abc.js?vibecore-retry=1`),
    networkError(`${origin}/assets/Workbench.client-Abc.js#fragment`),
    networkError(`${origin}/assets/Workbench.client-Abc.js.evil`),
    networkError(`${origin}/assets/%57orkbench.client-Abc.js`),
    networkError(`${origin}/other/../assets/Workbench.client-Abc.js`),
    networkError(`https://user@app.example.test/assets/Workbench.client-Abc.js`),
    networkError(`${chunk}\nhttps://outside.example/extra.js`),
    networkError(`${chunk}\n`),
    networkError('https://'),
    new TypeError(`Failed to fetch dynamically imported module: ${chunk} extra text`),
  ])('does not reinterpret unsupported or unsafe import errors: %s', async (error) => {
    const retryImport = vi.fn();
    await expect(loadWorkbenchWithRecovery(() => Promise.reject(error), { origin, retryImport })).rejects.toBe(error);
    expect(retryImport).not.toHaveBeenCalled();
  });

  it('preserves the final error without recursive retries', async () => {
    const finalError = networkError(`${chunk}?vibecore-retry=1`);
    const load = vi.fn().mockRejectedValue(networkError());
    const retryImport = vi.fn().mockRejectedValue(finalError);
    await expect(loadWorkbenchWithRecovery(load, { origin, retryImport })).rejects.toBe(finalError);
    expect(load).toHaveBeenCalledTimes(1);
    expect(retryImport).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('uses one lazy promise through real PanelBoundary (double failure=%s)', async (failsAgain) => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const load = vi.fn().mockRejectedValue(networkError());

    const retryImport = failsAgain
      ? vi.fn().mockRejectedValue(networkError(`${chunk}?vibecore-retry=1`))
      : vi.fn().mockResolvedValue(module);
    const Workbench = lazy(() =>
      loadWorkbenchWithRecovery(load, { origin, retryImport }).then((loaded) => ({ default: loaded.Workbench })),
    );
    await act(async () => {
      render(
        <I18nextProvider i18n={createI18nInstance('en')}>
          <PanelBoundary title="Workbench">
            <Suspense fallback={<div>Loading editor</div>}>
              <Workbench />
            </Suspense>
          </PanelBoundary>
        </I18nextProvider>,
      );
    });

    if (failsAgain) {
      expect(screen.getByRole('alert')).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Reload panel' }));
      });
      expect(screen.getByRole('alert')).toBeTruthy();
    } else {
      expect(screen.getByText('Recovered editor')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    }

    expect(load).toHaveBeenCalledTimes(1);
    expect(retryImport).toHaveBeenCalledTimes(1);
  });
});
