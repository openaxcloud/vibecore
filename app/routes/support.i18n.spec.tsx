/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const firstOrganizationMock = vi.hoisted(() => vi.fn());
const firstOrganizationOrNullMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  actionData: undefined as unknown,
  navigationState: 'idle',
  formMethod: undefined as string | undefined,
  revalidatorState: 'idle',
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    firstOrganization: (...args: unknown[]) => firstOrganizationMock(...args),
    firstOrganizationOrNull: (...args: unknown[]) => firstOrganizationOrNullMock(...args),
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
    useNavigation: () => ({ state: routeState.navigationState, formMethod: routeState.formMethod }),
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

vi.mock('~/components/ui/RelativeTime', () => ({
  RelativeTime: ({ prefix }: { prefix?: string }) => <time>{prefix} 4 août 2026</time>,
}));

import SupportPage, { action, loader, meta } from './support';
import { formatSupportResponseTarget, getSupportCopy, supportActionErrorMessage } from '~/lib/i18n/catalogs/support';

function renderPage(loaderData: unknown, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;
  routeState.navigationState = 'idle';
  routeState.formMethod = undefined;
  routeState.revalidatorState = 'idle';

  return render(<SupportPage />);
}

async function runAction(fields: Record<string, string>, language = 'fr') {
  return (await action({
    request: new Request(`https://e-code.ai/support?lang=${language}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
    params: {},
    context: {},
  })) as { data: { errorCode?: string }; init?: { status?: number } };
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  firstOrganizationMock.mockReset();
  firstOrganizationOrNullMock.mockReset();
  revalidateMock.mockReset();
  routeState.loaderData = undefined;
  routeState.actionData = undefined;
});

describe('support i18n', () => {
  it('renders the complete French surface while preserving ticket subjects', () => {
    renderPage({
      organization: { id: 'org-1', name: 'Northwind' },
      tickets: [
        {
          id: 'ticket-1',
          subject: 'Erreur 502 sur api.customer.example',
          category: 'runtime',
          status: 'OPEN',
          createdAt: '2026-08-04T09:30:00.000Z',
        },
        {
          id: 'ticket-2',
          subject: 'Accès au compte de production',
          category: 'account',
          status: 'RESOLVED',
        },
      ],
      currentTier: 'pro',
      supportAccessLimited: null,
      language: 'fr',
    });

    expect(screen.getByRole('heading', { name: 'Assistance' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vos demandes en cours' })).toBeTruthy();
    expect(screen.getByText('Erreur 502 sur api.customer.example')).toBeTruthy();
    expect(screen.getByText('Environnement d’exécution et espaces de travail ·', { exact: false })).toBeTruthy();
    expect(screen.getByText('Ouverte', { selector: 'div' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Demandes résolues et fermées' })).toBeTruthy();
    expect(screen.getByLabelText('Objet')).toBeTruthy();
    expect(screen.getByLabelText('Catégorie')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir une demande' })).toBeTruthy();
    expect(screen.getByText('8 heures ouvrées')).toBeTruthy();
    expect(screen.getByText('Votre forfait')).toBeTruthy();
    expect(screen.queryByText('Your open tickets')).toBeNull();
  });

  it('renders localized recoverable loading and action errors', () => {
    renderPage(
      {
        organization: null,
        tickets: [],
        currentTier: null,
        supportAccessLimited: 'safe-state',
        language: 'fr',
      },
      { errorCode: 'rejected' },
    );

    expect(screen.getByText('Impossible d’ouvrir votre demande. Vérifiez le formulaire, puis réessayez.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Impossible de charger les demandes d’assistance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger les demandes' })).toBeTruthy();
  });

  it('detects French in the loader and never exposes an upstream English error', async () => {
    firstOrganizationMock.mockResolvedValue({ id: 'org-1', name: 'Northwind' });
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English support outage' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const data = (await loader({
      request: new Request('https://e-code.ai/support', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
      params: {},
      context: {},
    })) as { language: string; supportAccessLimited: string };

    expect(data.language).toBe('fr');
    expect(data.supportAccessLimited).toBe('Impossible de charger les demandes d’assistance');
    expect(data.supportAccessLimited).not.toContain('Raw backend English support outage');
  });

  it('validates actions and returns stable error codes instead of raw API messages', async () => {
    firstOrganizationOrNullMock.mockResolvedValue({ id: 'org-1', name: 'Northwind' });

    const missingSubject = await runAction({ subject: '', category: 'runtime' });
    const invalidCategory = await runAction({ subject: 'Besoin d’aide', category: 'made-up' });

    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English validation detail' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const rejected = await runAction({ subject: 'Besoin d’aide', category: 'security' });

    expect(missingSubject.data.errorCode).toBe('subjectRequired');
    expect(invalidCategory.data.errorCode).toBe('invalidCategory');
    expect(rejected.data.errorCode).toBe('rejected');
    expect(JSON.stringify(rejected.data)).not.toContain('Raw backend English validation detail');
    expect(supportActionErrorMessage(rejected.data.errorCode as 'rejected', 'fr')).toBe(
      'Impossible d’ouvrir votre demande. Vérifiez le formulaire, puis réessayez.',
    );
  });

  it('falls back to English, formats French plurals and localizes metadata', () => {
    expect(getSupportCopy('de')['support.form.submit']).toBe('Open ticket');
    expect(formatSupportResponseTarget(1, 'businessDay', 'fr')).toBe('1 jour ouvré');
    expect(formatSupportResponseTarget(2, 'businessDay', 'fr')).toBe('2 jours ouvrés');
    expect(
      meta({
        data: undefined,
        location: {} as never,
        params: {},
        matches: [{ id: 'root', data: { language: 'fr' } }] as never,
      })?.[0],
    ).toEqual({ title: 'Assistance - E-Code' });
  });
});
