/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
const revalidateMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());

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
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState, formMethod: routeState.formMethod }),
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
  PrimaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
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

vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({
    isOpen,
    title,
    description,
    confirmLabel,
    onConfirm,
  }: {
    isOpen: boolean;
    title: string;
    description: ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <section role="dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </section>
    ) : null,
}));

import RecoveryCodesPage, { action, loader, meta } from './recovery-codes';
import {
  formatRecoveryCodesRemaining,
  getRecoveryCodesCopy,
  recoveryCodesErrorMessage,
} from '~/lib/i18n/catalogs/recovery-codes';

function renderPage(loaderData: unknown, actionData?: unknown) {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;
  routeState.navigationState = 'idle';
  routeState.formMethod = undefined;
  routeState.revalidatorState = 'idle';

  return render(<RecoveryCodesPage />);
}

async function runAction(password: string) {
  return (await action({
    request: new Request('https://e-code.ai/recovery-codes?lang=fr', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password }).toString(),
    }),
    params: {},
    context: {},
  })) as { data: { statusCode?: string; errorCode?: string; codes?: string[] }; init?: { status?: number } };
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  revalidateMock.mockReset();
  submitMock.mockReset();
  routeState.loaderData = undefined;
  routeState.actionData = undefined;
});

describe('recovery codes i18n', () => {
  it('renders the complete French low-code surface with responsive, wrapping controls', () => {
    renderPage({ status: { remaining: 2, total: 10 }, statusUnavailable: false, language: 'fr' });

    expect(screen.getByRole('heading', { name: 'Codes de récupération' })).toBeTruthy();
    expect(screen.getByText('2 codes de récupération restants')).toBeTruthy();
    expect(screen.getByText('Bientôt épuisés')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Solution de secours à usage unique/u })).toBeTruthy();
    expect(screen.getByText(/Vous disposez actuellement de 2 codes inutilisés sur 10/u)).toBeTruthy();
    expect(screen.getByLabelText('Mot de passe actuel')).toBeTruthy();

    const button = screen.getByRole('button', { name: 'Générer les codes de récupération' });
    expect(button.closest('form')?.className).toContain('min-w-0');
    expect(screen.queryByText('Generate recovery codes')).toBeNull();
  });

  it('opens the French confirmation, submits the password once and clears it from the field', () => {
    renderPage({ status: { remaining: 8, total: 10 }, statusUnavailable: false, language: 'fr' });

    const passwordInput = screen.getByLabelText('Mot de passe actuel') as HTMLInputElement;

    fireEvent.change(passwordInput, { target: { value: 'correct horse battery staple' } });
    fireEvent.submit(passwordInput.closest('form') as HTMLFormElement);

    expect(screen.getByRole('heading', { name: 'Générer de nouveaux codes de récupération ?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Générer les codes' }));

    expect(submitMock).toHaveBeenCalledWith({ password: 'correct horse battery staple' }, { method: 'post' });
    expect(passwordInput.value).toBe('');
  });

  it('renders recoverable status failure and safe action errors without inventing a count', () => {
    renderPage({ status: null, statusUnavailable: true, language: 'fr' }, { errorCode: 'unavailable' });

    expect(
      screen.getByRole('heading', { name: 'Impossible de charger l’état des codes de récupération' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recharger l’état' })).toBeTruthy();
    expect(screen.getByText(/Le nombre de codes inutilisés est indisponible/u)).toBeTruthy();
    expect(
      screen.getByText(
        'Les codes de récupération sont temporairement indisponibles. Réessayez dans quelques instants.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/0 sur 10/u)).toBeNull();
  });

  it('preserves generated secret values and renders the one-time French guidance', () => {
    renderPage(
      { status: { remaining: 1, total: 10 }, statusUnavailable: false, language: 'fr' },
      { statusCode: 'rotated', codes: ['ABCD-EFGH', 'IJKL-MNOP'] },
    );

    expect(screen.getByText('ABCD-EFGH')).toBeTruthy();
    expect(screen.getByText('IJKL-MNOP')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Enregistrez ces codes de récupération maintenant' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copier tous les codes' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).not.toContain('Recovery codes were regenerated');
  });

  it('detects French in SSR and masks a raw loader error', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Raw backend English status failure' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = (await loader({
      request: new Request('https://e-code.ai/recovery-codes', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
      params: {},
      context: {},
    })) as { data: { status: unknown; statusUnavailable: boolean; language: string } };

    expect(response.data).toEqual({ status: null, statusUnavailable: true, language: 'fr' });
    expect(JSON.stringify(response.data)).not.toContain('Raw backend English status failure');
  });

  it('treats an impossible status payload as unavailable instead of rendering false data', async () => {
    apiRequestMock.mockResolvedValueOnce({ remaining: 11, total: 10 });

    const response = (await loader({
      request: new Request('https://e-code.ai/recovery-codes?lang=fr'),
      params: {},
      context: {},
    })) as { data: { status: unknown; statusUnavailable: boolean; language: string } };

    expect(response.data).toEqual({ status: null, statusUnavailable: true, language: 'fr' });
  });

  it('performs real password re-auth before rotation and returns only validated codes', async () => {
    apiRequestMock.mockResolvedValueOnce({ reauthenticated: true });
    apiRequestMock.mockResolvedValueOnce({ codes: ['ABCD-EFGH', 'IJKL-MNOP'] });

    const response = await runAction('correct horse battery staple');

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      expect.any(Request),
      '/auth/reauth',
      expect.objectContaining({
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ password: 'correct horse battery staple' }),
      }),
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, expect.any(Request), '/auth/recovery-codes', { method: 'POST' });
    expect(response.data).toEqual({ statusCode: 'rotated', codes: ['ABCD-EFGH', 'IJKL-MNOP'] });
  });

  it('rejects an empty password before the API and masks raw re-auth errors', async () => {
    const missing = await runAction('');
    expect(missing.data.errorCode).toBe('passwordRequired');
    expect(apiRequestMock).not.toHaveBeenCalled();

    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid credentials', code: 'AUTH_INVALID_CREDENTIALS' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const invalid = await runAction('wrong password');

    expect(invalid.data.errorCode).toBe('incorrectPassword');
    expect(JSON.stringify(invalid.data)).not.toContain('Invalid credentials');
    expect(recoveryCodesErrorMessage('incorrectPassword', 'fr')).toBe(
      'Le mot de passe est incorrect. Vérifiez-le, puis réessayez.',
    );
  });

  it('redirects an expired session instead of misreporting it as a wrong password', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Re-auth requires an active session', code: 'SESSION_REQUIRED' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    let thrown: unknown;

    try {
      await runAction('password');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('location')).toContain('/login?returnTo=');
  });

  it('maps REAUTH_REQUIRED and server failures to stable codes without raw messages', async () => {
    apiRequestMock.mockResolvedValueOnce({ reauthenticated: true });
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Recent re-authentication required', code: 'REAUTH_REQUIRED' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const required = await runAction('password');

    apiRequestMock.mockResolvedValueOnce({ reauthenticated: true });
    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Database connection refused' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const unavailable = await runAction('password');

    expect(required.data.errorCode).toBe('reauthRequired');
    expect(unavailable.data.errorCode).toBe('unavailable');
    expect(JSON.stringify([required.data, unavailable.data])).not.toMatch(
      /Recent re-authentication|Database connection/u,
    );
  });

  it('falls back to English while keeping French plurals and metadata localized', () => {
    expect(getRecoveryCodesCopy('de')['recoveryCodes.form.submit']).toBe('Generate recovery codes');
    expect(formatRecoveryCodesRemaining(1, 'fr')).toBe('1 code de récupération restant');
    expect(formatRecoveryCodesRemaining(2, 'fr')).toBe('2 codes de récupération restants');
    expect(meta({ matches: [{ id: 'root', data: { language: 'fr' } }] } as never)?.[0]).toEqual({
      title: 'Codes de récupération — E-Code',
    });
  });
});
