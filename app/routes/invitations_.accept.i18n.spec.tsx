/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  actionData: { feedbackCode: 'accepted', roleKey: 'admin' } as unknown,
  loaderData: { language: 'fr', token: 'secure-user-token' },
  navigationState: 'idle',
}));

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return { ...actual, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({ children }: { children: ReactNode }) => <form>{children}</form>,
    useActionData: () => routeState.actionData,
    useLoaderData: () => routeState.loaderData,
    useNavigation: () => ({ state: routeState.navigationState }),
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
  TextField: ({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
  PrimaryButton: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import AcceptInvitationPage, { action, loader, meta } from './invitations_.accept';
import { createI18nInstance } from '~/lib/i18n/runtime';

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

function actionRequest(token: string, language = 'fr') {
  return new Request(`https://e-code.ai/invitations/accept?lang=${language}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  });
}

afterEach(() => {
  cleanup();
  apiRequestMock.mockReset();
  routeState.actionData = { feedbackCode: 'accepted', roleKey: 'admin' };
  routeState.loaderData = { language: 'fr', token: 'secure-user-token' };
  routeState.navigationState = 'idle';
});

describe('invitation acceptance i18n', () => {
  it('switches the complete form and feedback live while preserving the invitation token', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <AcceptInvitationPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Accepter l’invitation' })).toBeTruthy();
    expect((screen.getByLabelText('Jeton d’invitation') as HTMLInputElement).value).toBe('secure-user-token');
    expect(screen.getByRole('button', { name: 'Accepter l’invitation' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Administrateur');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Accept invitation' })).toBeTruthy();
    expect(screen.getByLabelText('Invitation token')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Admin');
  });

  it('uses a safe generic role label instead of exposing an unknown role key', () => {
    routeState.actionData = { feedbackCode: 'accepted', roleKey: 'internal_custom_role_key' };

    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <AcceptInvitationPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('status').textContent).toContain('membre de l’organisation');
    expect(screen.getByRole('status').textContent).not.toContain('internal_custom_role_key');
  });

  it('returns stable error codes without forwarding upstream invitation details', async () => {
    const missing = await action({ request: actionRequest('') } as never);

    apiRequestMock.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'Invitation belongs to a private tenant.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const rejected = await action({ request: actionRequest('secret-token') } as never);

    expect(readData(missing)).toEqual({ errorCode: 'tokenRequired' });
    expect(readData(rejected)).toEqual({ errorCode: 'invalid' });
    expect(JSON.stringify(readData(rejected))).not.toContain('private tenant');
  });

  it('preserves authentication redirects', async () => {
    apiRequestMock.mockRejectedValueOnce(
      new Response(null, { status: 302, headers: { location: '/login?returnTo=%2Finvitations%2Faccept' } }),
    );

    await expect(action({ request: actionRequest('secret-token') } as never)).rejects.toMatchObject({ status: 302 });
  });

  it('detects French in the loader, preserves the token and emits safe SEO metadata', async () => {
    const result = await loader({
      request: new Request('https://e-code.ai/invitations/accept?token=secure-user-token', {
        headers: { 'accept-language': 'fr-FR,fr;q=0.9' },
      }),
    } as never);

    const data = readData<{ language: string; token: string }>(result);

    expect(data).toEqual({ language: 'fr', token: 'secure-user-token' });
    expect((result as { init?: { headers?: Headers } }).init?.headers?.get('Content-Language')).toBe('fr');

    const tags = meta({ data, matches: [] } as never);

    expect(tags).toContainEqual({ title: 'Accepter une invitation - E-Code' });
    expect(tags).toContainEqual({ name: 'robots', content: 'noindex, nofollow' });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/invitations/accept',
    });
  });
});
