/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationOrNullMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  navigationState: 'idle',
  navigationFormData: undefined as FormData | undefined,
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNullMock(...args),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({ children, className }: { children: ReactNode; className?: string }) => (
      <form className={className}>{children}</form>
    ),
    useActionData: () => routeState.actionData,
    useNavigation: () => ({
      state: routeState.navigationState,
      formData: routeState.navigationFormData,
    }),
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

import {
  action as planAction,
  loader as planLoader,
  meta as planMeta,
  default as PlanComparisonPage,
} from './plan-comparison';
import { loader as quotaLoader, meta as quotaMeta, default as QuotaExceededPage } from './quota-exceeded';
import { formatPlanQuotaCopy, getPlanQuotaCopy, planQuotaEn, planQuotaFr } from '~/lib/i18n/catalogs/plan-quota';
import { createI18nInstance } from '~/lib/i18n/runtime';

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

function responseHeaders(result: unknown): Headers {
  if (result && typeof result === 'object' && 'init' in result) {
    return new Headers((result as { init?: { headers?: HeadersInit } }).init?.headers);
  }

  return result instanceof Response ? result.headers : new Headers();
}

function actionRequest(planKey: string, language = 'fr-FR'): Request {
  return new Request('https://e-code.ai/plan-comparison', {
    method: 'POST',
    headers: {
      'accept-language': language,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ planKey }).toString(),
  });
}

afterEach(() => {
  cleanup();
  routeState.actionData = undefined;
  routeState.navigationState = 'idle';
  routeState.navigationFormData = undefined;
  apiRequestMock.mockReset();
  firstOrganizationOrNullMock.mockReset();
  vi.restoreAllMocks();
});

describe('plan and quota catalog', () => {
  it('keeps strict EN/FR parity, an English fallback and stable product plan names', () => {
    expect(Object.keys(planQuotaFr).sort()).toEqual(Object.keys(planQuotaEn).sort());
    expect(getPlanQuotaCopy('de')['planComparison.page.title']).toBe('Compare plans');
    expect(getPlanQuotaCopy('fr-CA')['planComparison.page.title']).toBe('Comparer les offres');

    for (const key of ['starter', 'core', 'pro', 'enterprise'] as const) {
      expect(getPlanQuotaCopy('fr')[`planComparison.plan.${key}.name`]).toBe(
        getPlanQuotaCopy('en')[`planComparison.plan.${key}.name`],
      );
    }

    expect(formatPlanQuotaCopy('Choisir {plan}', { plan: 'Core' })).toBe('Choisir Core');
  });
});

describe('localized plan comparison surface', () => {
  it('renders professional French and switches every customer-facing string live', async () => {
    routeState.actionData = { errorCode: 'checkoutUnavailable' };

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PlanComparisonPage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Comparer les offres' })).toBeTruthy();
    expect(screen.getByText('Modèles publics et petits espaces de travail.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Choisir Starter' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choisir Core' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choisir Pro' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Contacter l’équipe commerciale' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'Le paiement est indisponible pour le moment. Réessayez ultérieurement.',
    );
    expect(screen.getByRole('link', { name: 'Choisir Starter' }).className).toContain('min-h-11');
    expect(document.body.textContent).not.toMatch(/Compare plans|Choose |Talk to sales|Checkout is unavailable/u);

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Compare plans' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose Core' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Talk to sales' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Checkout is unavailable right now. Try again later.');
  });

  it('announces and disables checkout actions while a selected plan is submitting', () => {
    routeState.navigationState = 'submitting';
    routeState.navigationFormData = new FormData();
    routeState.navigationFormData.set('planKey', 'pro');

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <PlanComparisonPage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    const activeButton = screen.getByRole('button', { name: 'Ouverture du paiement…' });

    expect((activeButton as HTMLButtonElement).disabled).toBe(true);
    expect(activeButton.getAttribute('aria-busy')).toBe('true');
    expect(activeButton.className).toContain('min-h-11');
    expect(screen.getByRole('status').textContent).toBe('Ouverture du paiement sécurisé pour l’offre Core');
  });
});

describe('localized quota surface', () => {
  it('renders French, switches live and keeps both mobile actions at least 44px high', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <QuotaExceededPage />
        </MemoryRouter>
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Limite d’utilisation atteinte' })).toBeTruthy();
    expect(screen.getByText(/administrateur de l’organisation/u)).toBeTruthy();

    const upgrade = screen.getByRole('link', { name: 'Changer d’offre' });
    const compare = screen.getByRole('link', { name: 'Comparer les offres' });

    expect(upgrade.className).toContain('min-h-11');
    expect(upgrade.className).toContain('w-full');
    expect(compare.className).toContain('min-h-11');
    expect(compare.className).toContain('w-full');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Usage limit reached' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Upgrade plan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compare plans' })).toBeTruthy();
  });
});

describe('plan and quota locale contracts', () => {
  it('detects a first-visit French locale and sends language persistence headers from both loaders', () => {
    for (const routeLoader of [planLoader, quotaLoader]) {
      const result = routeLoader({
        request: new Request('https://e-code.ai/example', {
          headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
        }),
      } as never);

      const headers = responseHeaders(result);

      expect(readData<{ language: string }>(result).language).toBe('fr');
      expect(headers.get('Content-Language')).toBe('fr');
      expect(headers.get('Vary')).toBe('Cookie, Accept-Language');
      expect(headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
    }
  });

  it('emits localized descriptions, canonical URLs, Open Graph, Twitter and hreflang metadata', () => {
    const cases = [
      [planMeta, 'Comparer les offres - E-Code', 'https://e-code.ai/plan-comparison'],
      [quotaMeta, 'Limite d’utilisation atteinte - E-Code', 'https://e-code.ai/quota-exceeded'],
    ] as const;

    for (const [routeMeta, title, canonical] of cases) {
      const tags = routeMeta({ data: { language: 'fr' }, matches: [] } as never);

      expect(tags).toContainEqual({ title });
      expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
      expect(tags).toContainEqual({ property: 'og:url', content: canonical });
      expect(tags).toContainEqual({ name: 'twitter:title', content: title });
      expect(tags).toContainEqual({ tagName: 'link', rel: 'canonical', href: canonical });
      expect(tags).toContainEqual({
        tagName: 'link',
        rel: 'alternate',
        hrefLang: 'fr',
        href: `${canonical}?lang=fr`,
      });
      expect(tags).toContainEqual({
        tagName: 'link',
        rel: 'alternate',
        hrefLang: 'en',
        href: `${canonical}?lang=en`,
      });
    }
  });

  it('returns stable action codes and never exposes an upstream API message', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', slug: 'acme' });
    apiRequestMock.mockRejectedValue(
      new Response(JSON.stringify({ error: 'Internal Stripe account secret was rejected.' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await planAction({ request: actionRequest('pro') } as never);
    const payload = readData(result);

    expect(payload).toEqual({ errorCode: 'checkoutUnavailable' });
    expect(JSON.stringify(payload)).not.toContain('Internal Stripe');
    expect(responseHeaders(result).get('Content-Language')).toBe('fr');
  });

  it('validates checkout plans before API access and reports a missing organization safely', async () => {
    const invalidResult = await planAction({ request: actionRequest('enterprise') } as never);

    expect(readData(invalidResult)).toEqual({ errorCode: 'invalidPlan' });
    expect(firstOrganizationOrNullMock).not.toHaveBeenCalled();

    firstOrganizationOrNullMock.mockResolvedValue(null);

    const noOrganizationResult = await planAction({ request: actionRequest('team') } as never);

    expect(readData(noOrganizationResult)).toEqual({ errorCode: 'organizationMissing' });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('preserves the backend plan key and locale headers on a successful checkout redirect', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', slug: 'acme' });
    apiRequestMock.mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/session/test' });

    const result = await planAction({ request: actionRequest('pro') } as never);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('https://checkout.stripe.com/session/test');
    expect((result as Response).headers.get('Content-Language')).toBe('fr');
    expect(JSON.parse(String(apiRequestMock.mock.calls[0]?.[2]?.body))).toMatchObject({ planKey: 'pro' });
  });

  it('rethrows only reauthentication redirects', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', slug: 'acme' });

    const reauthentication = new Response(null, {
      status: 302,
      headers: { Location: '/login?returnTo=%2Fplan-comparison' },
    });
    apiRequestMock.mockRejectedValue(reauthentication);

    await expect(planAction({ request: actionRequest('team') } as never)).rejects.toBe(reauthentication);
  });

  it('has zero hardcoded visible-copy findings in both routes', async () => {
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');

    for (const path of ['app/routes/plan-comparison.tsx', 'app/routes/quota-exceeded.tsx']) {
      const result = scanSource(readFileSync(path, 'utf8'), path);

      expect(result.parseErrors).toEqual([]);
      expect(result.findings).toEqual([]);
    }
  });
});
