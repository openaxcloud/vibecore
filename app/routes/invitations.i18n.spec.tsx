/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import InvitationsPage, { ErrorBoundary, meta } from './invitations';
import {
  formatInvitationsDateTime,
  formatInvitationsPlural,
  getInvitationsCopy,
  invitationActionErrorMessage,
  invitationActionStatusMessage,
  invitationRoleLabel,
  invitationsEn,
  invitationsFr,
  invitationsRouteErrorKind,
} from '~/lib/i18n/catalogs/invitations';

const routerMocks = vi.hoisted(() => ({
  actionData: undefined as Record<string, unknown> | undefined,
  loaderData: {} as Record<string, unknown>,
  location: { pathname: '/invitations', search: '' },
  navigation: {
    state: 'idle' as 'idle' | 'loading' | 'submitting',
    formData: undefined as FormData | undefined,
  },
  revalidate: vi.fn(),
  revalidatorState: 'idle' as 'idle' | 'loading',
  rootData: { language: 'fr' } as { language?: string },
  routeError: undefined as unknown,
  submit: vi.fn(),
}));

let language = 'fr';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language, resolvedLanguage: language },
    t: (key: string) => key,
  }),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>,
    useActionData: () => routerMocks.actionData,
    useLoaderData: () => routerMocks.loaderData,
    useLocation: () => routerMocks.location,
    useNavigation: () => routerMocks.navigation,
    useRevalidator: () => ({ state: routerMocks.revalidatorState, revalidate: routerMocks.revalidate }),
    useRouteError: () => routerMocks.routeError,
    useRouteLoaderData: () => routerMocks.rootData,
    useSubmit: () => routerMocks.submit,
  };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({
    title,
    description,
    actions,
    children,
  }: {
    title: string;
    description: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {children}
    </main>
  ),
  LinkButton: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => (
    <section role="status" aria-label={label} aria-busy="true">
      {label}
    </section>
  ),
  AsyncPanelError: ({
    title,
    description,
    onRetry,
    retryLabel,
  }: {
    title: string;
    description: string;
    onRetry?: () => void;
    retryLabel?: string;
  }) => (
    <section role="alert">
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </section>
  ),
}));

vi.mock('~/components/ui/Dialog', () => ({
  DialogRoot: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <>{children}</> : null),
  Dialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const NOW = Date.parse('2026-08-05T12:00:00.000Z');

function baseLoaderData(overrides: Record<string, unknown> = {}) {
  return {
    language: 'fr',
    orgId: 'org-1',
    canManageInvitations: true,
    loadErrorCode: null,
    nowMs: NOW,
    roles: [
      { key: 'viewer', name: 'viewer', system: true },
      { key: 'member', name: 'member', system: true },
      { key: 'editor', name: 'editor', system: true },
      { key: 'admin', name: 'admin', system: true },
      { key: 'owner', name: 'owner', system: true },
      { key: 'release-captain', name: 'Release Captain', system: false },
    ],
    invitations: [
      {
        id: 'invite-pending',
        email: 'future@example.com',
        roleKey: 'release-captain',
        expiresAt: '2026-08-20T12:00:00.000Z',
      },
      {
        id: 'invite-accepted',
        email: 'accepted@example.com',
        roleKey: 'admin',
        acceptedAt: '2026-08-04T12:00:00.000Z',
        expiresAt: '2026-08-20T12:00:00.000Z',
      },
      {
        id: 'invite-expired',
        email: 'expired@example.com',
        roleKey: 'viewer',
        expiresAt: '2026-08-01T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('invitations flat EN/FR catalog', () => {
  it('keeps complete parity and falls back to English', () => {
    expect(Object.keys(invitationsFr).sort()).toEqual(Object.keys(invitationsEn).sort());
    expect(getInvitationsCopy('fr-CA')['invitations.form.create']).toBe('Créer l’invitation');
    expect(getInvitationsCopy('de-DE')['invitations.form.create']).toBe('Create invitation');
  });

  it('formats French plurals and UTC dates without hydration-dependent output', () => {
    const copy = getInvitationsCopy('fr');

    expect(
      formatInvitationsPlural(1, 'fr', {
        one: copy['invitations.list.count_one'],
        other: copy['invitations.list.count_other'],
      }),
    ).toBe('1 invitation');
    expect(
      formatInvitationsPlural(12_345, 'fr', {
        one: copy['invitations.list.count_one'],
        other: copy['invitations.list.count_other'],
      }),
    ).toBe('12 345 invitations');
    expect(formatInvitationsDateTime('2026-08-20T12:00:00.000Z', 'fr')).toMatch(/20 août 2026/iu);
    expect(formatInvitationsDateTime('invalid', 'fr')).toBe('Date d’expiration indisponible');
  });

  it('localizes system roles but preserves custom role names and unknown custom keys', () => {
    const roles = [
      { key: 'viewer', name: 'viewer', system: true },
      { key: 'release-captain', name: 'Release Captain', system: false },
    ];

    expect(invitationRoleLabel('viewer', roles, 'fr')).toBe('Lecteur');
    expect(invitationRoleLabel('release-captain', roles, 'fr')).toBe('Release Captain');
    expect(invitationRoleLabel('customer-defined-role', roles, 'fr')).toBe('customer-defined-role');
  });

  it('maps stable action and route error codes without accepting raw messages', () => {
    expect(invitationActionStatusMessage('created', 'fr')).toBe('Invitation créée.');
    expect(invitationActionErrorMessage('rateLimited', 'fr')).toBe(
      'Trop de demandes d’invitation ont été envoyées. Patientez un instant, puis réessayez.',
    );
    expect(invitationsRouteErrorKind(new Response('private upstream error', { status: 403 }))).toBe('permission');
    expect(invitationsRouteErrorKind({ status: 401, data: 'private session detail' })).toBe('authentication');
    expect(invitationsRouteErrorKind(new Error('private network detail'))).toBe('unavailable');
  });
});

describe('InvitationsPage localized states and interactions', () => {
  beforeEach(() => {
    language = 'fr';
    routerMocks.actionData = undefined;
    routerMocks.loaderData = baseLoaderData();
    routerMocks.navigation = { state: 'idle', formData: undefined };
    routerMocks.revalidatorState = 'idle';
    routerMocks.revalidate.mockReset();
    routerMocks.rootData = { language: 'fr' };
    routerMocks.routeError = undefined;
    routerMocks.submit.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders complete French copy, localized system roles, custom roles and dates', () => {
    render(<InvitationsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Invitations' })).toBeTruthy();
    expect(screen.getByText('3 invitations')).toBeTruthy();
    expect(screen.getByPlaceholderText('personne@entreprise.fr')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Membre' }).getAttribute('value')).toBe('member');
    expect(screen.getByRole('option', { name: 'Éditeur' }).getAttribute('value')).toBe('editor');
    expect(screen.getByRole('option', { name: 'Administrateur' }).getAttribute('value')).toBe('admin');
    expect(screen.getAllByText('Release Captain').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Lecteur').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Acceptée')).toBeTruthy();
    expect(screen.getByText('Expirée')).toBeTruthy();
    expect(screen.getByText('En attente')).toBeTruthy();
    expect(document.body.textContent).toContain(formatInvitationsDateTime('2026-08-20T12:00:00.000Z', 'fr'));
    expect(screen.getByRole('button', { name: 'Créer l’invitation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renvoyer l’invitation à future@example.com' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Faire expirer l’invitation de future@example.com' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Renvoyer l’invitation à expired@example.com' }).hasAttribute('disabled'),
    ).toBe(false);
    expect(
      screen.getByRole('button', { name: 'Renvoyer l’invitation à accepted@example.com' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'Faire expirer l’invitation de expired@example.com' })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.queryByText('Create invitation')).toBeNull();
    expect(screen.queryByText('Resend')).toBeNull();
  });

  it('renders explicit loading, empty and permission states', () => {
    routerMocks.navigation = { state: 'loading', formData: undefined };

    const { rerender } = render(<InvitationsPage />);

    expect(screen.getByRole('status', { name: 'Chargement des invitations' }).getAttribute('aria-busy')).toBe('true');

    routerMocks.navigation = { state: 'idle', formData: undefined };
    routerMocks.loaderData = baseLoaderData({ invitations: [] });
    rerender(<InvitationsPage />);

    expect(screen.getByRole('status').textContent).toContain('Aucune invitation pour le moment');

    routerMocks.loaderData = baseLoaderData({ invitations: [], loadErrorCode: 'permission' });
    rerender(<InvitationsPage />);

    expect(screen.getByRole('alert').textContent).toContain('Accès aux invitations restreint');
    expect(screen.queryByRole('button', { name: 'Recharger les invitations' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Créer l’invitation' })).toBeNull();
  });

  it('renders only the localized stable action error and never a raw payload detail', () => {
    const rawError = 'PrismaClientKnownRequestError postgres://secret@private-db';
    routerMocks.actionData = { errorCode: 'rateLimited', error: rawError };

    render(<InvitationsPage />);

    expect(screen.getByRole('alert').textContent).toBe(
      'Trop de demandes d’invitation ont été envoyées. Patientez un instant, puis réessayez.',
    );
    expect(document.body.textContent).not.toContain(rawError);
    expect(document.body.textContent).not.toContain('postgres://');
  });

  it('opens a localized expiration dialog and submits the stable expire intent', () => {
    render(<InvitationsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Faire expirer l’invitation de future@example.com' }));

    expect(screen.getByRole('dialog').textContent).toContain('Faire expirer l’invitation de future@example.com ?');
    expect(screen.getByRole('button', { name: 'Annuler' }).className).toContain('min-h-11');

    fireEvent.click(screen.getByRole('button', { name: 'Faire expirer l’invitation' }));

    expect(routerMocks.submit).toHaveBeenCalledWith(
      { intent: 'expire', orgId: 'org-1', inviteId: 'invite-pending' },
      { method: 'post' },
    );
  });

  it('renders a localized ErrorBoundary without exposing the thrown payload', () => {
    routerMocks.routeError = { status: 403, data: { error: 'private RBAC policy details' } };

    render(<ErrorBoundary />);

    expect(screen.getByRole('alert').textContent).toContain('Vous ne pouvez pas gérer ces invitations');
    expect(document.body.textContent).not.toContain('private RBAC policy details');
    expect(screen.getByRole('link', { name: 'Retour au tableau de bord' }).getAttribute('href')).toBe('/dashboard');
  });
});

describe('invitations SSR metadata and source safeguards', () => {
  it('publishes localized title, description and social metadata', () => {
    const tags = meta({ data: { language: 'fr' }, matches: [] } as never);

    expect(tags).toContainEqual({ title: 'Invitations - E-Code' });
    expect(tags).toContainEqual({
      name: 'description',
      content: 'Invitez vos collègues et gérez leur accès à votre organisation E-Code.',
    });
    expect(tags).toContainEqual({ property: 'og:title', content: 'Invitations - E-Code' });
    expect(tags).toContainEqual({ name: 'twitter:title', content: 'Invitations - E-Code' });
  });

  it('has zero scanner findings and keeps locale, safety, responsive and accessibility guards explicit', async () => {
    const routePath = 'app/routes/invitations.tsx';
    const catalogPath = 'app/lib/i18n/catalogs/invitations.ts';
    const routeSource = readFileSync(routePath, 'utf8');
    const catalogSource = readFileSync(catalogPath, 'utf8');
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');
    const { parseCatalog, validateCatalogs } = await import('../../scripts/i18n/catalog-validator.mjs');
    const scan = scanSource(routeSource, routePath);

    const catalogs = validateCatalogs({
      en: parseCatalog(catalogSource, 'invitationsEn', catalogPath),
      fr: parseCatalog(catalogSource, 'invitationsFr', catalogPath),
      enFile: catalogPath,
      frFile: catalogPath,
    });

    expect(scan.parseErrors).toEqual([]);
    expect(scan.findings).toEqual([]);
    expect(catalogs.issues).toEqual([]);
    expect(catalogs.metrics).toMatchObject({ enEntries: 80, frEntries: 80, matchingKeys: 80, pluralFamilies: 1 });
    expect(routeSource).toContain('resolveRequestLocale(request).language');
    expect(routeSource).toContain('export const meta');
    expect(routeSource).toContain('export function ErrorBoundary');
    expect(routeSource).toContain('isAuthenticationResponse');
    expect(routeSource).toContain('invitationApiError');
    expect(routeSource).not.toContain('apiErrorMessage');
    expect(routeSource).not.toContain('error.message');
    expect(routeSource).toContain('AsyncPanelSkeleton');
    expect(routeSource).toContain('AsyncPanelError');
    expect(routeSource).toContain('role="status"');
    expect(routeSource).toContain('role="alert"');
    expect(routeSource).toContain('aria-live');
    expect(routeSource).toContain('aria-busy');
    expect(routeSource).toContain('min-w-0');
    expect(routeSource).toContain('break-words');
    expect(routeSource).toContain('[overflow-wrap:anywhere]');
    expect(routeSource).toContain('whitespace-normal');
    expect(routeSource).toContain('min-h-11');
    expect(routeSource).toContain('focus-visible:ring-2');
    expect(routeSource).toContain('status-success-border');
    expect(routeSource).toContain('variant="warning"');
    expect(routeSource).toContain('status-error-border');
    expect(routeSource).not.toMatch(/#[0-9a-f]{3,8}/iu);
  });
});
