/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  loaderData: {
    language: 'fr',
    loginProviders: [
      {
        provider: 'github',
        displayName: 'Raw English login provider label',
        callbackUrl: 'https://app.e-code.ai/auth/oauth/github/callback',
        enabled: true,
        clientId: 'github-client-id',
        hasSecret: false,
        scopes: ['read:user', 'user:email'],
        envClientIdPresent: true,
        envSecretPresent: true,
      },
    ],
    connectors: [
      {
        provider: 'gitlab',
        displayName: 'Raw English Git connector label',
        enabled: true,
        clientId: 'gitlab-client-id',
        hasSecret: false,
        scopes: ['read_user', 'read_repository'],
        authorizeUrl: 'https://gitlab.com/oauth/authorize',
        callbackUrl: 'https://app.e-code.ai/integrations/oauth/gitlab/callback',
      },
    ],
    apiKeyConnectors: [
      {
        provider: 'vercel',
        displayName: 'Raw English API-key connector label',
        authType: 'api_key',
        enabled: true,
        tokenConsoleUrl: 'https://vercel.com/account/tokens',
        configureEndpoint: '/api/integrations/api-key/vercel/configure',
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

import AdminOauthProvidersPage, { meta } from './admin.oauth-providers';

function resetProviders() {
  routeState.loaderData.loginProviders = [
    {
      provider: 'github',
      displayName: 'Raw English login provider label',
      callbackUrl: 'https://app.e-code.ai/auth/oauth/github/callback',
      enabled: true,
      clientId: 'github-client-id',
      hasSecret: false,
      scopes: ['read:user', 'user:email'],
      envClientIdPresent: true,
      envSecretPresent: true,
    },
  ];
  routeState.loaderData.connectors = [
    {
      provider: 'gitlab',
      displayName: 'Raw English Git connector label',
      enabled: true,
      clientId: 'gitlab-client-id',
      hasSecret: false,
      scopes: ['read_user', 'read_repository'],
      authorizeUrl: 'https://gitlab.com/oauth/authorize',
      callbackUrl: 'https://app.e-code.ai/integrations/oauth/gitlab/callback',
    },
  ];
  routeState.loaderData.apiKeyConnectors = [
    {
      provider: 'vercel',
      displayName: 'Raw English API-key connector label',
      authType: 'api_key',
      enabled: true,
      tokenConsoleUrl: 'https://vercel.com/account/tokens',
      configureEndpoint: '/api/integrations/api-key/vercel/configure',
    },
  ];
}

beforeEach(() => {
  routeState.loaderData.language = 'fr';
  resetProviders();
  routeState.actionData = undefined;
  routeState.navigation = { state: 'idle', formData: undefined };
});

afterEach(() => cleanup());

describe('admin OAuth providers rendered i18n', () => {
  it('localizes metadata and every provider family in French', () => {
    const tags = meta({ data: { language: 'fr' } } as never);
    const { container } = render(<AdminOauthProvidersPage />);

    expect(tags).toContainEqual({ title: 'Fournisseurs OAuth — Administration E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({ name: 'description', content: expect.stringContaining('connecteurs Git') }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Fournisseurs OAuth' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Fournisseurs de connexion (modifiables)' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Connecteurs Git (modifiables)' })).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Connecteurs par clé API (jeton propre à chaque utilisateur)',
      }),
    ).toBeTruthy();
    expect(screen.getAllByText('1 fournisseur')).toHaveLength(3);
    expect(screen.getByText('GitHub (connexion)')).toBeTruthy();
    expect(screen.getByText('GitLab')).toBeTruthy();
    expect(screen.getByText('Vercel')).toBeTruthy();
    expect(screen.getByText('Activé · secret configuré')).toBeTruthy();
    expect(screen.getByText('Activé · aucun secret')).toBeTruthy();
    expect(screen.getByText('Activé · clé API par utilisateur')).toBeTruthy();
    expect(screen.getAllByLabelText('Identifiant client')).toHaveLength(2);
    expect(screen.getAllByLabelText('Confirmez avec votre mot de passe')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Enregistrer GitHub (connexion)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer GitLab' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enregistrer Vercel' })).toBeTruthy();
    expect(screen.getAllByText('Configurer ce fournisseur')).toHaveLength(2);
    expect(screen.getByText('https://vercel.com/account/tokens')).toBeTruthy();
    expect(screen.getByText('/api/integrations/api-key/vercel/configure')).toBeTruthy();
    expect(container.textContent).not.toContain('Raw English login provider label');
    expect(container.textContent).not.toContain('Sign-in providers (editable)');
    expect(container.textContent).not.toContain('Enabled · secret set');
  });

  it('keeps English as the default fallback surface', () => {
    routeState.loaderData.language = 'en';

    render(<AdminOauthProvidersPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'OAuth providers' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Sign-in providers (editable)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save GitHub (sign-in)' })).toBeTruthy();
  });

  it('renders catalog success and errors without raw API prose', () => {
    routeState.actionData = { statusCode: 'loginSaved', provider: 'github', kind: 'login' };

    const { unmount } = render(<AdminOauthProvidersPage />);

    expect(screen.getByRole('status').textContent).toBe('Configuration « GitHub (connexion) » enregistrée.');
    unmount();

    routeState.actionData = { errorCode: 'invalidConfiguration' };
    render(<AdminOauthProvidersPage />);

    expect(
      screen.getByText('La configuration du fournisseur a été refusée. Vérifiez les valeurs, puis réessayez.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Backend rejected|tenant secret|Raw API/u)).toBeNull();
  });

  it('shows explicit localized empty states for every async collection', () => {
    routeState.loaderData.loginProviders = [];
    routeState.loaderData.connectors = [];
    routeState.loaderData.apiKeyConnectors = [];

    render(<AdminOauthProvidersPage />);

    expect(screen.getByText('Aucun fournisseur de connexion n’est disponible.')).toBeTruthy();
    expect(screen.getByText('Aucun connecteur Git n’est disponible.')).toBeTruthy();
    expect(screen.getByText('Aucun connecteur par clé API n’est disponible.')).toBeTruthy();
    expect(screen.getAllByText('0 fournisseur')).toHaveLength(3);
  });

  it('exposes an explicit pending state and prevents duplicate submissions', () => {
    const formData = new FormData();
    formData.set('kind', 'login');
    formData.set('provider', 'github');
    routeState.navigation = { state: 'submitting', formData };

    render(<AdminOauthProvidersPage />);

    expect(screen.getByRole('button', { name: 'Enregistrement de GitHub (connexion)…' })).toBeTruthy();

    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('keeps long French cards, URLs and actions wrap-safe on narrow screens', () => {
    const { container } = render(<AdminOauthProvidersPage />);
    const providerName = screen.getByText('GitHub (connexion)');
    const providerHeader = providerName.parentElement;

    const callback = screen.getAllByLabelText(
      'URL de rappel ou de redirection (à enregistrer dans la console du fournisseur)',
    )[0]!;

    const save = screen.getByRole('button', { name: 'Enregistrer GitHub (connexion)' });
    const tokenUrl = screen.getByText('https://vercel.com/account/tokens');

    expect(providerHeader?.className).toContain('flex-col');
    expect(providerHeader?.className).toContain('sm:flex-row');
    expect(callback.className).toContain('max-w-full');
    expect(callback.getAttribute('title')).toBe(
      'Valeur en lecture seule. Placez le focus dans le champ pour sélectionner l’URL complète.',
    );
    expect(save.parentElement?.className).toContain('[&_button]:!whitespace-normal');
    expect(tokenUrl.className).toContain('break-all');
    expect(container.innerHTML).not.toContain('truncate');
  });
});
