/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PaymentMethodPage, { action, ErrorBoundary } from './payment-method';
import { createI18nInstance } from '~/lib/i18n/runtime';

const { apiRequest, firstOrganizationOrNull } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  firstOrganizationOrNull: vi.fn().mockResolvedValue({ id: 'synthetic-org' }),
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/enterprise-api.server')>()),
  apiRequest,
  firstOrganizationOrNull,
}));
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  LinkButton: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  apiRequest.mockReset();
});

describe('payment email draft through the real route error boundary', () => {
  it('retains the draft and focuses the error after 503, then retries the same value successfully', async () => {
    vi.stubGlobal('Request', FetchRequest);

    let savedEmail = 'saved@example.test';
    apiRequest
      .mockRejectedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Response(null, { status: 503 }))
      .mockImplementationOnce(async (_request, _path, options) => {
        savedEmail = JSON.parse(options.body).email;

        return {};
      });

    const router = createMemoryRouter(
      [
        {
          path: '/payment-method',
          loader: () => ({ billingEmail: savedEmail, language: 'en' }),
          action,
          Component: PaymentMethodPage,
          ErrorBoundary,
          HydrateFallback: () => null,
        },
      ],
      { initialEntries: ['/payment-method'] },
    );

    const i18n = createI18nInstance('en');
    render(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );

    const input = await screen.findByLabelText('Billing email (CC)');
    fireEvent.change(input, { target: { value: 'draft@example.test' } });
    fireEvent.submit(input.closest('form')!);

    const alert = await screen.findByRole('alert');

    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.textContent).toContain('Could not update the billing email');
    expect((screen.getByLabelText('Billing email (CC)') as HTMLInputElement).value).toBe('draft@example.test');
    expect(Object.values(router.state.errors ?? {})[0]).toMatchObject({ status: 503 });

    const recoveredInput = screen.getByLabelText('Billing email (CC)');
    recoveredInput.focus();

    // A language-context update rerenders the existing boundary without a new error.
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    expect(document.activeElement).toBe(recoveredInput);
    expect(screen.getByRole('alert')).toBe(alert);
    expect(Object.values(router.state.errors ?? {})[0]).toMatchObject({ status: 503 });
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(document.activeElement).toBe(recoveredInput);
    fireEvent.submit(recoveredInput.closest('form')!);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')));
    expect((recoveredInput as HTMLInputElement).value).toBe('draft@example.test');
    fireEvent.submit(recoveredInput.closest('form')!);
    await screen.findByRole('status');
    expect(savedEmail).toBe('draft@example.test');
    expect((screen.getByLabelText('Billing email (CC)') as HTMLInputElement).value).toBe('draft@example.test');
    expect(router.state.errors).toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(3);
    router.dispose();
  });
});
