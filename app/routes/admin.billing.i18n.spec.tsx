/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  loaderData: {
    language: 'fr',
    plans: [
      {
        key: 'pro-eur',
        name: 'Customer-owned Pro plan',
        monthlyCents: 2500,
      },
    ],
    subscriptions: [
      {
        id: 'subscription_row_1',
        organizationId: 'org_enterprise_123456789',
        planKey: 'pro-eur',
        status: 'ACTIVE',
        externalId: 'sub_stripe_123456789',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-06-01T12:30:00.000Z',
      },
    ],
  },
  actionData: undefined as Record<string, unknown> | undefined,
  navigation: {
    state: 'idle',
    formData: undefined as FormData | undefined,
  },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  const MockForm = ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>;

  return {
    ...actual,
    Form: MockForm,
    useLoaderData: () => routeState.loaderData,
    useActionData: () => routeState.actionData,
    useNavigation: () => routeState.navigation,
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

vi.mock('~/components/dashboard/UserAreaRouteError', () => ({
  UserAreaRouteErrorBoundary: () => null,
}));

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: vi.fn(),
  formObject: vi.fn(),
  json: vi.fn(),
  requirePlatformAdmin: vi.fn(),
}));

import AdminBillingPage, { meta } from './admin.billing';

function resetCollections() {
  routeState.loaderData.plans = [
    {
      key: 'pro-eur',
      name: 'Customer-owned Pro plan',
      monthlyCents: 2500,
    },
  ];
  routeState.loaderData.subscriptions = [
    {
      id: 'subscription_row_1',
      organizationId: 'org_enterprise_123456789',
      planKey: 'pro-eur',
      status: 'ACTIVE',
      externalId: 'sub_stripe_123456789',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: '2026-06-01T12:30:00.000Z',
    },
  ];
}

beforeEach(() => {
  routeState.loaderData.language = 'fr';
  resetCollections();
  routeState.actionData = undefined;
  routeState.navigation = { state: 'idle', formData: undefined };
});

afterEach(() => cleanup());

describe('admin billing rendered i18n', () => {
  it('localizes metadata, both override forms and all data sections in French', () => {
    const tags = meta({ data: { language: 'fr' } } as never);
    const { container } = render(<AdminBillingPage />);

    expect(tags).toContainEqual({ title: 'Administration de la facturation — Administration E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: expect.stringContaining('offres et abonnements E-Code'),
      }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Administration de la facturation' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Créer une dérogation de quota' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Appliquer une dérogation d’offre' })).toBeTruthy();
    expect(screen.getAllByLabelText('ID de l’organisation')).toHaveLength(2);
    expect(screen.getByLabelText('Clé de quota').getAttribute('placeholder')).toBe('projects.count');
    expect(screen.getByLabelText('Limite')).toBeTruthy();
    expect(screen.getAllByLabelText('Motif')).toHaveLength(2);
    expect(screen.getAllByLabelText('Confirmez avec votre mot de passe')).toHaveLength(2);
    expect(screen.getByLabelText('Offre')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer la dérogation de quota' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Appliquer la dérogation d’offre' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Offres configurées' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Abonnements récents' })).toBeTruthy();
    expect(container.textContent).not.toContain('Create override');
    expect(container.textContent).not.toContain('Recent subscriptions');
    expect(container.textContent).not.toContain('Period end');
  });

  it('formats EUR amounts, counts, dates and closed subscription statuses', () => {
    render(<AdminBillingPage />);

    expect(screen.getByText('1 offre configurée')).toBeTruthy();
    expect(screen.getByText('1 abonnement récent')).toBeTruthy();
    expect(screen.getAllByText(/25,00.€ par mois/u).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/01.*juin.*2026/u)).toBeTruthy();
    expect(screen.getByText('Actif')).toBeTruthy();
    expect(screen.getByText('Résiliation programmée')).toBeTruthy();
  });

  it('preserves plan names, quota keys, organization IDs, plan keys and Stripe subscription IDs', () => {
    render(<AdminBillingPage />);

    expect(screen.getAllByText(/Customer-owned Pro plan/u).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('org_enterprise_123456789')).toBeTruthy();
    expect(screen.getAllByText('pro-eur').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('sub_stripe_123456789')).toBeTruthy();
    expect(screen.getByLabelText('Clé de quota').getAttribute('placeholder')).toBe('projects.count');
  });

  it('masks unknown backend status prose in French', () => {
    routeState.loaderData.subscriptions[0]!.status = 'Raw English upstream billing state';

    const { container } = render(<AdminBillingPage />);

    expect(screen.getByText('Statut inconnu')).toBeTruthy();
    expect(container.textContent).not.toContain('Raw English upstream billing state');
  });

  it('keeps English as the default fallback surface', () => {
    routeState.loaderData.language = 'en';

    render(<AdminBillingPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Billing administration' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Create a quota override' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply plan override' })).toBeTruthy();
    expect(screen.getByText('1 configured plan')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders localized success, page errors and field validation from structured codes', () => {
    routeState.actionData = { statusCode: 'quotaCreated', intent: 'quota' };

    const { unmount } = render(<AdminBillingPage />);

    expect(screen.getByRole('status').textContent).toBe('Dérogation de quota créée.');
    unmount();

    routeState.actionData = { errorCode: 'resourceNotFound', intent: 'plan' };
    render(<AdminBillingPage />);

    expect(screen.getByRole('alert').textContent).toContain('L’organisation, l’offre ou la ressource de quota');
    cleanup();

    routeState.actionData = { errorCode: 'invalidLimit', intent: 'quota', field: 'limit' };
    render(<AdminBillingPage />);

    expect(screen.getByText('Saisissez une limite de quota entière, positive ou nulle.')).toBeTruthy();
    expect(screen.getByLabelText(/^Limite/u).getAttribute('aria-invalid')).toBe('true');
  });

  it('shows explicit empty states and disables plan mutation when no plan exists', () => {
    routeState.loaderData.plans = [];
    routeState.loaderData.subscriptions = [];

    render(<AdminBillingPage />);

    expect(screen.getByText('0 offre configurée')).toBeTruthy();
    expect(screen.getByText('0 abonnement récent')).toBeTruthy();
    expect(screen.getByText('Aucune offre de facturation n’est configurée.')).toBeTruthy();
    expect(screen.getByText('Aucun abonnement n’a encore été enregistré.')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Aucune offre configurée n’est disponible' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Appliquer la dérogation d’offre' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('exposes distinct pending states and prevents duplicate mutations', () => {
    const quotaForm = new FormData();
    quotaForm.set('intent', 'quota');
    routeState.navigation = { state: 'submitting', formData: quotaForm };

    const { unmount } = render(<AdminBillingPage />);

    expect(
      (screen.getByRole('button', { name: 'Création de la dérogation de quota…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Appliquer la dérogation d’offre' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    unmount();

    const planForm = new FormData();
    planForm.set('intent', 'plan');
    routeState.navigation = { state: 'submitting', formData: planForm };
    render(<AdminBillingPage />);

    expect(
      (screen.getByRole('button', { name: 'Application de la dérogation d’offre…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('keeps long French copy and technical identifiers wrap-safe on narrow screens', () => {
    const { container } = render(<AdminBillingPage />);
    const plansHeading = screen.getByRole('heading', { level: 2, name: 'Offres configurées' });
    const createButton = screen.getByRole('button', { name: 'Créer la dérogation de quota' });
    const organizationId = screen.getByText('org_enterprise_123456789');
    const table = screen.getByRole('table');

    expect(plansHeading.parentElement?.className).toContain('flex-col');
    expect(plansHeading.parentElement?.className).toContain('sm:flex-row');
    expect(createButton.parentElement?.className).toContain('[&_button]:!whitespace-normal');
    expect(organizationId.className).toContain('break-all');
    expect(table.className).toContain('min-w-[');
    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect(container.innerHTML).not.toContain('truncate');
  });
});
