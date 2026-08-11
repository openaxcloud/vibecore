/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationMock = vi.hoisted(() => vi.fn());
const routeState = vi.hoisted(() => ({ actionData: undefined as unknown, loaderData: undefined as unknown }));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationMock(...args),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({
      children,
      className,
      onSubmit,
    }: {
      children: ReactNode;
      className?: string;
      onSubmit?: FormEventHandler<HTMLFormElement>;
    }) => (
      <form className={className} onSubmit={onSubmit}>
        {children}
      </form>
    ),
    Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
  };
});

vi.mock('~/components/enterprise/EnterpriseFormPage', () => ({
  EnterpriseFormPage: ({
    title,
    description,
    error,
    children,
  }: {
    title: string;
    description: string;
    error?: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {error ? <p role="alert">{error}</p> : null}
      {children}
    </main>
  ),
}));

import UpgradePage, { action, loader, meta } from './upgrade';
import { formatUpgradeAmount, getUpgradeCopy, upgradeLimitLabel } from '~/lib/i18n/catalogs/upgrade';

function renderPage(loaderData: unknown, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;

  return render(<UpgradePage />);
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  firstOrganizationMock.mockReset();
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
});

describe('upgrade i18n', () => {
  it('formats French currency and plurals and falls back to English', () => {
    const french = getUpgradeCopy('fr-FR');

    expect(getUpgradeCopy('de')['upgrade.actions.current']).toBe('Current plan');
    expect(formatUpgradeAmount(1999, 'fr')).toBe(
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
      }).format(19.99),
    );
    expect(upgradeLimitLabel(french, 'fr', 'projects', 1)).toBe('1 projet');
    expect(upgradeLimitLabel(french, 'fr', 'projects', 2)).toBe('2 projets');
  });

  it('renders a localized restricted state', () => {
    renderPage({
      suggestedPlan: 'pro',
      interval: 'monthly',
      plans: [],
      currentPlanKey: null,
      subscriptionStatus: null,
      billingAccessLimited: true,
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'Changer de formule' })).toBeTruthy();
    expect(screen.getByText(/réservés aux propriétaires de l’organisation/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'page Facturation' }).getAttribute('href')).toBe('/billing');
    expect(screen.queryByText('Upgrade')).toBeNull();
  });

  it('renders plan controls in French while preserving plan names and checkout identifiers', () => {
    renderPage({
      suggestedPlan: 'pro',
      interval: 'annual',
      plans: [
        {
          key: 'pro',
          name: 'Core',
          monthlyCents: 1999,
          annualAvailable: true,
          limits: {
            'projects.count': 10,
            'workspaces.active': 1,
            'team.members': 4,
            'ai.messages': 2000,
            'storage.gb': 25,
          },
        },
        {
          key: 'enterprise',
          name: 'Enterprise',
          monthlyCents: 0,
          annualAvailable: false,
          limits: {},
        },
      ],
      currentPlanKey: 'free',
      subscriptionStatus: null,
      billingAccessLimited: false,
      language: 'fr',
    });

    expect(screen.getByText('Core')).toBeTruthy();
    expect(screen.getByText('Enterprise')).toBeTruthy();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' && element.textContent?.startsWith(formatUpgradeAmount(1999, 'fr')) === true,
      ),
    ).toBeTruthy();
    expect(screen.getByText('10 projets')).toBeTruthy();
    expect(screen.getByText('1 espace de travail actif')).toBeTruthy();
    expect(screen.getByText(/2\s000 messages IA \/ mois/u)).toBeTruthy();
    expect(screen.getByText('25 Go de stockage')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Mensuelle' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Annuelle/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choisir la formule Core' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Contacter l’équipe commerciale' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Contacter l’équipe commerciale' })[0]?.getAttribute('href')).toBe(
      '/contact-sales',
    );
    expect(screen.queryByText('Suggested')).toBeNull();
  });

  it('masks raw checkout errors in French', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-1' });
    apiRequestMock.mockRejectedValue(
      new Response(JSON.stringify({ error: 'Raw backend English plan failure' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = (await action({
      request: new Request('https://e-code.ai/upgrade?lang=fr', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ planKey: 'pro', interval: 'monthly' }).toString(),
      }),
      params: {},
      context: {},
    })) as { data: { error?: string }; init?: { status?: number } };

    expect(result.data.error).toBe('Le paiement est indisponible pour le moment. Réessayez ultérieurement.');
    expect(result.data.error).not.toContain('Raw backend English plan failure');
    expect(result.init?.status).toBe(409);
  });

  it('returns browser-detected locale from the loader and localizes metadata', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-1' });
    apiRequestMock
      .mockResolvedValueOnce({ plan: { key: 'free', name: 'Free', monthlyCents: 0 }, subscription: null })
      .mockResolvedValueOnce({ plans: [] });

    const loaded = (await loader({
      request: new Request('https://e-code.ai/upgrade', { headers: { 'accept-language': 'fr-FR,fr;q=0.9' } }),
      params: {},
      context: {},
    })) as { data: { language: string } };

    expect(loaded.data.language).toBe('fr');
    expect(
      meta({
        data: undefined,
        location: {} as never,
        params: {},
        matches: [{ id: 'root', data: { language: 'fr' } }] as never,
      })?.[0],
    ).toEqual({ title: 'Changer de formule - E-Code' });
  });
});
