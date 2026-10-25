/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountDataPage from './account-settings.data';

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  Form: ({ children }: { children: ReactNode }) => <form>{children}</form>,
  useLoaderData: () => ({
    view: {
      status: 'none',
      canCancel: false,
      requestedAt: null,
      purgeDueAt: null,
      gracePeriodDays: 14,
      scope: { deleted: [], retained: [] },
    },
    email: 'synthetic@example.test',
    language: 'fr',
    loadError: false,
    loadedAt: '2026-10-25T12:00:00Z',
  }),
  useActionData: () => undefined,
  useNavigation: () => ({ state: 'idle' }),
  useRevalidator: () => ({ state: 'idle', revalidate: vi.fn() }),
}));
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
}));
afterEach(cleanup);

describe('account deletion dialog keyboard recovery', () => {
  it.each(['Escape', 'cancel'])('returns focus to the opener after %s', async (dismissal) => {
    render(<AccountDataPage />);

    const opener = screen.getByTestId('account-delete-open');
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole('dialog');
    const descriptionId = dialog.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();

    const description = document.getElementById(descriptionId!);
    expect(description?.textContent).toContain('Votre demande de suppression sera enregistrée.');
    expect(dialog.contains(description)).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));

    if (dismissal === 'Escape') {
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    }

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
