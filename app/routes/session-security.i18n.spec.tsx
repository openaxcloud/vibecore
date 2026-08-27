/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, FormEventHandler, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(
  (): {
    loaderData: {
      orgId: string;
      sessions: Array<{
        id: string;
        ipAddress: string | null;
        userAgent: string | null;
        device: string;
        createdAt: string;
        current: boolean;
      }>;
      sessionsUnavailable: boolean;
      language: 'en' | 'fr';
    };
    actionData: { statusCode?: string; errorCode?: string } | undefined;
    navigation: { state: 'idle' | 'submitting' | 'loading'; formData?: FormData };
    revalidator: { state: 'idle' | 'loading'; revalidate: ReturnType<typeof vi.fn> };
    submit: ReturnType<typeof vi.fn>;
    toastSuccess: ReturnType<typeof vi.fn>;
  } => ({
    loaderData: {
      orgId: 'org_1',
      sessions: [],
      sessionsUnavailable: false,
      language: 'fr',
    },
    actionData: undefined,
    navigation: { state: 'idle' },
    revalidator: { state: 'idle', revalidate: vi.fn() },
    submit: vi.fn(),
    toastSuccess: vi.fn(),
  }),
);

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({
      children,
      onSubmit,
      ...props
    }: ComponentProps<'form'> & { onSubmit?: FormEventHandler<HTMLFormElement> }) => (
      <form onSubmit={onSubmit} {...props}>
        {children}
      </form>
    ),
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => routeState.navigation,
    useRevalidator: () => routeState.revalidator,
    useSubmit: () => routeState.submit,
  };
});

vi.mock('react-toastify', () => ({
  toast: { success: routeState.toastSuccess },
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
  TextField: ({
    label,
    name,
    type,
    placeholder,
  }: {
    label: string;
    name: string;
    type?: string;
    placeholder?: string;
  }) => (
    <label>
      {label}
      <input name={name} type={type} placeholder={placeholder} />
    </label>
  ),
  PrimaryButton: ({ children, ...props }: ComponentProps<'button'>) => <button {...props}>{children}</button>,
}));

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    onConfirm,
    title,
    description,
    confirmLabel,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel: string;
  }) =>
    isOpen ? (
      <section role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </section>
    ) : null,
}));

vi.mock('~/components/dashboard/UserAreaRouteError', () => ({
  UserAreaRouteErrorBoundary: () => null,
}));

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: vi.fn(),
  currentSessionTokenHash: vi.fn(),
  firstOrganizationOrNull: vi.fn(),
  formObject: vi.fn(),
  isApiResponse: vi.fn(),
  json: vi.fn(),
  redirect: vi.fn(),
}));

import SessionSecurityPage, { meta } from './session-security';

function frenchSessions() {
  return [
    {
      id: 'session_current',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit Chrome/126.0',
      device: 'Chrome sur macOS',
      createdAt: '2026-06-02T14:05:00.000Z',
      current: true,
    },
    {
      id: 'session_other',
      ipAddress: null,
      userAgent: 'Mozilla/5.0 (Windows) Gecko Firefox/128.0',
      device: 'Firefox sur Windows',
      createdAt: '2026-06-01T09:30:00.000Z',
      current: false,
    },
  ];
}

beforeEach(() => {
  routeState.loaderData.language = 'fr';
  routeState.loaderData.sessions = frenchSessions();
  routeState.loaderData.sessionsUnavailable = false;
  routeState.actionData = undefined;
  routeState.navigation = { state: 'idle' };
  routeState.revalidator.state = 'idle';
  routeState.revalidator.revalidate.mockReset();
  routeState.submit.mockReset();
  routeState.toastSuccess.mockReset();
});

afterEach(() => cleanup());

describe('session security rendered i18n', () => {
  it('localizes SEO, sessions, devices, dates, IP labels, actions and policy fields in French', () => {
    const tags = meta({ data: { language: 'fr' } } as never);
    const { container } = render(<SessionSecurityPage />);

    expect(tags).toContainEqual({ title: 'Sécurité des sessions — E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({ name: 'description', content: expect.stringContaining('sessions E-Code actives') }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Sécurité des sessions' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions actives' })).toBeTruthy();
    expect(screen.getByText('Chrome sur macOS')).toBeTruthy();
    expect(screen.getByText('Firefox sur Windows')).toBeTruthy();
    expect(screen.getByText('Cet appareil')).toBeTruthy();
    expect(screen.getByText('Session actuelle')).toBeTruthy();
    expect(screen.getByText(/IP\s*:\s*203\.0\.113\.10/u)).toBeTruthy();
    expect(screen.getByText('Adresse IP inconnue')).toBeTruthy();
    expect(screen.getByText(/Connexion le 2 juin 2026/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Déconnecter toutes les autres sessions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Révoquer' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Politique de session de l’organisation' })).toBeTruthy();
    expect(screen.getByLabelText('Durée de session (en minutes)')).toBeTruthy();
    expect(screen.getByLabelText('Adresses IP autorisées').getAttribute('placeholder')).toBe(
      '203.0.113.10,198.51.100.0/24',
    );
    expect(screen.getByRole('button', { name: 'Enregistrer la politique' })).toBeTruthy();
    expect(container.textContent).not.toContain('Session security');
    expect(container.textContent).not.toContain('Active sessions');
    expect(container.textContent).not.toContain('Unknown device');
  });

  it('uses localized confirmation dialogs and submits stable action intents', () => {
    render(<SessionSecurityPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    expect(screen.getByRole('dialog', { name: 'Révoquer cette session (Firefox sur Windows) ?' })).toBeTruthy();
    expect(screen.getByText('Cet appareil sera immédiatement déconnecté.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer la session' }));
    expect(routeState.submit).toHaveBeenCalledWith(
      { intent: 'revoke', sessionId: 'session_other' },
      { method: 'post' },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter toutes les autres sessions' }));
    expect(screen.getByRole('dialog', { name: 'Déconnecter toutes les autres sessions ?' })).toBeTruthy();
    expect(screen.getByText(/Votre session actuelle restera active/u)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter les autres sessions' }));
    expect(routeState.submit).toHaveBeenCalledWith({ intent: 'revoke-all' }, { method: 'post' });
  });

  it('renders a recoverable localized error without exposing raw session errors', () => {
    routeState.loaderData.sessions = [];
    routeState.loaderData.sessionsUnavailable = true;

    render(<SessionSecurityPage />);

    expect(screen.getByRole('heading', { level: 2, name: 'Impossible de charger les sessions actives' })).toBeTruthy();
    expect(screen.getByText(/Aucune session n’a été révoquée/u)).toBeTruthy();
    expect(screen.queryByText(/private host|network down|API error/u)).toBeNull();
    expect(screen.queryByText('Aucune session active.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Recharger les sessions' }));
    expect(routeState.revalidator.revalidate).toHaveBeenCalledTimes(1);
  });

  it('shows an explicit localized skeleton while failed sessions are reloading', () => {
    routeState.loaderData.sessions = [];
    routeState.loaderData.sessionsUnavailable = true;
    routeState.revalidator.state = 'loading';

    render(<SessionSecurityPage />);

    expect(screen.getByRole('status', { name: 'Chargement des sessions actives' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders localized semantic action results and sends the revoke-all toast without string matching', () => {
    routeState.actionData = { statusCode: 'otherSessionsRevoked' };

    const { rerender } = render(<SessionSecurityPage />);

    expect(screen.getByRole('status').textContent).toBe('Toutes les autres sessions ont été déconnectées.');
    expect(routeState.toastSuccess).toHaveBeenCalledWith('Toutes les autres sessions ont été déconnectées.');

    routeState.actionData = { errorCode: 'forbidden' };
    rerender(<SessionSecurityPage />);

    expect(screen.getByRole('alert').textContent).toBe(
      'Vous n’êtes pas autorisé à effectuer cette action de sécurité.',
    );
    expect(screen.queryByText(/permission denied|stack|private host/iu)).toBeNull();
  });

  it('keeps English as the default fallback surface', () => {
    routeState.loaderData.language = 'en';
    routeState.loaderData.sessions = [
      {
        ...frenchSessions()[0],
        device: 'Chrome on macOS',
      },
    ];

    render(<SessionSecurityPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Session security' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Active sessions' })).toBeTruthy();
    expect(screen.getByText('This device')).toBeTruthy();
    expect(screen.getByText(/Signed in 2 Jun 2026/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save policy' })).toBeTruthy();
  });

  it('distinguishes the empty state from an unavailable session list', () => {
    routeState.loaderData.sessions = [];

    render(<SessionSecurityPage />);

    expect(screen.getByText('Aucune session active.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps long French actions and metadata wrap-safe on narrow screens', () => {
    const pending = new FormData();
    pending.set('intent', 'revoke-all');
    routeState.navigation = { state: 'submitting', formData: pending };

    const { container } = render(<SessionSecurityPage />);
    const revokeAll = screen.getByRole('button', { name: 'Déconnexion des autres sessions…' });
    const revokeOne = screen.getByRole('button', { name: 'Révoquer' });

    expect(revokeAll.className).toContain('w-full');
    expect(revokeAll.className).toContain('sm:w-auto');
    expect(revokeAll.className).toContain('whitespace-normal');
    expect(revokeOne.className).toContain('w-full');
    expect(screen.getByText(/IP\s*:\s*203\.0\.113\.10/u).parentElement?.className).toContain('flex-wrap');
    expect(container.innerHTML).not.toContain('truncate');
  });
});
