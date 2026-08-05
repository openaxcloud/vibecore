/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  loaderData: {
    language: 'fr',
    hasSecretKey: true,
    hasWebhookSecret: false,
    envSecretKeyPresent: false,
    envWebhookSecretPresent: true,
    stripeConfigured: true,
    plans: [
      {
        key: 'pro-eur',
        name: 'Customer-owned Pro plan',
        stripeProductId: 'prod_FR123',
        stripePriceId: 'price_legacy_EUR',
        stripePriceMonthlyId: 'price_monthly_EUR',
        stripePriceAnnualId: 'price_annual_EUR',
      },
    ],
    webhookFailures: [
      {
        id: 'failure_1',
        eventId: 'evt_123456789',
        type: 'invoice.payment_failed',
        attempts: 1234,
        lastError: 'Raw English backend error with sk_live_secret and private database host',
        failedAt: '2026-06-01T12:30:00.000Z',
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

import AdminStripePage, { meta } from './admin.stripe';

function resetCollections() {
  routeState.loaderData.plans = [
    {
      key: 'pro-eur',
      name: 'Customer-owned Pro plan',
      stripeProductId: 'prod_FR123',
      stripePriceId: 'price_legacy_EUR',
      stripePriceMonthlyId: 'price_monthly_EUR',
      stripePriceAnnualId: 'price_annual_EUR',
    },
  ];
  routeState.loaderData.webhookFailures = [
    {
      id: 'failure_1',
      eventId: 'evt_123456789',
      type: 'invoice.payment_failed',
      attempts: 1234,
      lastError: 'Raw English backend error with sk_live_secret and private database host',
      failedAt: '2026-06-01T12:30:00.000Z',
    },
  ];
}

beforeEach(() => {
  routeState.loaderData.language = 'fr';
  routeState.loaderData.hasSecretKey = true;
  routeState.loaderData.hasWebhookSecret = false;
  routeState.loaderData.envSecretKeyPresent = false;
  routeState.loaderData.envWebhookSecretPresent = true;
  routeState.loaderData.stripeConfigured = true;
  resetCollections();
  routeState.actionData = undefined;
  routeState.navigation = { state: 'idle', formData: undefined };
});

afterEach(() => cleanup());

describe('admin Stripe rendered i18n', () => {
  it('localizes metadata and the full configuration surface in French', () => {
    const tags = meta({ data: { language: 'fr' } } as never);
    const { container } = render(<AdminStripePage />);

    expect(tags).toContainEqual({ title: 'Configuration Stripe — Administration E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: expect.stringContaining('identifiants Stripe chiffrés'),
      }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Configuration Stripe' })).toBeTruthy();
    expect(screen.getByText('Secrets')).toBeTruthy();
    expect(screen.getByText('Clé secrète configurée')).toBeTruthy();
    expect(screen.getByText('Aucun secret de webhook en base de données')).toBeTruthy();
    expect(screen.getByText('Stripe opérationnel')).toBeTruthy();
    expect(screen.getByText(/Repli vers l’environnement — clé secrète : indisponible/u)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'IDs de prix des offres' })).toBeTruthy();
    expect(screen.getByLabelText('Clé secrète (laissez vide pour conserver la valeur actuelle)')).toBeTruthy();
    expect(screen.getByLabelText('Secret de signature du webhook (whsec_…)')).toBeTruthy();
    expect((screen.getByLabelText('ID du produit') as HTMLInputElement).value).toBe('prod_FR123');
    expect((screen.getByLabelText('ID du prix (ancien format ou repli mensuel)') as HTMLInputElement).value).toBe(
      'price_legacy_EUR',
    );
    expect((screen.getByLabelText('ID du prix mensuel') as HTMLInputElement).value).toBe('price_monthly_EUR');
    expect((screen.getByLabelText('ID du prix annuel') as HTMLInputElement).value).toBe('price_annual_EUR');
    expect(screen.getByLabelText('Confirmez avec votre mot de passe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer la configuration Stripe' })).toBeTruthy();
    expect(container.textContent).not.toContain('Stripe configuration saved.');
    expect(container.textContent).not.toContain('Plan price IDs');
  });

  it('preserves brands, admin-owned plan content, Stripe IDs, event IDs, types and currencies', () => {
    render(<AdminStripePage />);

    expect(screen.getAllByText(/Stripe/u).length).toBeGreaterThan(0);
    expect(screen.getByText(/Customer-owned Pro plan/u)).toBeTruthy();
    expect(screen.getByText(/pro-eur/u)).toBeTruthy();
    expect(screen.getByDisplayValue('prod_FR123')).toBeTruthy();
    expect(screen.getByDisplayValue('price_monthly_EUR')).toBeTruthy();
    expect(screen.getByText('evt_123456789')).toBeTruthy();
    expect(screen.getByText('invoice.payment_failed')).toBeTruthy();
  });

  it('formats webhook counts, attempts and dates while masking every raw API error detail', () => {
    const { container } = render(<AdminStripePage />);

    expect(screen.getByText('1 livraison non résolue')).toBeTruthy();
    expect(screen.getByText(/1.234 tentatives/u)).toBeTruthy();
    expect(screen.getByText(/1.*juin.*2026.*12:30/u)).toBeTruthy();
    expect(
      screen.getByText(
        'Le traitement a échoué. Utilisez l’ID d’événement Stripe pour retrouver cette livraison dans les journaux serveur.',
      ),
    ).toBeTruthy();
    expect(container.textContent).not.toContain('Raw English backend error');
    expect(container.textContent).not.toContain('sk_live_secret');
    expect(container.textContent).not.toContain('private database host');
  });

  it('keeps English as the default fallback surface', () => {
    routeState.loaderData.language = 'en';

    render(<AdminStripePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Stripe configuration' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Plan price IDs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Stripe configuration' })).toBeTruthy();
    expect(screen.getByText('1 unresolved delivery')).toBeTruthy();
  });

  it('renders localized success, page errors and password validation from structured codes', () => {
    routeState.actionData = { statusCode: 'configurationSaved' };

    const { unmount } = render(<AdminStripePage />);

    expect(screen.getByRole('status').textContent).toBe('Configuration Stripe enregistrée.');
    unmount();

    routeState.actionData = { errorCode: 'invalidConfiguration' };
    render(<AdminStripePage />);

    expect(
      screen.getByRole('alert', {
        name: '',
      }).textContent,
    ).toContain('La configuration Stripe a été refusée.');
    cleanup();

    routeState.actionData = { errorCode: 'passwordRequired', field: 'password' };
    render(<AdminStripePage />);

    expect(screen.getByText('Saisissez votre mot de passe pour confirmer cette modification.')).toBeTruthy();
  });

  it('shows explicit localized empty states for plans and webhook health', () => {
    routeState.loaderData.plans = [];
    routeState.loaderData.webhookFailures = [];

    render(<AdminStripePage />);

    expect(screen.getByText('Aucune offre de facturation n’est disponible.')).toBeTruthy();
    expect(screen.getByText('Toutes les livraisons ont été traitées')).toBeTruthy();
    expect(screen.getByText('Aucun webhook en échec.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Relancer toutes les livraisons en échec' })).toBeNull();
  });

  it('exposes distinct configuration, one-event and replay-all pending states', () => {
    routeState.navigation = { state: 'submitting', formData: new FormData() };

    const { unmount } = render(<AdminStripePage />);

    expect(
      (
        screen.getByRole('button', {
          name: 'Enregistrement de la configuration Stripe…',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    unmount();

    const oneReplay = new FormData();
    oneReplay.set('intent', 'replay-webhook');
    oneReplay.set('eventId', 'evt_123456789');
    routeState.navigation = { state: 'submitting', formData: oneReplay };
    render(<AdminStripePage />);

    expect((screen.getByRole('button', { name: 'Relance…' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    const allReplays = new FormData();
    allReplays.set('intent', 'replay-all-webhooks');
    routeState.navigation = { state: 'submitting', formData: allReplays };
    render(<AdminStripePage />);

    expect(
      (
        screen.getByRole('button', {
          name: 'Relance de toutes les livraisons en échec…',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('keeps long French copy and technical identifiers wrap-safe on narrow screens', () => {
    const { container } = render(<AdminStripePage />);
    const secretsHeading = screen.getByText('Secrets');
    const save = screen.getByRole('button', { name: 'Enregistrer la configuration Stripe' });
    const eventId = screen.getByText('evt_123456789');

    const maskedError = screen.getByText(
      'Le traitement a échoué. Utilisez l’ID d’événement Stripe pour retrouver cette livraison dans les journaux serveur.',
    );

    const table = screen.getByRole('table');

    expect(secretsHeading.parentElement?.className).toContain('flex-col');
    expect(secretsHeading.parentElement?.className).toContain('sm:flex-row');
    expect(save.parentElement?.className).toContain('[&_button]:!whitespace-normal');
    expect(eventId.className).toContain('break-all');
    expect(maskedError.className).toContain('break-words');
    expect(table.className).toContain('min-w-[');
    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect(container.innerHTML).not.toContain('truncate');
  });
});
