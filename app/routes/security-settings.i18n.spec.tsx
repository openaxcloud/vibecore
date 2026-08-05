/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  loaderData: {
    mfaEnabled: true,
    mfaUnavailable: false,
    language: 'fr',
  },
  revalidator: {
    state: 'idle',
    revalidate: vi.fn(),
  },
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLoaderData: () => routeState.loaderData,
    useRevalidator: () => routeState.revalidator,
  };
});

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => (
    <section role="status" aria-label={label} aria-busy="true">
      {label}
    </section>
  ),
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

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
  LinkButton: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  ActivityList: ({ items }: { items: Array<{ title: string; detail: ReactNode }> }) => (
    <section aria-label="activity-list">
      {items.map((item) => (
        <article key={item.title}>
          <h2>{item.title}</h2>
          <p>{item.detail}</p>
        </article>
      ))}
    </section>
  ),
}));

vi.mock('~/components/dashboard/UserAreaRouteError', () => ({
  UserAreaRouteErrorBoundary: () => null,
}));

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: vi.fn(),
  json: vi.fn(),
}));

import SecuritySettingsPage, { meta } from './security-settings';

beforeEach(() => {
  routeState.loaderData.language = 'fr';
  routeState.loaderData.mfaEnabled = true;
  routeState.loaderData.mfaUnavailable = false;
  routeState.revalidator.state = 'idle';
  routeState.revalidator.revalidate.mockReset();
});

afterEach(() => cleanup());

describe('security settings rendered i18n', () => {
  it('localizes SEO, MFA, passkeys, recovery codes, sessions and enterprise links in French', () => {
    const tags = meta({ data: { language: 'fr' } } as never);
    const { container } = render(<SecuritySettingsPage />);

    expect(tags).toContainEqual({ title: 'Paramètres de sécurité — E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: expect.stringContaining('authentification multifacteur'),
      }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres de sécurité' })).toBeTruthy();
    expect(screen.getByTestId('mfa-status-badge').textContent).toBe('L’authentification à deux facteurs est activée');
    expect(screen.getByRole('heading', { level: 2, name: 'Authentification à deux facteurs' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Clés d’accès (passkeys) et clés de sécurité' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Codes de récupération' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions actives' })).toBeTruthy();
    expect(screen.getByText(/clé de sécurité matérielle/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gérer la 2FA' }).getAttribute('href')).toBe('/mfa-setup');
    expect(screen.getByRole('link', { name: 'Codes de récupération' }).getAttribute('href')).toBe('/recovery-codes');
    expect(screen.getByRole('link', { name: 'Sessions actives' }).getAttribute('href')).toBe('/session-security');
    expect(screen.getByRole('heading', { level: 2, name: 'Sécurité Enterprise' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sécurité de l’organisation' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Domaines vérifiés' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Paramètres SSO' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Provisionnement SCIM' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Rôles et autorisations' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Journaux d’audit' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Webhooks SIEM' })).toBeTruthy();
    expect(container.textContent).not.toContain('Security settings');
    expect(container.textContent).not.toContain('Active sessions');
  });

  it('renders the localized disabled MFA state and setup action', () => {
    routeState.loaderData.mfaEnabled = false;

    render(<SecuritySettingsPage />);

    expect(screen.getByTestId('mfa-status-badge').textContent).toBe(
      'L’authentification à deux facteurs est désactivée et facultative',
    );
    expect(screen.getByText(/renforcer facultativement la protection/u)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Configurer la 2FA' })).toBeTruthy();
  });

  it('renders a recoverable localized error without claiming an MFA state or exposing raw errors', () => {
    routeState.loaderData.mfaEnabled = false;
    routeState.loaderData.mfaUnavailable = true;

    render(<SecuritySettingsPage />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Impossible de charger le statut de l’authentification à deux facteurs',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Nous ne déduisons pas si la protection est activée/u)).toBeTruthy();
    expect(screen.queryByTestId('mfa-status-badge')).toBeNull();
    expect(screen.queryByText(/private host|network down|API error/u)).toBeNull();
    expect(screen.getByText(/Statut indisponible/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Relancer la vérification de sécurité' }));
    expect(routeState.revalidator.revalidate).toHaveBeenCalledTimes(1);
  });

  it('shows an explicit localized skeleton while the failed MFA status is reloading', () => {
    routeState.loaderData.mfaUnavailable = true;
    routeState.revalidator.state = 'loading';

    render(<SecuritySettingsPage />);

    expect(
      screen.getByRole('status', {
        name: 'Chargement du statut de l’authentification à deux facteurs',
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('mfa-status-badge')).toBeNull();
  });

  it('keeps English as the default fallback surface', () => {
    routeState.loaderData.language = 'en';

    render(<SecuritySettingsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Security settings' })).toBeTruthy();
    expect(screen.getByTestId('mfa-status-badge').textContent).toBe('Two-factor authentication is enabled');
    expect(screen.getByRole('heading', { level: 2, name: 'Passkeys and security keys' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage 2FA' })).toBeTruthy();
  });

  it('does not expose a fake passkey-management link when no WebAuthn route exists', () => {
    render(<SecuritySettingsPage />);

    expect(screen.getByRole('heading', { level: 2, name: 'Clés d’accès (passkeys) et clés de sécurité' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /passkey|clé d’accès/u })).toBeNull();
  });

  it('keeps long French status and link groups wrap-safe on narrow screens', () => {
    const { container } = render(<SecuritySettingsPage />);
    const badge = screen.getByTestId('mfa-status-badge');
    const mfaLink = screen.getByRole('link', { name: 'Gérer la 2FA' });
    const enterpriseLink = screen.getByRole('link', { name: 'Sécurité de l’organisation' });

    expect(badge.className).toContain('min-w-0');
    expect(badge.firstElementChild?.classList.contains('shrink-0')).toBe(true);
    expect(mfaLink.parentElement?.className).toContain('flex-col');
    expect(mfaLink.parentElement?.className).toContain('sm:flex-row');
    expect(mfaLink.parentElement?.className).toContain('[&_a]:!whitespace-normal');
    expect(enterpriseLink.parentElement?.className).toContain('[&_a]:!whitespace-normal');
    expect(container.innerHTML).not.toContain('truncate');
  });
});
