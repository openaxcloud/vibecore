/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import type { FormEventHandler, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routeState = vi.hoisted(() => ({
  actionData: undefined as unknown,
  loaderData: undefined as unknown,
  navigationState: 'idle',
}));

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
    useNavigation: () => ({ state: routeState.navigationState }),
  };
});

vi.mock('react-qrcode-logo', () => ({
  QRCode: ({ value }: { value: string }) => <span data-testid="qr-value">{value}</span>,
}));

vi.mock('~/components/enterprise/EnterpriseFormPage', () => ({
  EnterpriseFormPage: ({
    title,
    description,
    error,
    children,
  }: {
    title: string;
    description: string;
    error?: string;
    children: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {error ? <p role="alert">{error}</p> : null}
      {children}
    </main>
  ),
  PrimaryButton: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => (
    <button type="submit" disabled={disabled}>
      {children}
    </button>
  ),
}));

import MfaSetupPage, { action, meta } from './mfa-setup';
import { getMfaSetupCopy } from '~/lib/i18n/catalogs/mfa-setup';
import { toResponse } from '~/lib/test/rr7-data';

function renderPage(loaderData: unknown, actionData?: unknown, navigationState = 'idle') {
  routeState.loaderData = loaderData;
  routeState.actionData = actionData;
  routeState.navigationState = navigationState;

  return render(<MfaSetupPage />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  routeState.actionData = undefined;
  routeState.loaderData = undefined;
  routeState.navigationState = 'idle';
});

describe('MFA setup i18n', () => {
  it('falls back to English and localizes metadata', () => {
    expect(getMfaSetupCopy('de')['mfaSetup.setup.enable']).toBe('Enable two-factor authentication');
    expect(getMfaSetupCopy('fr-FR')['mfaSetup.setup.enable']).toBe('Activer l’authentification à deux facteurs');
    expect(
      meta({
        data: undefined,
        location: {} as never,
        params: {},
        matches: [{ id: 'root', data: { language: 'fr' } }] as never,
      })?.[0],
    ).toEqual({ title: 'Authentification à deux facteurs - E-Code' });
  });

  it('renders enrollment completely in French while preserving TOTP values and brands', () => {
    renderPage({
      status: 'setup',
      language: 'fr',
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUrl: 'otpauth://totp/E-Code:user@example.com?secret=JBSWY3DPEHPK3PXP',
    });

    expect(screen.getByRole('heading', { name: 'Configurer l’authentification à deux facteurs' })).toBeTruthy();
    expect(screen.getByText(/Google Authenticator, 1Password ou Authy/u)).toBeTruthy();
    expect(screen.getByLabelText('Code QR de configuration de l’authentificateur')).toBeTruthy();
    expect(screen.getByTestId('mfa-setup-secret').textContent).toContain('JBSWY3DPEHPK3PXP');
    expect(screen.getByTestId('qr-value').textContent).toContain('otpauth://totp/E-Code:user@example.com');
    expect(screen.getByLabelText('Code à 6 chiffres')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activer l’authentification à deux facteurs' })).toBeTruthy();
    expect(screen.queryByText('Cannot scan it?')).toBeNull();
  });

  it('renders reauthentication, submitting, enabled and recovery-code states in French', () => {
    const { rerender } = renderPage(
      { status: 'reauth', language: 'fr' },
      { error: 'Ce mot de passe ne correspond pas. Réessayez.' },
      'submitting',
    );

    expect(screen.getByRole('heading', { name: 'Confirmez votre mot de passe' })).toBeTruthy();
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmation…' })).toBeTruthy();

    routeState.loaderData = { status: 'enabled', language: 'fr' };
    routeState.actionData = undefined;
    routeState.navigationState = 'idle';
    rerender(<MfaSetupPage />);

    expect(screen.getByText('L’authentification à deux facteurs est activée')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Codes de récupération' }).getAttribute('href')).toBe('/recovery-codes');

    routeState.actionData = { enabled: true, codes: ['aaaa-bbbb', 'cccc-dddd'] };
    rerender(<MfaSetupPage />);

    expect(screen.getByRole('heading', { name: 'L’authentification à deux facteurs est activée' })).toBeTruthy();
    expect(screen.getByText('aaaa-bbbb')).toBeTruthy();
    expect(screen.getByText('cccc-dddd')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tout copier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Télécharger' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terminer' }).getAttribute('href')).toBe('/dashboard');
  });

  it('masks raw verification errors in French', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Raw backend English MFA stack', code: 'MFA_INVALID_CODE' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const response = toResponse(
      await action({
        request: new Request('https://e-code.ai/mfa-setup?lang=fr', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ intent: 'verify', code: '000000' }).toString(),
        }),
        params: {},
        context: {} as never,
      }),
    );

    const payload = (await response.json()) as { error: string };

    expect(payload.error).toBe(
      'Ce code ne correspond pas. Vérifiez votre application d’authentification, puis réessayez.',
    );
    expect(payload.error).not.toContain('Raw backend English MFA stack');
  });
});
