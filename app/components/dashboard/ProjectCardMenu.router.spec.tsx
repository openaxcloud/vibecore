/** @vitest-environment jsdom */
import { createRequire } from 'node:module';
import { URLSearchParams as NodeURLSearchParams } from 'node:url';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectRenameForm } from './ProjectCardMenu';
import { createI18nInstance } from '~/lib/i18n/runtime';

const error = vi.hoisted(() => vi.fn());
vi.mock('react-toastify', () => ({ toast: { error } }));

// Match Node Request's AbortSignal brand in the jsdom test environment.
const { transferableAbortController } = createRequire(import.meta.url)('node:util') as typeof import('node:util');
vi.stubGlobal('AbortController', transferableAbortController().constructor);
vi.stubGlobal('URLSearchParams', NodeURLSearchParams);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('retains a failed rename and retries with real fetcher state and retained action data', async () => {
  const onDone = vi.fn();
  const requests: FormData[] = [];

  let complete: (result: { ok: boolean; error?: string }) => void = vi.fn();

  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <I18nextProvider i18n={createI18nInstance('en')}>
          <ProjectRenameForm project={{ id: 'isolated-project', name: 'Example' }} onDone={onDone} />
        </I18nextProvider>
      ),
    },
    {
      path: '/api/projects/isolated-project/project-action',
      action: async ({ request }) => {
        requests.push(await request.formData());
        return new Promise<{ ok: boolean; error?: string }>((resolve) => {
          complete = resolve;
        });
      },
    },
  ]);

  const view = render(<RouterProvider router={router} />);

  try {
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'First draft' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(input.disabled).toBe(true);
    expect(requests[0].get('name')).toBe('First draft');
    await act(async () => complete({ ok: false, error: 'isolated failure' }));
    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.value).toBe('First draft');
    expect(onDone).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: 'Corrected draft' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(input.disabled).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(requests[1].get('name')).toBe('Corrected draft');
    await act(async () => complete({ ok: true }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(input.disabled).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    router.dispose();
  }
});
