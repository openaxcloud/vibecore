/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BillingPage from './billing';
import { createI18nInstance } from '~/lib/i18n/runtime';

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  ActivityList: () => null,
  StatGrid: () => null,
  LinkButton: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const fixture = {
  language: 'fr',
  billing: { plan: { key: 'free', name: 'Free', monthlyCents: 0 }, usage: [], upgradePrompts: [] },
  credits: {
    creditsEnabled: true,
    shadow: false,
    balanceCents: 0,
    packBalanceCents: 0,
    totalAvailableCents: 0,
    budgetCapCents: null,
    serviceShutdownCents: null,
    checkpoints: [],
  },
  creditsUnavailable: false,
  billingAccessLimited: false,
};

describe('billing action feedback accessibility', () => {
  it.each([true, false])('announces a submitted limit result (success=%s)', async (success) => {
    // node-fetch accepts jsdom's AbortSignal when the data router creates requests.
    vi.stubGlobal('Request', FetchRequest);

    let actionSucceeds = success;

    const action = vi.fn(async ({ request }: { request: Request }) => {
      const form = await request.formData();
      expect(form.get('intent')).toBe('set-limits');

      return actionSucceeds
        ? { successKey: 'billing.feedback.limitUpdated' }
        : { errorKey: 'billing.feedback.zeroSpendLimit' };
    });
    const router = createMemoryRouter(
      [{ path: '/billing', loader: () => fixture, action, Component: BillingPage, HydrateFallback: () => null }],
      {
        initialEntries: ['/billing'],
      },
    );

    const i18n = createI18nInstance('fr');
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );

    const save = await screen.findByRole('button', { name: i18n.t('billing.spend.save') });
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    expect(status.childElementCount).toBe(0);
    fireEvent.click(save);

    const feedback = await screen.findByRole(success ? 'status' : 'alert');
    await waitFor(() =>
      expect(feedback.textContent).toBe(
        i18n.t(success ? 'billing.feedback.limitUpdated' : 'billing.feedback.zeroSpendLimit'),
      ),
    );
    expect(screen.getByRole('status')).toBe(status);
    expect(action).toHaveBeenCalledOnce();

    if (success) {
      expect(feedback.getAttribute('aria-live')).toBe('polite');
      expect(screen.queryByRole('alert')).toBeNull();

      actionSucceeds = false;
      fireEvent.click(save);
      await screen.findByRole('alert');
      expect(screen.getByRole('status')).toBe(status);
      expect(status.textContent).toBe('');
      expect(status.childElementCount).toBe(0);
    } else {
      expect(status.textContent).toBe('');
      expect(status.childElementCount).toBe(0);
    }

    router.dispose();
  });
});
