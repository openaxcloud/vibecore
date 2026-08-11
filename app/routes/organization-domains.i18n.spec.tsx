/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
  revalidatorState: 'idle',
}));

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
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState }),
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
  };
});

vi.mock('~/components/enterprise/EnterpriseFormPage', () => ({
  EnterpriseFormPage: ({
    title,
    description,
    status,
    error,
    children,
  }: {
    title: string;
    description: string;
    status?: string;
    error?: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {children}
    </main>
  ),
  PrimaryButton: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => (
    <button type="submit" disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} />,
  AsyncPanelError: ({ title, description, retryLabel }: { title: string; description: string; retryLabel: string }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button">{retryLabel}</button>
    </section>
  ),
}));

import OrganizationDomainsPage, { action, loader, meta } from './organization-domains';
import { formatOrganizationDomainsCopy, getOrganizationDomainsCopy } from '~/lib/i18n/catalogs/organization-domains';

function renderPage(loaderData: unknown, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;
  routeState.navigationState = 'idle';
  routeState.revalidatorState = 'idle';

  return render(<OrganizationDomainsPage />);
}

async function runAction(fields: Record<string, string>) {
  return (await action({
    request: new Request('https://e-code.ai/organization-domains?lang=fr', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
    params: {},
    context: {},
  })) as { data: { status?: string; error?: string }; init?: { status?: number } };
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  firstOrganizationMock.mockReset();
  revalidateMock.mockReset();
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
});

describe('organization domains i18n', () => {
  it('falls back to English and interpolates organization names without translating them', () => {
    const french = getOrganizationDomainsCopy('fr-FR');

    expect(getOrganizationDomainsCopy('de')['organizationDomains.actions.save']).toBe('Save settings');
    expect(
      formatOrganizationDomainsCopy(french['organizationDomains.description'], {
        organization: 'Northwind R&D',
      }),
    ).toContain('Northwind R&D');
  });

  it('renders the complete empty state in French', () => {
    renderPage({
      orgId: 'org-1',
      orgName: 'Northwind R&D',
      domains: [],
      loadError: false,
      loadErrorKind: null,
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'Domaines vérifiés' })).toBeTruthy();
    expect(screen.getByText(/domaines personnalisés de Northwind R&D/u)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ajouter un domaine' })).toBeTruthy();
    expect(screen.getByLabelText('Domaine')).toBeTruthy();
    expect(screen.getByText('Rediriger www')).toBeTruthy();
    expect(screen.getByText('Domaine générique')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ajouter le domaine' })).toBeTruthy();
    expect(screen.getByText(/Aucun domaine pour le moment/u)).toBeTruthy();
    expect(screen.queryByText('Add a domain')).toBeNull();
  });

  it('localizes domain controls while preserving DNS records and user domains', () => {
    renderPage({
      orgId: 'org-1',
      orgName: 'Northwind',
      domains: [
        {
          id: 'domain-1',
          organizationId: 'org-1',
          domain: 'app.customer.example',
          verificationToken: 'token-abc-123',
          redirectWww: true,
          wildcardEnabled: false,
          sslStatus: 'pending_dns',
          createdAt: '2026-08-04T00:00:00.000Z',
        },
      ],
      loadError: false,
      loadErrorKind: null,
      language: 'fr',
    });

    expect(screen.getByText('app.customer.example')).toBeTruthy();
    expect(screen.getByText('DNS en attente')).toBeTruthy();
    expect(screen.getByText('_vibecore.app.customer.example')).toBeTruthy();
    expect(screen.getByText('vibecore-domain-verification=token-abc-123')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vérifier le domaine' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer les paramètres' })).toBeTruthy();
    expect(screen.queryByText('Pending DNS')).toBeNull();
  });

  it('renders a localized recoverable permission error', () => {
    renderPage({
      orgId: 'org-1',
      orgName: 'Northwind',
      domains: [],
      loadError: true,
      loadErrorKind: 'permission',
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'La gestion des domaines est soumise à restriction' })).toBeTruthy();
    expect(screen.getByText(/Vous n’êtes pas autorisé/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger les domaines' })).toBeTruthy();
  });

  it('localizes action validation and success while preserving the submitted domain', async () => {
    apiRequestMock.mockResolvedValue({});

    const missing = await runAction({ intent: 'add', orgId: 'org-1', domain: '' });
    const added = await runAction({ intent: 'add', orgId: 'org-1', domain: 'APP.Customer.Example' });

    expect(missing.data.error).toBe('Saisissez un domaine, par exemple app.example.com.');
    expect(added.data.status).toBe(
      'Domaine app.customer.example ajouté. Publiez l’enregistrement TXT ci-dessous, puis vérifiez-le.',
    );
    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.any(Request),
      '/orgs/org-1/domains',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('masks raw API errors and localizes metadata and browser-detected loader language', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English domain failure' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const failed = await runAction({ intent: 'verify', orgId: 'org-1', domain: 'app.customer.example' });
    expect(failed.data.error).toBe('Impossible d’effectuer cette action sur le domaine.');
    expect(failed.data.error).not.toContain('Raw backend English domain failure');

    firstOrganizationMock.mockResolvedValue({ id: 'org-1', name: 'Northwind' });
    apiRequestMock.mockResolvedValue({ domains: [] });

    const loaded = (await loader({
      request: new Request('https://e-code.ai/organization-domains', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
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
    ).toEqual({ title: 'Domaines vérifiés - E-Code' });
  });
});
