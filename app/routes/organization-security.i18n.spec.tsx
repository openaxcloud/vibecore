/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, FormHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
const fetcherLoadMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
  revalidatorState: 'idle',
  fetcherState: 'idle',
  fetcherData: undefined as unknown,
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
    Form: ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>,
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState }),
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
    useFetcher: () => ({ state: routeState.fetcherState, data: routeState.fetcherData, load: fetcherLoadMock }),
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
  PrimaryButton: ({ children, disabled }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="submit" disabled={disabled}>
      {children}
    </button>
  ),
  TextField: ({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} />,
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
      <h2>{title}</h2>
      <p>{description}</p>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </section>
  ),
}));

import OrganizationSecurityPage, { action, loader } from './organization-security';
import {
  formatOrganizationSecurityCopy,
  formatOrganizationSecurityNumber,
  getOrganizationSecurityCopy,
  organizationSecurityEn,
  organizationSecurityFr,
} from '~/lib/i18n/catalogs/organization-security';

const frenchLoaderData = {
  orgId: 'org-user-owned',
  orgName: 'Northwind R&D',
  settings: {
    organizationId: 'org-user-owned',
    ipAllowlist: ['203.0.113.10', '2001:db8::1'],
    sessionDurationMinutes: 43200,
    requireMfaForAdmins: true,
    dataRetentionDays: 365,
    legalHoldEnabled: false,
    updatedAt: '2026-08-04T12:00:00.000Z',
  },
  loadError: null,
  loadErrorKind: null,
  capabilities: {
    version: '2026-08-27.1',
    plan: 'enterprise',
    capabilities: [
      {
        key: 'security-center',
        entitled: true,
        provisioned: true,
        state: 'ready',
        surface: 'security-center-events',
      },
    ],
  },
  capabilitiesErrorKind: null,
  securityEvents: [],
  securityOpenCount: 0,
  securityNextCursor: null,
  securityErrorKind: null,
  language: 'fr',
};

function renderPage(loaderData: unknown = frenchLoaderData, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;

  return render(<OrganizationSecurityPage />);
}

async function runAction(fields: Record<string, string>) {
  return (await action({
    request: new Request('https://e-code.ai/organization-security?lang=fr', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
    params: {},
    context: {},
  })) as { data: { status?: string; error?: string }; init?: { status?: number } };
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  firstOrganizationMock.mockReset();
  revalidateMock.mockReset();
  fetcherLoadMock.mockReset();
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
  routeState.navigationState = 'idle';
  routeState.revalidatorState = 'idle';
  routeState.fetcherState = 'idle';
  routeState.fetcherData = undefined;
});

describe('organization security i18n', () => {
  it('keeps catalog parity, interpolation, French numbers, and English fallback', () => {
    expect(Object.keys(organizationSecurityFr).sort()).toEqual(Object.keys(organizationSecurityEn).sort());

    for (const key of Object.keys(organizationSecurityEn) as Array<keyof typeof organizationSecurityEn>) {
      expect(organizationSecurityEn[key].trim().length, key).toBeGreaterThan(0);
      expect(organizationSecurityFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(organizationSecurityFr[key]), key).toEqual(
        interpolationTokens(organizationSecurityEn[key]),
      );
    }

    const french = getOrganizationSecurityCopy('fr-FR');

    expect(getOrganizationSecurityCopy('de')['organizationSecurity.actions.save']).toBe('Save security settings');
    expect(formatOrganizationSecurityNumber(525600, 'fr')).toMatch(/^525[\s\u202f]600$/u);
    expect(
      formatOrganizationSecurityCopy(french['organizationSecurity.description'], {
        organization: 'Northwind R&D',
      }),
    ).toContain('Northwind R&D');
  });

  it('renders the complete policy in French while preserving organization, IP, and numeric values', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Sécurité de l’organisation' })).toBeTruthy();
    expect(screen.getByText(/Politique de sécurité de référence pour Northwind R&D/u)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Liste d’adresses IP autorisées' })).toBeTruthy();
    expect(screen.getByLabelText('Adresse IP ou bloc CIDR').getAttribute('placeholder')).toBe(
      '203.0.113.10 ou 198.51.100.0/24',
    );
    expect(screen.getByText('203.0.113.10')).toBeTruthy();
    expect(screen.getByText('2001:db8::1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer 203.0.113.10' })).toBeTruthy();
    expect(screen.getByLabelText(/Durée de session \(minutes, 5–525[\s\u202f]600\)/u)).toBeTruthy();
    expect(screen.getByLabelText(/Conservation des données \(jours, 1–3[\s\u202f]650\)/u)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Exiger la MFA pour les administrateurs/u })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Gel juridique/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer les paramètres de sécurité' })).toBeTruthy();
    expect(screen.getByText(/Dernière mise à jour.*4 août 2026/u)).toBeTruthy();
    expect(screen.queryByText('IP allowlist')).toBeNull();

    const addButton = screen.getByRole('button', { name: 'Ajouter' });
    const removeButton = screen.getByRole('button', { name: 'Retirer 203.0.113.10' });

    expect(addButton.className).toContain('w-full');
    expect(addButton.className).toContain('sm:w-auto');
    expect(removeButton.parentElement?.className).toContain('flex-col');
    expect(removeButton.parentElement?.className).toContain('sm:flex-row');
    expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('false');
  });

  it('localizes interactive allowlist validation and legal-hold state changes', () => {
    renderPage({
      ...frenchLoaderData,
      settings: { ...frenchLoaderData.settings, ipAllowlist: [], requireMfaForAdmins: false },
    });

    const input = screen.getByLabelText('Adresse IP ou bloc CIDR');

    fireEvent.change(input, { target: { value: 'invalid-user-entry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));

    expect(screen.getByRole('alert').textContent).toContain('Saisissez une adresse IP ou un bloc CIDR valide');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: '198.51.100.0/24' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('198.51.100.0/24')).toBeTruthy();
    expect((document.querySelector('input[name="ipAllowlist"]') as HTMLInputElement).value).toBe('198.51.100.0/24');

    fireEvent.change(input, { target: { value: '198.51.100.0/24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Cette entrée figure déjà dans la liste des adresses autorisées.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retirer 198.51.100.0/24' }));
    expect(screen.getByText('Aucune restriction — toutes les adresses IP sont autorisées.')).toBeTruthy();

    const legalHold = screen.getByRole('checkbox', { name: /Gel juridique/u });

    fireEvent.click(legalHold);
    expect(screen.getByRole('status').textContent).toContain('Tant que le gel juridique est actif');
    expect(screen.getByText(/Le gel juridique est ACTIF/u)).toBeTruthy();
  });

  it('renders localized recoverable permission and loading states', () => {
    routeState.revalidatorState = 'idle';

    const { rerender } = renderPage({
      ...frenchLoaderData,
      loadError: 'safe localized loader error',
      loadErrorKind: 'permission',
    });

    expect(screen.getByRole('heading', { name: 'Les paramètres de sécurité sont soumis à restriction' })).toBeTruthy();
    expect(screen.getByText(/Votre rôle ne permet pas de gérer/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recharger les paramètres de sécurité' }));
    expect(revalidateMock).toHaveBeenCalledOnce();

    routeState.revalidatorState = 'loading';

    rerender(<OrganizationSecurityPage />);
    expect(screen.getByLabelText('Chargement des paramètres de sécurité de l’organisation')).toBeTruthy();
  });

  it('localizes busy and action status states', () => {
    routeState.navigationState = 'submitting';
    renderPage(frenchLoaderData, { status: 'Paramètres de sécurité de l’organisation enregistrés.' });

    const saveButton = screen.getByRole('button', { name: 'Enregistrement des paramètres de sécurité…' });

    expect(saveButton.hasAttribute('disabled')).toBe(true);
    expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Paramètres de sécurité de l’organisation enregistrés.');
  });

  it('loads the next Security Center cursor through a touch-safe localized control', () => {
    renderPage({
      ...frenchLoaderData,
      securityEvents: [
        {
          id: 'event-1',
          action: 'security.session.revoked',
          resourceType: 'session',
          createdAt: '2026-08-27T12:00:00.000Z',
          resolved: false,
        },
      ],
      securityNextCursor: 'createdAt::event/id',
    });

    const loadMore = screen.getByRole('button', { name: 'Charger plus d’événements' });
    expect(loadMore.className).toContain('min-h-[44px]');
    fireEvent.click(loadMore);
    expect(fetcherLoadMock).toHaveBeenCalledWith(
      '/organization-security?securityCenter=1&cursor=createdAt%3A%3Aevent%2Fid&lang=fr',
    );
  });

  it('localizes action validation and success while preserving submitted values', async () => {
    const missingOrganization = await runAction({});
    const invalidIp = await runAction({ orgId: 'org-user-owned', ipAllowlist: 'invalid-user-entry' });

    const invalidSession = await runAction({
      orgId: 'org-user-owned',
      ipAllowlist: '',
      sessionDurationMinutes: '1',
    });

    expect(missingOrganization.data.error).toBe(
      'Votre organisation est indisponible. Rechargez la page, puis réessayez.',
    );
    expect(invalidIp.data.error).toBe('Adresse IP ou bloc CIDR invalide : invalid-user-entry');
    expect(invalidSession.data.error).toMatch(/entre 5 et 525[\s\u202f]600 minutes/u);

    apiRequestMock.mockResolvedValue({});

    const saved = await runAction({
      orgId: 'org-user-owned',
      ipAllowlist: '203.0.113.10\n2001:db8::1',
      sessionDurationMinutes: '60',
      dataRetentionDays: '365',
      requireMfaForAdmins: 'on',
      legalHoldEnabled: 'on',
    });

    expect(saved.data.status).toBe('Paramètres de sécurité de l’organisation enregistrés.');
    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.any(Request),
      '/orgs/org-user-owned/enterprise-settings',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          ipAllowlist: ['203.0.113.10', '2001:db8::1'],
          sessionDurationMinutes: 60,
          dataRetentionDays: 365,
          requireMfaForAdmins: true,
          legalHoldEnabled: true,
        }),
      }),
    );
  });

  it('masks raw API errors in actions and loader responses', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English policy failure secret=123' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const failed = await runAction({ orgId: 'org-user-owned', ipAllowlist: '' });

    expect(failed.data.error).toBe('Impossible d’enregistrer les paramètres de sécurité.');
    expect(failed.data.error).not.toContain('Raw backend English policy failure');

    firstOrganizationMock.mockResolvedValue({ id: 'org-user-owned', name: 'Northwind R&D' });
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English loader failure secret=456' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const loaded = (await loader({
      request: new Request('https://e-code.ai/organization-security', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
      params: {},
      context: {},
    })) as { data: { language: string; loadError: string; orgName: string } };

    expect(loaded.data.language).toBe('fr');
    expect(loaded.data.orgName).toBe('Northwind R&D');
    expect(loaded.data.loadError).toBe('Les paramètres de sécurité sont temporairement indisponibles.');
    expect(loaded.data.loadError).not.toContain('Raw backend English loader failure');
  });

  it('loads real capability and Security Center contracts without inventing unavailable surfaces', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-user-owned', name: 'Northwind R&D' });
    apiRequestMock
      .mockResolvedValueOnce({ settings: frenchLoaderData.settings })
      .mockResolvedValueOnce({
        version: '2026-08-27.1',
        plan: 'enterprise',
        capabilities: [
          {
            key: 'single-tenant',
            entitled: true,
            provisioned: false,
            state: 'operator-required',
            surface: null,
          },
          {
            key: 'security-center',
            entitled: true,
            provisioned: true,
            state: 'ready',
            surface: 'security-center-events',
          },
        ],
      })
      .mockResolvedValueOnce({
        events: [
          {
            id: 'event-1',
            organizationId: 'org-user-owned',
            action: 'security.session.revoked',
            resourceType: 'session',
            createdAt: '2026-08-27T12:00:00.000Z',
            resolved: false,
          },
        ],
        openCount: 1,
        nextCursor: 'opaque-next-cursor',
        limit: 25,
      });

    const loaded = (await loader({
      request: new Request('https://e-code.ai/organization-security?lang=fr'),
      params: {},
      context: {},
    })) as {
      data: {
        capabilities: { capabilities: Array<{ key: string; state: string }> };
        securityEvents: Array<{ id: string }>;
        securityOpenCount: number;
        securityNextCursor: string | null;
        securityErrorKind: string | null;
      };
    };

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, expect.any(Request), '/orgs/org-user-owned/enterprise-settings');
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.any(Request),
      '/orgs/org-user-owned/enterprise-capabilities',
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      expect.any(Request),
      '/orgs/org-user-owned/security-center/events?limit=25',
    );
    expect(loaded.data.capabilities.capabilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'single-tenant', state: 'operator-required' })]),
    );
    expect(loaded.data.securityEvents).toEqual([expect.objectContaining({ id: 'event-1' })]);
    expect(loaded.data.securityOpenCount).toBe(1);
    expect(loaded.data.securityNextCursor).toBe('opaque-next-cursor');
    expect(loaded.data.securityErrorKind).toBeNull();
  });

  it('does not call the Security Center feed until the capability is actually ready', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-user-owned', name: 'Northwind R&D' });
    apiRequestMock.mockResolvedValueOnce({ settings: frenchLoaderData.settings }).mockResolvedValueOnce({
      version: '2026-08-27.1',
      plan: 'enterprise',
      capabilities: [
        {
          key: 'security-center',
          entitled: true,
          provisioned: false,
          state: 'operator-required',
          surface: null,
        },
      ],
    });

    const loaded = (await loader({
      request: new Request('https://e-code.ai/organization-security'),
      params: {},
      context: {},
    })) as { data: { securityEvents: unknown[]; securityErrorKind: string | null } };

    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(loaded.data.securityEvents).toEqual([]);
    expect(loaded.data.securityErrorKind).toBeNull();
  });

  it('forwards opaque Security Center cursors through the resource branch without interpreting them', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-user-owned', name: 'Northwind R&D' });
    apiRequestMock.mockResolvedValueOnce({
      events: [],
      openCount: 0,
      nextCursor: null,
      limit: 25,
    });

    const loaded = (await loader({
      request: new Request(
        'https://e-code.ai/organization-security?securityCenter=1&cursor=createdAt%3A%3Aid%2Fopaque&lang=fr',
      ),
      params: {},
      context: {},
    })) as { data: { page: { nextCursor: string | null }; errorKind: string | null } };

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.any(Request),
      '/orgs/org-user-owned/security-center/events?limit=25&cursor=createdAt%3A%3Aid%2Fopaque',
    );
    expect(loaded.data).toEqual({
      page: { events: [], openCount: 0, nextCursor: null, limit: 25 },
      errorKind: null,
    });
  });
});
