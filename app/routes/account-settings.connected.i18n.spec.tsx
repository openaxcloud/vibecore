/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FormHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
const launchMock = vi.hoisted(() => vi.fn());
const popupResetMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
  navigationFormData: undefined as FormData | undefined,
  revalidatorState: 'idle',
  searchParams: new URLSearchParams(),
  popupState: { phase: 'idle' } as
    | { phase: 'idle' | 'launching' }
    | {
        phase: 'failed';
        result: { ok: false; provider: string; errorCode?: string; errorMessage?: string };
      }
    | {
        phase: 'succeeded';
        result: { ok: true; provider: string; userConnectionId: string; accountLabel: string };
      },
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>,
    Link: ({
      children,
      to,
      reloadDocument: _reloadDocument,
      ...props
    }: {
      children: ReactNode;
      to: string;
      reloadDocument?: boolean;
      [key: string]: unknown;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState, formData: routeState.navigationFormData }),
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
    useSearchParams: () => [routeState.searchParams, vi.fn()],
    useSubmit: () => submitMock,
  };
});

vi.mock('~/lib/chat/use-connector-popup', () => ({
  useConnectorPopup: () => ({ state: routeState.popupState, launch: launchMock, reset: popupResetMock }),
}));

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  StatusPill: ({ label }: { label: string }) => <span data-testid="status-pill">{label}</span>,
}));

vi.mock('~/components/dashboard/AsyncPanelState', () => ({
  AsyncPanelSkeleton: ({ label }: { label: string }) => <section aria-label={label} />,
  AsyncPanelError: ({
    title,
    description,
    retryLabel,
    onRetry,
    tone,
  }: {
    title: string;
    description: string;
    retryLabel: string;
    onRetry?: () => void;
    tone: string;
  }) => (
    <section role="alert" data-tone={tone}>
      <h3>{title}</h3>
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
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onClose,
    isLoading,
  }: {
    isOpen: boolean;
    title: string;
    description: ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    onClose: () => void;
    isLoading?: boolean;
  }) =>
    isOpen ? (
      <section role="alertdialog" aria-label={title} aria-busy={isLoading}>
        <p>{description}</p>
        <button type="button" onClick={onClose}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={isLoading}>
          {confirmLabel}
        </button>
      </section>
    ) : null,
}));

import ConnectedAccountsPage, { action, loader, meta } from './account-settings.connected';
import {
  accountSettingsConnectedEn,
  accountSettingsConnectedFr,
  connectedAccountOauthError,
  connectedAccountProviderLabel,
  connectedAccountReconnectReason,
  formatConnectedAccountDate,
  formatReconnectionAlertCount,
  getAccountSettingsConnectedCopy,
} from '~/lib/i18n/catalogs/account-settings-connected';

const integrationConnection = {
  id: 'connection/one',
  provider: 'github',
  externalAccountLabel: 'CI_COMMIT_BOT',
  status: 'active' as const,
  forAgentUse: true,
  revokedAt: null,
  createdAt: '2026-08-04T12:00:00.000Z',
};

const identityConnection = {
  provider: 'github',
  externalId: 'github-user-1',
  createdAt: '2026-08-03T12:00:00.000Z',
};

const baseLoaderData = {
  integrationConnections: [integrationConnection],
  identityConnections: [identityConnection],
  reconnectionAlerts: [],
  loadErrors: { integration: null, identity: null, alerts: null },
  language: 'fr' as const,
};

function renderPage(loaderData: unknown = baseLoaderData, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;

  return render(<ConnectedAccountsPage />);
}

function apiResponse(status: number, payload?: Record<string, unknown>) {
  return new Response(payload ? JSON.stringify(payload) : '', {
    status,
    headers: payload ? { 'content-type': 'application/json' } : undefined,
  });
}

async function runAction(fields: Record<string, string>) {
  const result = (await action({
    request: new Request('https://e-code.ai/account-settings/connected', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
  } as never)) as {
    data: { statusCode?: string; errorCode?: string };
    init?: { status?: number } | number | null;
  };

  const init = typeof result.init === 'number' ? { status: result.init } : result.init;

  return { body: result.data, status: init?.status ?? 200 };
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

beforeEach(() => {
  apiRequestMock.mockReset();
  fetchMock.mockReset();
  launchMock.mockReset();
  popupResetMock.mockReset();
  revalidateMock.mockReset();
  submitMock.mockReset();
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
  routeState.navigationState = 'idle';
  routeState.navigationFormData = undefined;
  routeState.revalidatorState = 'idle';
  routeState.searchParams = new URLSearchParams();
  routeState.popupState = { phase: 'idle' };
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('connected accounts catalog', () => {
  it('keeps complete EN/FR and interpolation parity with English fallback', () => {
    expect(Object.keys(accountSettingsConnectedFr).sort()).toEqual(Object.keys(accountSettingsConnectedEn).sort());

    for (const key of Object.keys(accountSettingsConnectedEn) as Array<keyof typeof accountSettingsConnectedEn>) {
      expect(accountSettingsConnectedEn[key].trim().length, key).toBeGreaterThan(0);
      expect(accountSettingsConnectedFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(accountSettingsConnectedFr[key]), key).toEqual(
        interpolationTokens(accountSettingsConnectedEn[key]),
      );
    }

    expect(getAccountSettingsConnectedCopy('de')['accountSettingsConnected.action.connect']).toBe('Connect');
    expect(formatReconnectionAlertCount(1, 'fr')).toBe('1 connexion doit être rétablie');
    expect(formatReconnectionAlertCount(2, 'fr')).toBe('2 connexions doivent être rétablies');
    expect(formatConnectedAccountDate('2026-08-04T23:30:00.000Z', 'fr')).toBe('4 août 2026');
  });

  it('localizes only known OAuth codes, providers and alert reasons', () => {
    expect(connectedAccountProviderLabel('github', 'fr')).toBe('GitHub');
    expect(connectedAccountProviderLabel('unknown_provider', 'fr')).toBe('Fournisseur d’identité');
    expect(connectedAccountOauthError('access_denied', 'fr')).toBe('La demande a été annulée ou refusée.');
    expect(connectedAccountOauthError('INTERNAL_STACK_TRACE', 'fr')).toBe(
      'Impossible de terminer la demande. Réessayez.',
    );
    expect(connectedAccountReconnectReason('token_revoked', 'fr')).toContain('jeton d’accès');
    expect(connectedAccountReconnectReason('database_secret=123', 'fr')).toBe(
      'les identifiants enregistrés ne sont plus valides',
    );
  });
});

describe('connected accounts loader and action', () => {
  it('detects French, validates all three payloads and exposes localized metadata', async () => {
    apiRequestMock.mockImplementation((_request: Request, path: string) => {
      if (path === '/api/account/connections') {
        return Promise.resolve({ connections: [integrationConnection] });
      }

      if (path === '/auth/connections') {
        return Promise.resolve({ connections: [identityConnection] });
      }

      return Promise.resolve({ alerts: [] });
    });

    const result = await loader({
      request: new Request('https://e-code.ai/account-settings/connected', {
        headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      }),
    } as never);

    expect(result).toEqual(baseLoaderData);
    expect(meta({ data: result } as never)).toEqual([
      { title: 'Comptes connectés — E-Code' },
      {
        name: 'description',
        content:
          'Connectez des intégrations de dépôts et gérez les fournisseurs d’identité associés à votre compte E-Code.',
      },
    ]);
  });

  it('keeps resources independent and never turns malformed or failed data into a connected state', async () => {
    apiRequestMock.mockImplementation((_request: Request, path: string) => {
      if (path === '/api/account/connections') {
        return Promise.resolve({ connections: [{ id: 'incomplete' }] });
      }

      if (path === '/auth/connections') {
        return Promise.reject(apiResponse(403, { error: 'Raw English permission details' }));
      }

      return Promise.resolve({ alerts: [] });
    });

    const result = await loader({ request: new Request('https://e-code.ai/account-settings/connected') } as never);

    expect(result.integrationConnections).toEqual([]);
    expect(result.identityConnections).toEqual([]);
    expect(result.reconnectionAlerts).toEqual([]);
    expect(result.loadErrors).toEqual({ integration: 'temporary', identity: 'permission', alerts: null });
    expect(JSON.stringify(result)).not.toContain('Raw English permission details');
  });

  it('rethrows authentication redirects from any parallel loader resource', async () => {
    const loginRedirect = new Response(null, { status: 302, headers: { Location: '/login' } });

    apiRequestMock.mockImplementation((_request: Request, path: string) => {
      if (path === '/auth/connections') {
        return Promise.reject(loginRedirect);
      }

      return Promise.resolve(path.includes('alerts') ? { alerts: [] } : { connections: [] });
    });

    await expect(
      loader({ request: new Request('https://e-code.ai/account-settings/connected') } as never),
    ).rejects.toBe(loginRedirect);
  });

  it('validates identity unlink and returns stable success codes', async () => {
    await expect(runAction({ intent: 'unsupported', provider: 'github' })).resolves.toEqual({
      status: 400,
      body: { errorCode: 'unsupportedAction' },
    });
    await expect(runAction({ intent: 'unlink-identity', provider: '../internal' })).resolves.toEqual({
      status: 400,
      body: { errorCode: 'invalidProvider' },
    });
    expect(apiRequestMock).not.toHaveBeenCalled();

    apiRequestMock.mockResolvedValueOnce({ deleted: true });

    await expect(runAction({ intent: 'unlink-identity', provider: ' GITHUB ' })).resolves.toEqual({
      status: 200,
      body: { statusCode: 'identityUnlinked' },
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.any(Request),
      '/auth/connections/github',
      expect.objectContaining({ method: 'DELETE', redirectOn401: false }),
    );
  });

  it('maps anti-lockout, missing, upstream and network failures without leaking prose', async () => {
    apiRequestMock.mockRejectedValueOnce(
      apiResponse(400, { code: 'LAST_LOGIN_METHOD', error: 'Cannot unlink internal account 42' }),
    );

    await expect(runAction({ intent: 'unlink-identity', provider: 'github' })).resolves.toEqual({
      status: 400,
      body: { errorCode: 'lastLoginMethod' },
    });

    apiRequestMock.mockRejectedValueOnce(
      apiResponse(404, { code: 'CONNECTION_NOT_FOUND', error: 'Database row missing' }),
    );

    await expect(runAction({ intent: 'unlink-identity', provider: 'google' })).resolves.toEqual({
      status: 404,
      body: { errorCode: 'connectionNotFound' },
    });

    apiRequestMock.mockRejectedValueOnce(new Error('private upstream hostname'));

    const unavailable = await runAction({ intent: 'unlink-identity', provider: 'github' });
    expect(unavailable).toEqual({ status: 502, body: { errorCode: 'serviceUnavailable' } });
    expect(JSON.stringify(unavailable)).not.toMatch(/internal account|Database row|private upstream/iu);
  });

  it('rethrows an action redirect instead of swallowing authentication navigation', async () => {
    const loginRedirect = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequestMock.mockRejectedValueOnce(loginRedirect);

    await expect(
      action({
        request: new Request('https://e-code.ai/account-settings/connected', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ intent: 'unlink-identity', provider: 'github' }).toString(),
        }),
      } as never),
    ).rejects.toBe(loginRedirect);
  });
});

describe('connected accounts French surface', () => {
  it('renders providers, dates, states and actions in French while preserving customer data', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Comptes connectés' })).toBeTruthy();
    expect(screen.getByText(/intégrations utilisées par l’agent/u)).toBeTruthy();
    expect(
      screen.getByText('Connecté pour importer des dépôts, effectuer des push et créer des pull requests.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'GitHub (connexion)' })).toBeTruthy();
    expect(screen.getByText('Connectez-vous avec Google et vérifiez les domaines de l’entreprise.')).toBeTruthy();
    expect(screen.getByText(/configuration OIDC.*paramètres SSO/u)).toBeTruthy();
    expect(screen.getByText('Compte CI_COMMIT_BOT').textContent).toBe('Compte CI_COMMIT_BOT');
    expect(screen.getByText('Associé depuis le 4 août 2026')).toBeTruthy();
    expect(screen.getAllByText('Connecté')).toHaveLength(2);
    expect(screen.getAllByText('Non connecté')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Déconnecter GitHub' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dissocier GitHub (connexion) de ce compte' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Associer Google à ce compte' }).getAttribute('href')).toBe(
      '/auth/oauth/google?mode=link',
    );
    expect(document.body.textContent).not.toMatch(/Connected for repository|Linked since|Not connected|Disconnect/u);

    const firstRow = screen.getByText('Compte CI_COMMIT_BOT').closest('li');
    expect(firstRow?.className).toContain('min-w-0');
    expect(firstRow?.className).toContain('lg:flex-row');

    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control.className).toContain('min-h-[44px]');
      expect(control.className).not.toContain('truncate');
    }
  });

  it('localizes safe OAuth query results and structured action results without echoing query details', () => {
    routeState.searchParams = new URLSearchParams(
      'linked=github&linkError=unknown_provider&detail=RAW_INTERNAL_STACK_TRACE',
    );

    renderPage(baseLoaderData, {
      errorCode: 'lastLoginMethod',
      error: 'Raw upstream English user=42',
    });

    expect(screen.getByText('GitHub a été associé à votre compte.')).toBeTruthy();
    expect(screen.getByText(/Impossible d’associer Fournisseur d’identité/u)).toBeTruthy();
    expect(screen.getByText(/Impossible de terminer la demande/u)).toBeTruthy();
    expect(screen.getByText(/Il s’agit de votre seule méthode de connexion/u)).toBeTruthy();
    expect(document.body.textContent).not.toContain('RAW_INTERNAL_STACK_TRACE');
    expect(document.body.textContent).not.toContain('Raw upstream English');
  });

  it('deduplicates alerts, localizes plurals, reasons and dates, and preserves account labels', () => {
    renderPage({
      ...baseLoaderData,
      reconnectionAlerts: [
        {
          id: 'alert/one',
          userConnectionId: 'connection/one',
          provider: 'github',
          externalAccountLabel: 'ops@example.test',
          reason: 'token_revoked',
          detectedAt: '2026-08-04T12:00:00.000Z',
        },
        {
          id: 'alert-two',
          userConnectionId: 'connection/one',
          provider: 'github',
          externalAccountLabel: 'SHOULD_NOT_RENDER',
          reason: 'database_secret=123',
          detectedAt: '2026-08-03T12:00:00.000Z',
        },
      ],
    });

    expect(screen.getByRole('heading', { name: '1 connexion doit être rétablie' })).toBeTruthy();
    expect(screen.getByText(/ops@example\.test/u)).toBeTruthy();
    expect(screen.getByText(/jeton d’accès enregistré a été révoqué/u)).toBeTruthy();
    expect(screen.getByText('Détectée le 4 août 2026')).toBeTruthy();
    expect(document.body.textContent).not.toContain('SHOULD_NOT_RENDER');
    expect(document.body.textContent).not.toContain('database_secret');
    expect(screen.getByRole('button', { name: 'Reconnecter GitHub' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ignorer l’alerte de reconnexion à GitHub' })).toBeTruthy();
  });

  it('renders independent recoverable loader failures without false connection actions', () => {
    const { rerender } = renderPage({
      ...baseLoaderData,
      integrationConnections: [],
      identityConnections: [],
      loadErrors: { integration: 'temporary', identity: 'permission', alerts: 'temporary' },
    });

    expect(screen.getByRole('heading', { name: 'Impossible de charger les connexions aux intégrations' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Impossible de charger les connexions utilisées pour se connecter' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Impossible de charger les alertes de connexion' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Recharger les comptes connectés' })).toHaveLength(2);
    expect(screen.getAllByText('Indisponible')).toHaveLength(4);
    expect(screen.queryByText('Non connecté')).toBeNull();
    expect(screen.queryByRole('button', { name: /Connecter GitHub/u })).toBeNull();
    expect(screen.queryByRole('link', { name: /Associer Google/u })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Recharger les comptes connectés' })[0]!);
    expect(revalidateMock).toHaveBeenCalledOnce();

    routeState.revalidatorState = 'loading';
    rerender(<ConnectedAccountsPage />);
    expect(screen.getByLabelText('Chargement des connexions aux intégrations')).toBeTruthy();
    expect(screen.getByLabelText('Chargement des connexions utilisées pour se connecter')).toBeTruthy();
    expect(screen.getByLabelText('Chargement des alertes de connexion')).toBeTruthy();
  });

  it('uses localized confirmations and encoded identifiers for disconnect and unlink', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter GitHub' }));
    expect(screen.getByRole('alertdialog', { name: 'Déconnecter GitHub ?' })).toBeTruthy();
    expect(screen.getByText(/accès de l’agent.*OAuth/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter l’intégration' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/account/connections/connection%2Fone/revoke',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dissocier GitHub (connexion) de ce compte' }));
    expect(screen.getByRole('alertdialog', { name: 'Dissocier GitHub (connexion) ?' })).toBeTruthy();
    expect(screen.getByText(/autre méthode de connexion/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dissocier le fournisseur' }));
    expect(submitMock).toHaveBeenCalledWith({ intent: 'unlink-identity', provider: 'github' }, { method: 'post' });
  });

  it('starts connector OAuth from a validated URL and ignores the response provider field', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ provider: 'attacker-provider', authorizationUrl: 'https://github.com/login/oauth/authorize' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    renderPage({ ...baseLoaderData, integrationConnections: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Connecter GitHub' }));

    await waitFor(() => {
      expect(launchMock).toHaveBeenCalledWith({
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        provider: 'github',
      });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/integrations/oauth/github/connect',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects an unsafe OAuth authorization URL without opening it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ authorizationUrl: 'javascript:alert(document.cookie)' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderPage({ ...baseLoaderData, integrationConnections: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Connecter GitHub' }));

    expect(
      await screen.findByText(
        'Le service de connexion a renvoyé une réponse invalide. Aucune connexion n’a été modifiée.',
      ),
    ).toBeTruthy();
    expect(launchMock).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('javascript:');
  });

  it('maps client and popup failures to reviewed French copy without reading response prose', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Raw upstream English secret=123' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { unmount } = renderPage({ ...baseLoaderData, integrationConnections: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Connecter GitHub' }));

    expect(
      await screen.findByText('Vous ne disposez pas de l’autorisation nécessaire pour modifier cette connexion.'),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('Raw upstream English');
    unmount();

    routeState.popupState = {
      phase: 'failed',
      result: {
        ok: false,
        provider: 'github',
        errorCode: 'POPUP_BLOCKED',
        errorMessage: 'Raw popup English secret=456',
      },
    };

    renderPage({ ...baseLoaderData, integrationConnections: [] });
    expect(await screen.findByText(/fenêtre OAuth a été bloquée/u)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Raw popup English');
    expect(popupResetMock).toHaveBeenCalled();
  });

  it('submits alert dismissal through an encoded path and localizes action progress', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const alert = {
      id: 'alert/one',
      userConnectionId: 'connection/one',
      provider: 'github',
      externalAccountLabel: 'ops@example.test',
      reason: 'unknown_backend_reason',
      detectedAt: '2026-08-04T12:00:00.000Z',
    };

    renderPage({ ...baseLoaderData, reconnectionAlerts: [alert] });
    fireEvent.click(screen.getByRole('button', { name: 'Ignorer l’alerte de reconnexion à GitHub' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/account/reconnection-alerts/alert%2Fone/resolve',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(revalidateMock).toHaveBeenCalled();
    });

    const pending = new FormData();
    pending.set('provider', 'github');
    routeState.navigationState = 'submitting';
    routeState.navigationFormData = pending;
    cleanup();
    renderPage();
    expect(screen.getByText('Dissociation…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dissocier GitHub (connexion) de ce compte' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
