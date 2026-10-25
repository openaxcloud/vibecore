/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UsagePage from './usage';
import { createI18nInstance } from '~/lib/i18n/runtime';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  StatGrid: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('usage member limit failure recovery', () => {
  it.each(['fr', 'en'] as const)('announces repeated failures and preserves the draft in %s', async (language) => {
    vi.stubGlobal('Request', FetchRequest);

    let offscreen = true;

    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'alert') {
        return {
          ...originalRect.call(this),
          top: offscreen ? -100 : 100,
          bottom: offscreen ? -50 : 150,
        } as DOMRect;
      }

      return originalRect.call(this);
    });

    const action = vi.fn(async ({ request }: { request: Request }) => {
      const form = await request.formData();
      expect(form.get('limitDollars')).toBe('123');
      expect(form.get('userId')).toBe('synthetic-member');

      return { errorKey: 'usage.feedback.limitFailed' };
    });
    const router = createMemoryRouter(
      [
        {
          path: '/usage',
          Component: UsagePage,
          HydrateFallback: () => null,
          action,
          loader: () => ({
            language,
            usage: [],
            quotas: {},
            plan: { name: 'Pro' },
            breakdown: null,
            memberLimits: { limits: [], members: [{ userId: 'synthetic-member', name: 'Synthetic member' }] },
          }),
        },
      ],
      { initialEntries: ['/usage'] },
    );

    const i18n = createI18nInstance(language);
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );

    const input = await screen.findByRole('spinbutton');
    fireEvent.change(input, { target: { value: '123' } });

    const save = screen.getByRole('button', { name: i18n.t('billing.common.save') });

    for (const attempt of [1, 2]) {
      input.focus();
      fireEvent.click(save);

      const alert = await screen.findByRole('alert');
      await waitFor(() => expect(action).toHaveBeenCalledTimes(attempt));
      await waitFor(() => expect(document.activeElement).toBe(alert));
      expect(alert.textContent).toBe(i18n.t('usage.feedback.limitFailed'));
      expect((input as HTMLInputElement).value).toBe('123');
    }
    offscreen = false;
    input.focus();
    fireEvent.click(save);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('alert').textContent).toBe(i18n.t('usage.feedback.limitFailed'));
  });
});
