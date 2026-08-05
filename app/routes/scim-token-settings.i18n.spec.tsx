/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, FormHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
  navigationFormData: undefined as FormData | undefined,
  revalidatorState: 'idle',
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>,
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState, formData: routeState.navigationFormData }),
    useRevalidator: () => ({ state: routeState.revalidatorState, revalidate: revalidateMock }),
    useSubmit: () => submitMock,
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
  PrimaryButton: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="submit" {...props}>
      {children}
    </button>
  ),
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

import ScimTokenSettingsPage from './scim-token-settings';
import {
  formatScimTokenCount,
  formatScimTokenDate,
  formatScimTokenError,
  formatScimTokenSettingsCopy,
  getScimTokenSettingsCopy,
  scimTokenSettingsEn,
  scimTokenSettingsFr,
} from '~/lib/i18n/catalogs/scim-token-settings';

const customerTokenName = 'OPS_COMMIT_01';

const frenchLoaderData = {
  orgId: 'org_1',
  language: 'fr' as const,
  loadErrorKind: null,
  scimTokens: [
    {
      id: 'token_1',
      name: customerTokenName,
      createdAt: '2026-01-02T03:04:05.000Z',
      lastUsedAt: null,
      expiresAt: '2027-01-02T03:04:05.000Z',
      expired: true,
    },
  ],
};

function renderPage(loaderData: unknown = frenchLoaderData, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;

  return render(<ScimTokenSettingsPage />);
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

beforeEach(() => {
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
  routeState.navigationState = 'idle';
  routeState.navigationFormData = undefined;
  routeState.revalidatorState = 'idle';
  revalidateMock.mockReset();
  submitMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SCIM token settings i18n catalog', () => {
  it('keeps complete EN/FR parity, interpolation parity and English fallback', () => {
    expect(Object.keys(scimTokenSettingsFr).sort()).toEqual(Object.keys(scimTokenSettingsEn).sort());

    for (const key of Object.keys(scimTokenSettingsEn) as Array<keyof typeof scimTokenSettingsEn>) {
      expect(scimTokenSettingsEn[key].trim().length, key).toBeGreaterThan(0);
      expect(scimTokenSettingsFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(scimTokenSettingsFr[key]), key).toEqual(interpolationTokens(scimTokenSettingsEn[key]));
    }

    expect(getScimTokenSettingsCopy('de')['scimTokenSettings.create.submit']).toBe('Create SCIM token');
    expect(formatScimTokenCount(0, 'fr')).toBe('0 jeton');
    expect(formatScimTokenCount(2, 'fr')).toBe('2 jetons');
    expect(formatScimTokenDate('2026-08-04T23:30:00.000Z', 'fr')).toBe('4 août 2026');
    expect(
      formatScimTokenSettingsCopy(scimTokenSettingsFr['scimTokenSettings.dialog.title'], {
        name: customerTokenName,
      }),
    ).toContain(customerTokenName);
  });

  it('maps only structured error codes to reviewed French copy', () => {
    expect(formatScimTokenError({ errorCode: 'permissionDenied' }, 'fr')).toBe(
      'Votre rôle ne dispose pas de l’autorisation scim:manage nécessaire pour cette action.',
    );
    expect(formatScimTokenError({ errorCode: 'serviceUnavailable' }, 'de')).toBe(
      'SCIM token management is temporarily unavailable. Try again in a moment.',
    );
  });
});

describe('SCIM token settings French surface', () => {
  it('renders all empty-state controls in French', () => {
    renderPage({ ...frenchLoaderData, scimTokens: [] });

    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres des jetons SCIM' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Créer un jeton' })).toBeTruthy();
    expect(screen.getByLabelText('Nom du jeton').getAttribute('placeholder')).toBe('Provisionnement Okta');
    expect(screen.getByLabelText('Nom du jeton').getAttribute('maxlength')).toBe('256');
    expect(screen.getByRole('button', { name: 'Créer le jeton SCIM' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Jetons SCIM' })).toBeTruthy();
    expect(screen.getByText('0 jeton')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Aucun jeton SCIM pour le moment' })).toBeTruthy();
    expect(screen.getByText(/ajoutez-le à la configuration SCIM/u)).toBeTruthy();
    expect(screen.queryByText('Create a token')).toBeNull();
    expect(screen.queryByText('No SCIM tokens yet')).toBeNull();
  });

  it('localizes token metadata while preserving user and technical values exactly', () => {
    renderPage();

    expect(screen.getByText(customerTokenName).textContent).toBe(customerTokenName);
    expect(screen.getByText('1 jeton')).toBeTruthy();
    expect(screen.getByText('Expiré')).toBeTruthy();
    expect(screen.getByText('Créé le')).toBeTruthy();
    expect(screen.getByText('2 janv. 2026')).toBeTruthy();
    expect(screen.getByText('Dernière utilisation')).toBeTruthy();
    expect(screen.getByText('Jamais utilisé')).toBeTruthy();
    expect(screen.getByText('Expire le')).toBeTruthy();
    expect(screen.getByText('2 janv. 2027')).toBeTruthy();
    expect(screen.getByRole('button', { name: `Renouveler le jeton SCIM ${customerTokenName}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `Révoquer le jeton SCIM ${customerTokenName}` })).toBeTruthy();
    expect(screen.queryByText('Expired')).toBeNull();

    const tokenRow = screen.getByText(customerTokenName).closest('li');

    const actions = screen
      .getByRole('button', { name: `Renouveler le jeton SCIM ${customerTokenName}` })
      .closest('div');

    expect(tokenRow?.className).toContain('min-w-0');
    expect(tokenRow?.textContent).not.toContain('Created');
    expect(actions?.className).toContain('grid-cols-1');
    expect(actions?.className).toContain('sm:grid-cols-2');

    for (const button of screen.getAllByRole('button')) {
      expect(button.className).not.toContain('truncate');
    }
  });

  it('renders a one-time secret outside live status and copies only its exact value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const secret = 'scim_live_SECRET_123';

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderPage(frenchLoaderData, { statusCode: 'created', token: secret });

    expect(screen.getByRole('status').textContent).toContain('Jeton SCIM créé');
    expect(screen.getByRole('status').textContent).not.toContain(secret);
    expect(screen.getByRole('heading', { name: 'Copiez ce jeton maintenant' })).toBeTruthy();
    expect(screen.getByTestId('scim-token-secret').textContent).toBe(secret);
    expect(screen.getByTestId('scim-token-secret').getAttribute('dir')).toBe('ltr');

    fireEvent.click(screen.getByRole('button', { name: 'Copier le jeton' }));

    expect(await screen.findByRole('button', { name: 'Jeton copié' })).toBeTruthy();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(secret);
  });

  it('shows a localized clipboard failure without changing or logging the secret', async () => {
    const secret = 'scim_live_DO_NOT_LOG';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('clipboard denied')) },
    });

    renderPage(frenchLoaderData, { statusCode: 'rotated', token: secret });
    fireEvent.click(screen.getByRole('button', { name: 'Copier le jeton' }));

    expect(await screen.findByRole('button', { name: 'Échec de la copie' })).toBeTruthy();
    expect(screen.getByTestId('scim-token-secret').textContent).toBe(secret);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders field and global action results from codes, ignoring arbitrary prose', () => {
    const { rerender } = renderPage(frenchLoaderData, {
      errorCode: 'nameRequired',
      field: 'name',
      error: 'Raw upstream English secret=123',
    });

    const name = screen.getByLabelText('Nom du jeton');

    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Saisissez un nom pour ce jeton SCIM.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Raw upstream English');

    routeState.actionData = { errorCode: 'reauthRequired', error: 'Internal English policy' };
    rerender(<ScimTokenSettingsPage />);

    expect(screen.getByRole('alert').textContent).toContain('Réauthentifiez-vous');
    expect(document.body.textContent).not.toContain('Internal English policy');
  });

  it('distinguishes permission, retryable failure and loading without a false empty state', () => {
    const { rerender } = renderPage({ ...frenchLoaderData, scimTokens: [], loadErrorKind: 'permission' });

    expect(screen.getByRole('heading', { name: 'Accès aux jetons SCIM restreint' })).toBeTruthy();
    expect(screen.getByText(/scim:manage/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Recharger les jetons SCIM' })).toBeNull();
    expect(screen.queryByText('Aucun jeton SCIM pour le moment')).toBeNull();

    routeState.loaderData = { ...frenchLoaderData, scimTokens: [], loadErrorKind: 'temporary' };
    rerender(<ScimTokenSettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Recharger les jetons SCIM' }));
    expect(revalidateMock).toHaveBeenCalledOnce();

    routeState.revalidatorState = 'loading';
    rerender(<ScimTokenSettingsPage />);
    expect(screen.getByLabelText('Chargement des jetons SCIM')).toBeTruthy();
    expect(screen.queryByText('Aucun jeton SCIM pour le moment')).toBeNull();
  });

  it('localizes the destructive confirmation and submits only the selected identifiers', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: `Révoquer le jeton SCIM ${customerTokenName}` }));

    expect(screen.getByRole('alertdialog', { name: `Révoquer le jeton SCIM « ${customerTokenName} » ?` })).toBeTruthy();
    expect(screen.getByText(/Cette action est irréversible/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer le jeton' }));

    expect(submitMock).toHaveBeenCalledWith(
      { orgId: 'org_1', intent: 'revoke', tokenId: 'token_1' },
      { method: 'post' },
    );
  });

  it('uses action-specific French progress labels and disables every mutation', () => {
    const pending = new FormData();
    pending.set('intent', 'rotate');
    pending.set('tokenId', 'token_1');
    routeState.navigationState = 'submitting';
    routeState.navigationFormData = pending;

    renderPage();

    expect(screen.getByText('Renouvellement…')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: `Renouvellement du jeton SCIM ${customerTokenName} en cours` }),
    ).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Créer le jeton SCIM' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: `Révoquer le jeton SCIM ${customerTokenName}` })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
