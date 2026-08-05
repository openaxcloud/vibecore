/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectorApiKeyConnectButton } from './shared/connectors/ConnectorApiKeyConnectButton';
import { GitLabOauthConnectButton } from './shared/connectors/GitLabOauthConnectButton';
import { ErrorState as ServiceErrorState } from './shared/service-integration/ErrorState';
import { ServiceHeader } from './shared/service-integration/ServiceHeader';
import DebugTab from './tabs/debug/DebugTab';
import { GitHubUserProfile } from './tabs/github/components/GitHubUserProfile';
import {
  ConnectionTestIndicator,
  GitHubConnectionRequired,
  LoadingState,
} from './tabs/github/components/shared/GitHubStateIndicators';
import { formatSettingsConnectorsResidualDateTime } from '~/lib/i18n/catalogs/settings-connectors-residual';
import type { GitHubUserResponse } from '~/types/GitHub';

const mocks = vi.hoisted(() => ({
  getDebugStatus: vi.fn(),
  logError: vi.fn(),
  logSystem: vi.fn(),
}));

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logError: mocks.logError,
    logSystem: mocks.logSystem,
  },
}));

vi.mock('~/lib/api/debug', () => ({
  getDebugStatus: mocks.getDebugStatus,
}));

const githubUser: GitHubUserResponse = {
  login: 'octocat',
  avatar_url: 'https://avatars.example/octocat.png',
  html_url: 'https://github.com/octocat',
  name: 'The Octocat',
  bio: 'User-authored English biography',
  public_repos: 1234,
  followers: 1,
  following: 0,
  public_gists: 2,
  created_at: '2020-01-01T00:00:00.000Z',
  updated_at: '2026-08-05T10:30:00.000Z',
};

describe('settings connector residual i18n surfaces', () => {
  beforeEach(() => {
    language = 'en';
    mocks.getDebugStatus.mockReset();
    mocks.logError.mockReset();
    mocks.logSystem.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('localizes the API-key connector live and never renders an upstream error', async () => {
    language = 'fr';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ code: 'invalid_token', error: 'secret=provider-private-value' }),
      }),
    );

    const view = render(<ConnectorApiKeyConnectButton provider="vercel" displayName="Vercel" />);

    fireEvent.click(screen.getByRole('button', { name: 'Se connecter à Vercel (clé API)' }));
    fireEvent.change(screen.getByPlaceholderText('Collez votre jeton d’accès Vercel'), {
      target: { value: 'secret-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le jeton' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Impossible de valider le jeton Vercel.');
    expect(screen.queryByText(/provider-private-value/u)).toBeNull();
    expect(mocks.logError).toHaveBeenCalledWith('Vercel api-key connect failed', {
      code: 'invalid_token',
      status: 401,
    });

    language = 'en';
    view.rerender(<ConnectorApiKeyConnectButton provider="vercel" displayName="Vercel" />);

    expect(screen.getByRole('alert').textContent).toContain('The Vercel token could not be validated.');
    expect(screen.queryByText('Impossible de valider le jeton Vercel.')).toBeNull();
  });

  it('localizes GitLab OAuth state live and masks popup diagnostics', async () => {
    language = 'fr';

    const view = render(<GitLabOauthConnectButton />);

    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'e-code.connector.connection.failed',
          provider: 'gitlab',
          errorCode: 'provider_denied',
          errorMessage: 'Raw English provider error secret=abc',
        },
      }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Impossible d’établir la connexion OAuth à GitLab. Réessayez.',
      ),
    );
    expect(screen.queryByText(/Raw English provider error/u)).toBeNull();

    language = 'en';
    view.rerender(<GitLabOauthConnectButton />);

    expect(screen.getByRole('alert').textContent).toContain(
      'The GitLab OAuth connection could not be completed. Try again.',
    );
  });

  it('preserves GitHub user content while formatting profile metrics in the active locale', () => {
    language = 'fr';

    const view = render(<GitHubUserProfile user={githubUser} />);

    expect(screen.getByText('User-authored English biography')).toBeTruthy();
    expect(screen.getByText('1 abonné')).toBeTruthy();
    expect(screen.getByText(/1 234 dépôts publics/u)).toBeTruthy();
    expect(screen.getByText('2 gists publics')).toBeTruthy();

    language = 'en';
    view.rerender(<GitHubUserProfile user={githubUser} />);

    expect(screen.getByText('1 follower')).toBeTruthy();
    expect(screen.getByText('1,234 public repositories')).toBeTruthy();
    expect(screen.getByText('User-authored English biography')).toBeTruthy();
  });

  it('localizes shared GitHub state defaults, actions, and timestamps live', () => {
    language = 'fr';

    const onConnect = vi.fn();

    const view = render(
      <>
        <LoadingState />
        <GitHubConnectionRequired onConnect={onConnect} />
        <ConnectionTestIndicator status="testing" timestamp={Date.parse('2026-08-05T10:30:00.000Z')} />
      </>,
    );

    expect(screen.getByText('Chargement…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter à GitHub' })).toBeTruthy();
    expect(screen.getByText('Test de la connexion…')).toBeTruthy();
    expect(
      screen.getByText(formatSettingsConnectorsResidualDateTime('2026-08-05T10:30:00.000Z', 'fr') as string),
    ).toBeTruthy();

    language = 'en';
    view.rerender(
      <>
        <LoadingState />
        <GitHubConnectionRequired onConnect={onConnect} />
        <ConnectionTestIndicator status="testing" timestamp={Date.parse('2026-08-05T10:30:00.000Z')} />
      </>,
    );

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeTruthy();
    expect(screen.getByText('Testing connection…')).toBeTruthy();
  });

  it('renders only reviewed service errors and localizes service actions live', () => {
    language = 'fr';

    const view = render(
      <ServiceErrorState
        error={{
          message: 'Raw provider failure secret=private',
          details: { token: 'must-not-render' },
          code: 'TOKEN_REJECTED',
          service: 'Vercel',
          operation: 'connect',
        }}
        onRetry={() => undefined}
        onDismiss={() => undefined}
        showDetails
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Ce service est temporairement indisponible.');
    expect(screen.queryByText(/Raw provider failure/u)).toBeNull();
    expect(screen.queryByText(/must-not-render/u)).toBeNull();
    fireEvent.click(screen.getByText('Détails techniques'));
    expect(screen.getByText('TOKEN_REJECTED')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy();

    language = 'en';
    view.rerender(
      <ServiceErrorState
        error={{ message: 'still private', service: 'Vercel', operation: 'connect' }}
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('This service is temporarily unavailable.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('localizes the service connection control without changing provider copy', () => {
    language = 'fr';

    function ProviderIcon(props: { className?: string }) {
      return <span {...props} />;
    }

    const view = render(
      <ServiceHeader
        icon={ProviderIcon}
        title="Vercel"
        description="Description du fournisseur"
        onTestConnection={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Tester la connexion' })).toBeTruthy();
    expect(screen.getByText('Vercel')).toBeTruthy();

    language = 'en';
    view.rerender(
      <ServiceHeader
        icon={ProviderIcon}
        title="Vercel"
        description="Provider description"
        onTestConnection={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Test connection' })).toBeTruthy();
  });

  it('shows localized safe debug diagnostics and never renders stored log messages', async () => {
    language = 'fr';
    mocks.getDebugStatus.mockResolvedValue({
      warnings: [
        {
          id: 'high-memory-usage',
          message: 'High memory usage detected',
          type: 'warning',
          timestamp: '2026-08-05T10:30:00.000Z',
        },
      ],
      errors: [
        {
          id: 'error-private',
          message: 'Raw English log secret=debug-private',
          type: 'error',
          timestamp: '2026-08-05T10:31:00.000Z',
        },
      ],
    });

    const view = render(<DebugTab />);

    expect(
      screen.getByRole('status', { name: 'Chargement des diagnostics de l’environnement d’exécution…' }),
    ).toBeTruthy();
    expect(await screen.findByText('2 problèmes détectés')).toBeTruthy();
    expect(screen.getByText('Utilisation élevée de la mémoire détectée')).toBeTruthy();
    expect(screen.getByText('Une erreur de l’application a été enregistrée')).toBeTruthy();
    expect(screen.queryByText(/debug-private/u)).toBeNull();

    language = 'en';
    view.rerender(<DebugTab />);

    expect(screen.getByText('2 issues detected')).toBeTruthy();
    expect(screen.getByText('An application error was recorded')).toBeTruthy();
  });

  it('provides a localized retry when debug diagnostics fail to load', async () => {
    language = 'fr';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getDebugStatus.mockRejectedValueOnce(new Error('Raw network error')).mockResolvedValueOnce({
      warnings: [],
      errors: [],
    });

    render(<DebugTab />);

    expect(
      await screen.findByText('Impossible de charger les diagnostics de l’environnement d’exécution. Réessayez.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Aucun problème de diagnostic actif détecté')).toBeTruthy();
    expect(mocks.getDebugStatus).toHaveBeenCalledTimes(2);
  });
});
