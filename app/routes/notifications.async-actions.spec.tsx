/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationFeedSection, PreferencesMatrixSection } from './notifications';
import type { SupportedLanguage } from '~/lib/i18n/language';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const initialMatrix = {
  security: { email: true, inApp: true },
  billing: { email: true, inApp: true },
  deployments: { email: true, inApp: true },
  team: { email: true, inApp: true },
  system: { email: true, inApp: true },
};

function renderDataRoute(element: React.ReactNode, language: SupportedLanguage = 'en') {
  const router = createMemoryRouter([
    {
      path: '/',
      element,
    },
  ]);

  render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

describe('notification async action recovery', () => {
  it('renders the notification matrix in professional French', async () => {
    renderDataRoute(<PreferencesMatrixSection initial={{ matrix: initialMatrix }} />, 'fr');

    expect(await screen.findByRole('heading', { name: 'Préférences de notification' })).toBeTruthy();
    expect(screen.getByText('Événements de sécurité')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Alertes de facturation via Dans l’application' })).toBeTruthy();
  });

  it('reverts a failed preference save and retries the intended matrix', async () => {
    const intendedMatrix = {
      ...initialMatrix,
      billing: { ...initialMatrix.billing, inApp: false },
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    renderDataRoute(<PreferencesMatrixSection initial={{ matrix: initialMatrix }} />);

    const billingInApp = await screen.findByRole('switch', { name: 'Billing alerts via In-app' });
    expect(billingInApp.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(billingInApp);

    expect(await screen.findByRole('heading', { name: 'Preferences were not saved' })).toBeTruthy();
    expect(billingInApp.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Billing alerts')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Preferences were not saved' })).toBeNull());
    expect(billingInApp.getAttribute('aria-checked')).toBe('false');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/user/preferences');

    const retryBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body)) as {
      preferences: { notifications: { matrix: typeof intendedMatrix } };
    };
    expect(retryBody.preferences.notifications.matrix).toEqual(intendedMatrix);
  });

  it('keeps the inbox visible and retries a failed mark-all request', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, unreadCount: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderDataRoute(
      <NotificationFeedSection
        unavailable={false}
        feed={{
          unreadCount: 1,
          notifications: [
            {
              id: 'notification-1',
              category: 'security',
              title: 'New sign-in',
              body: 'A new browser signed in to your account.',
              linkUrl: null,
              read: false,
              readAt: null,
              createdAt: '2026-07-14T12:00:00.000Z',
            },
          ],
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByRole('heading', { name: 'Notifications were not marked as read' })).toBeTruthy();
    expect(screen.getByText('New sign-in')).toBeTruthy();

    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry.className).toContain('min-h-[44px]');
    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Notifications were not marked as read' })).toBeNull(),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/notifications/read-all');
  });

  it('restores an unread row and offers retry when mark-read fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, unreadCount: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderDataRoute(
      <NotificationFeedSection
        unavailable={false}
        feed={{
          unreadCount: 1,
          notifications: [
            {
              id: 'notification/1',
              category: 'deployments',
              title: 'Deployment finished',
              body: null,
              linkUrl: '/projects/project-1/deployments',
              read: false,
              readAt: null,
              createdAt: '2026-07-14T12:00:00.000Z',
            },
          ],
        }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Mark read' }));

    expect(await screen.findByRole('heading', { name: 'Notification was not marked as read' })).toBeTruthy();
    expect(screen.getByLabelText('Unread')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Notification was not marked as read' })).toBeNull(),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/notifications/notification%2F1/read');
  });
});
