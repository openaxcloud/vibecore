/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  loaderData: {
    language: 'fr',
    walletsUnavailable: false,
    wallets: [
      {
        id: 'wallet-1',
        organizationId: 'org_customer_owned_123456789',
        balanceCents: 123_456,
        currency: 'USD',
        budgetCapCents: 500_000,
        serviceShutdownCents: 600_000,
        updatedAt: '2026-08-05T03:04:00.000Z',
      },
    ],
  },
  fetcherState: 'idle',
  fetcherData: undefined as Record<string, unknown> | undefined,
  revalidatorState: 'idle',
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useFetcher: () => ({
      state: routeState.fetcherState,
      data: routeState.fetcherData,
      Form: 'form',
    }),
    useLoaderData: () => routeState.loaderData,
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
  };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section role="status" aria-label={label} />,
  AsyncPanelError: ({
    title,
    description,
    retryLabel,
    onRetry,
  }: {
    title: string;
    description: string;
    retryLabel: string;
    onRetry: () => void;
  }) => (
    <section role="alert">
      <h3>{title}</h3>
      <p>{description}</p>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </section>
  ),
}));

vi.mock('~/components/dashboard/UserAreaRouteError', () => ({
  UserAreaRouteErrorBoundary: () => null,
}));

vi.mock('react-toastify', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import AdminWalletsPage, { meta } from './admin.wallets';
import {
  formatAdminWalletCount,
  formatAdminWalletCurrency,
  formatAdminWalletDateTime,
  formatAdminWalletError,
  formatAdminWalletStatus,
  getAdminWalletsCopy,
} from '~/lib/i18n/catalogs/admin-wallets';

function resetRouteState() {
  routeState.loaderData = {
    language: 'fr',
    walletsUnavailable: false,
    wallets: [
      {
        id: 'wallet-1',
        organizationId: 'org_customer_owned_123456789',
        balanceCents: 123_456,
        currency: 'USD',
        budgetCapCents: 500_000,
        serviceShutdownCents: 600_000,
        updatedAt: '2026-08-05T03:04:00.000Z',
      },
    ],
  };
  routeState.fetcherState = 'idle';
  routeState.fetcherData = undefined;
  routeState.revalidatorState = 'idle';
}

beforeEach(() => {
  resetRouteState();
  revalidateMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => cleanup());

describe('admin wallets rendered i18n', () => {
  it('renders localized metadata and the complete French surface', () => {
    const tags = meta({ data: { language: 'fr' }, matches: [] } as never);
    const { container } = render(<AdminWalletsPage />);

    expect(tags).toContainEqual({ title: 'Portefeuilles de crédits — Administration E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: expect.stringContaining('ajustements audités'),
      }),
    );
    expect(tags).toContainEqual(
      expect.objectContaining({ property: 'og:title', content: 'Portefeuilles de crédits — Administration E-Code' }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Portefeuilles de crédits' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Portefeuilles des organisations' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Ajuster un solde' })).toBeTruthy();
    expect(screen.getByLabelText('ID de l’organisation')).toBeTruthy();
    expect(screen.getByLabelText('Sens')).toBeTruthy();
    expect(screen.getByLabelText('Montant (USD)')).toBeTruthy();
    expect(screen.getByLabelText('Motif (enregistré dans le journal d’audit)')).toBeTruthy();
    expect(screen.getByLabelText('Confirmez avec votre mot de passe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Appliquer l’ajustement' })).toBeTruthy();
    expect(container.textContent).not.toContain('Credit wallets');
    expect(container.textContent).not.toContain('Apply adjustment');
    expect(container.textContent).not.toContain('Budget cap');
  });

  it('formats French currency, dates and plurals while preserving technical identifiers', () => {
    render(<AdminWalletsPage />);

    expect(screen.getByText('1 portefeuille')).toBeTruthy();
    expect(screen.getAllByText('org_customer_owned_123456789').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/1\s234,56\s.*\$US/u).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/05.*août.*2026.*03:04/u).length).toBeGreaterThanOrEqual(2);
  });

  it('provides a recoverable French loading failure instead of a fake empty state', () => {
    routeState.loaderData.wallets = [];
    routeState.loaderData.walletsUnavailable = true;

    render(<AdminWalletsPage />);

    expect(screen.getByRole('heading', { name: 'Impossible de charger les portefeuilles de crédits' })).toBeTruthy();
    expect(screen.queryByText('Aucun portefeuille de crédits pour le moment')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Recharger les portefeuilles' }));
    expect(revalidateMock).toHaveBeenCalledOnce();
  });

  it('renders an explicit localized empty state', () => {
    routeState.loaderData.wallets = [];

    render(<AdminWalletsPage />);

    expect(screen.getByText('Aucun portefeuille de crédits pour le moment')).toBeTruthy();
    expect(screen.getByText(/dès qu’une organisation reçoit ou utilise des crédits/u)).toBeTruthy();
  });

  it('localizes structured field errors and never displays upstream prose', async () => {
    routeState.fetcherData = {
      errorCode: 'incorrectPassword',
      field: 'password',
      error: 'Raw English backend password failure',
    };

    const { container } = render(<AdminWalletsPage />);

    const password = screen.getByLabelText(/^Confirmez avec votre mot de passe/u);
    expect(password.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/Mot de passe incorrect/u)).toBeTruthy();
    expect(container.textContent).not.toContain('Raw English backend password failure');
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining('Mot de passe incorrect')));
  });

  it('localizes structured success with French money and keeps the organization ID intact', async () => {
    routeState.fetcherData = {
      statusCode: 'credited',
      organizationId: 'org_customer_owned_123456789',
      amountCents: 2_550,
      balanceCents: 126_006,
      currency: 'USD',
    };

    render(<AdminWalletsPage />);

    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/Crédit de 25,50(?:\u00a0|\u202f).*\$US appliqué/u);
    expect(status.textContent).toContain('org_customer_owned_123456789');
    expect(status.textContent).toMatch(/1(?:\u00a0|\u202f)260,06(?:\u00a0|\u202f).*\$US/u);
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith(status.textContent));
    expect(revalidateMock).toHaveBeenCalledOnce();
  });

  it('shows localized busy and client-side validation states', () => {
    routeState.fetcherState = 'submitting';

    const { unmount } = render(<AdminWalletsPage />);
    const busyButton = screen.getByRole('button', { name: 'Application de l’ajustement…' }) as HTMLButtonElement;

    expect(busyButton.disabled).toBe(true);
    expect(busyButton.getAttribute('aria-busy')).toBe('true');
    unmount();

    routeState.fetcherState = 'idle';
    render(<AdminWalletsPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Appliquer l’ajustement' }).closest('form')!);

    expect(screen.getByText('Saisissez un motif — il est enregistré dans le journal d’audit.')).toBeTruthy();
    expect(screen.getByLabelText(/^Motif \(enregistré dans le journal d’audit\)/u).getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('keeps the desktop table and mobile cards wrap-safe for longer French copy', () => {
    const { container } = render(<AdminWalletsPage />);
    const table = screen.getByRole('table');
    const mobileList = container.querySelector('ul.md\\:hidden');
    const organizationIds = screen.getAllByText('org_customer_owned_123456789');

    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect(table.parentElement?.className).toContain('md:block');
    expect(table.className).toContain('min-w-[');
    expect(mobileList).toBeTruthy();
    expect(organizationIds.some((element) => element.className.includes('break-all'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Appliquer l’ajustement' }).innerHTML).toContain('break-words');
    expect(container.innerHTML).not.toContain('truncate');
  });

  it('keeps English as the fallback catalog', () => {
    routeState.loaderData.language = 'de';

    render(<AdminWalletsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Credit wallets' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply adjustment' })).toBeTruthy();
    expect(screen.getByText('1 wallet')).toBeTruthy();
  });
});

describe('admin wallets locale helpers', () => {
  it('keeps both catalogs complete and falls back to English', () => {
    const englishKeys = Object.keys(getAdminWalletsCopy('en')).sort();
    const frenchKeys = Object.keys(getAdminWalletsCopy('fr')).sort();

    expect(frenchKeys).toEqual(englishKeys);
    expect(getAdminWalletsCopy('es')['adminWallets.page.title']).toBe('Credit wallets');
  });

  it('formats amounts, dates, counts, statuses and errors by locale', () => {
    expect(formatAdminWalletCurrency(123_456, 'EUR', 'fr')).toMatch(/1(?:\u00a0|\u202f)234,56(?:\u00a0|\u202f).*€/u);
    expect(formatAdminWalletCurrency(123_456, 'USD', 'en')).toMatch(/US\$1,234\.56|\$1,234\.56/u);
    expect(formatAdminWalletDateTime('2026-08-05T03:04:00.000Z', 'fr')).toMatch(/05.*août.*2026.*03:04/u);
    expect(formatAdminWalletCount(2, 'fr')).toBe('2 portefeuilles');
    expect(
      formatAdminWalletStatus(
        {
          statusCode: 'debited',
          organizationId: 'org-do-not-translate',
          amountCents: 100,
          balanceCents: 1_000,
          currency: 'EUR',
        },
        'fr',
      ),
    ).toMatch(/Débit de 1,00.*€ appliqué à org-do-not-translate/u);
    expect(formatAdminWalletError({ errorCode: 'serviceUnavailable' }, 'fr')).toBe(
      'Le service d’administration est inaccessible. Réessayez dans quelques instants.',
    );
  });
});
