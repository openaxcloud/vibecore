/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  loaderData: {
    orgId: 'org-1',
    enforcement: {
      enforced: true,
      enforcedAt: '2026-08-01T12:30:00.000Z',
      graceDays: 7,
      graceDeadline: '2026-08-04T12:30:00.000Z',
      active: false,
    },
    enforcementUnavailable: false,
    language: 'fr',
  },
  actionData: undefined as Record<string, unknown> | undefined,
  fetcherData: undefined as Record<string, unknown> | undefined,
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  const MockForm = ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>;

  return {
    ...actual,
    Form: MockForm,
    useLoaderData: () => routeState.loaderData,
    useActionData: () => routeState.actionData,
    useNavigation: () => ({ state: 'idle' }),
    useFetcher: () => ({
      Form: MockForm,
      data: routeState.fetcherData,
      state: 'idle',
      formData: undefined,
      submit: vi.fn(),
    }),
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
  firstOrganizationOrNull: vi.fn(),
  formObject: vi.fn(),
  json: vi.fn(),
  redirect: vi.fn(),
}));

import EnterpriseSsoSettingsPage, { meta } from './enterprise-sso-settings';

beforeEach(() => {
  routeState.loaderData.language = 'fr';
  routeState.loaderData.enforcement = {
    enforced: true,
    enforcedAt: '2026-08-01T12:30:00.000Z',
    graceDays: 7,
    graceDeadline: '2026-08-04T12:30:00.000Z',
    active: false,
  };
  routeState.loaderData.enforcementUnavailable = false;
  routeState.actionData = undefined;
  routeState.fetcherData = undefined;
});

afterEach(() => cleanup());

describe('enterprise SSO settings rendered i18n', () => {
  it('localizes metadata and the complete settings surface in French', () => {
    const tags = meta({ data: { language: 'fr' } } as never);

    expect(tags).toContainEqual({ title: 'Paramètres SSO d’entreprise — E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({ name: 'description', content: expect.stringContaining('authentification unique') }),
    );

    const { container } = render(<EnterpriseSsoSettingsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres SSO d’entreprise' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'OIDC / Entra ID' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'SAML 2.0' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Imposer le SSO' })).toBeTruthy();
    expect(screen.getByLabelText('Émetteur')).toBeTruthy();
    expect(screen.getByLabelText('Identifiant client')).toBeTruthy();
    expect(screen.getByLabelText('Secret client')).toBeTruthy();
    expect(screen.getByLabelText('Identifiant d’entité')).toBeTruthy();
    expect(screen.getByLabelText('Certificat X.509')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer le fournisseur OIDC' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer le fournisseur SAML' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Tester la connexion' })).toHaveLength(2);
    expect(screen.getByText(/délai de grâce de 7 jours/u)).toBeTruthy();
    expect(screen.getByText(/4 août 2026, 12:30/u)).toBeTruthy();
    expect(container.textContent).not.toContain('Enterprise SSO settings');
    expect(container.textContent).not.toContain('Save OIDC provider');
    expect(container.textContent).not.toContain('Require SSO for all members');
  });

  it('keeps English as the supported fallback surface', () => {
    routeState.loaderData.language = 'en';

    render(<EnterpriseSsoSettingsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Enterprise SSO settings' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Enforce SSO' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save OIDC provider' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Test connection' })).toHaveLength(2);
  });

  it('renders safe French errors and normalized provider checks without raw API copy', () => {
    routeState.actionData = { errorCode: 'requestRejected' };
    routeState.fetcherData = {
      test: {
        type: 'oidc',
        ok: false,
        checks: [{ nameCode: 'unknown', detailCode: 'genericFailed', ok: false }],
      },
    };

    const { container } = render(<EnterpriseSsoSettingsPage />);

    expect(screen.getByText('La requête a été refusée. Vérifiez vos autorisations, puis réessayez.')).toBeTruthy();
    expect(screen.getByText('Vérification du fournisseur:')).toBeTruthy();
    expect(screen.getByText('Cette vérification du fournisseur a échoué.')).toBeTruthy();
    expect(container.textContent).not.toContain('Unreviewed upstream English check');
    expect(container.textContent).not.toContain('Raw provider diagnostic');
  });

  it('keeps long French controls wrap-safe on narrow screens', () => {
    const { container } = render(<EnterpriseSsoSettingsPage />);
    const testButton = screen.getAllByRole('button', { name: 'Tester la connexion' })[0]!;
    const saveButton = screen.getByRole('button', { name: 'Enregistrer le fournisseur OIDC' });
    const enforcementLabel = screen.getByText('Imposer le SSO à tous les membres');
    const enforcementRow = enforcementLabel.parentElement?.parentElement;
    const enforcementSwitch = screen.getByRole('switch', { name: 'Imposer le SSO à tous les membres' });
    const certificate = screen.getByLabelText('Certificat X.509');

    expect(testButton.className).toContain('w-full');
    expect(testButton.className).toContain('sm:w-auto');
    expect(testButton.className).toContain('!whitespace-normal');
    expect(saveButton.parentElement?.className).toContain('[&_button]:!whitespace-normal');
    expect(enforcementRow?.className).toContain('flex-col');
    expect(enforcementRow?.className).toContain('sm:flex-row');
    expect(enforcementRow?.className).toContain('min-w-0');
    expect(enforcementSwitch.className).toContain('shrink-0');
    expect(certificate.className).toContain('max-w-full');
    expect(container.innerHTML).not.toContain('truncate');
  });

  it('shows an explicit localized recovery state when enforcement cannot load', () => {
    routeState.loaderData.enforcement = null as never;
    routeState.loaderData.enforcementUnavailable = true;

    render(<EnterpriseSsoSettingsPage />);

    expect(
      screen.getByText(
        'Impossible de charger l’état actuel de l’obligation d’utiliser le SSO. La commande est désactivée afin de ne pas modifier un état de sécurité inconnu. Les paramètres des fournisseurs restent disponibles.',
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole('switch', { name: 'Imposer le SSO à tous les membres' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
