/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

const routeState = vi.hoisted(() => ({
  loaderData: {
    ok: false,
    language: 'fr',
    provider: 'github',
    errorCode: 'PROVIDER_DENIED',
  } as Record<string, unknown>,
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
    useLoaderData: () => routeState.loaderData,
  };
});

import IntegrationOauthCallbackPage, { loader, meta } from './integrations.oauth.$provider.callback';
import {
  getIntegrationOauthCallbackCopy,
  integrationOauthCallbackEn,
  integrationOauthCallbackErrorMessage,
  integrationOauthCallbackFr,
} from '~/lib/i18n/catalogs/integration-oauth-callback';

function createTestI18n(language: 'en' | 'fr') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    initImmediate: false,
    resources: {
      en: { translation: {} },
      fr: { translation: {} },
    },
  });

  return i18n;
}

function readData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

function readHeaders(result: unknown): Headers {
  if (result && typeof result === 'object' && 'init' in result) {
    const init = (result as { init?: { headers?: HeadersInit } }).init;

    return new Headers(init?.headers);
  }

  return new Headers();
}

function callbackRequest(query = '', language = 'fr-FR,fr;q=0.9') {
  return new Request(`https://app.e-code.ai/integrations/oauth/github/callback${query}`, {
    headers: { 'accept-language': language },
  });
}

beforeEach(() => {
  routeState.loaderData = {
    ok: false,
    language: 'fr',
    provider: 'github',
    errorCode: 'PROVIDER_DENIED',
  };
  apiRequestMock.mockReset();
  vi.spyOn(window, 'close').mockImplementation(() => undefined);
  Object.defineProperty(window, 'opener', { configurable: true, value: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('integration OAuth callback catalogs', () => {
  it('keeps exact EN/FR key parity with English fallback', () => {
    expect(Object.keys(integrationOauthCallbackFr).sort()).toEqual(Object.keys(integrationOauthCallbackEn).sort());
    expect(getIntegrationOauthCallbackCopy('de-DE')).toBe(integrationOauthCallbackEn);
    expect(integrationOauthCallbackErrorMessage(undefined, 'fr')).toContain('Impossible de finaliser');
  });
});

describe('integration OAuth callback loader', () => {
  it('detects French, persists the first automatic choice and rejects an unknown provider safely', async () => {
    const request = callbackRequest();
    const result = await loader({ request, params: { provider: 'dropbox' } } as never);
    const payload = readData<Record<string, unknown>>(result);
    const headers = readHeaders(result);

    expect(payload).toEqual({
      ok: false,
      language: 'fr',
      provider: 'dropbox',
      errorCode: 'CONNECTOR_UNKNOWN_PROVIDER',
    });
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('turns provider denial and missing parameters into stable codes without reflecting query details', async () => {
    const denied = await loader({
      request: callbackRequest('?error=access_denied&error_description=Raw+provider+secret'),
      params: { provider: 'github' },
    } as never);
    const missing = await loader({
      request: callbackRequest(),
      params: { provider: 'github' },
    } as never);

    expect(readData(denied)).toEqual({
      ok: false,
      language: 'fr',
      provider: 'github',
      errorCode: 'PROVIDER_DENIED',
    });
    expect(JSON.stringify(readData(denied))).not.toContain('Raw provider secret');
    expect(readData(missing)).toEqual({
      ok: false,
      language: 'fr',
      provider: 'github',
      errorCode: 'OAUTH_CALLBACK_MISSING_PARAMS',
    });
  });

  it('forwards code and state unchanged and preserves the successful technical payload', async () => {
    apiRequestMock.mockResolvedValue({
      provider: 'github',
      userConnectionId: 'connection-1',
      accountLabel: 'octocat',
      scopes: ['repo', 'read:user'],
    });

    const request = callbackRequest('?code=code%2Bvalue&state=state%2Fvalue');
    const result = await loader({ request, params: { provider: 'github' } } as never);

    expect(apiRequestMock).toHaveBeenCalledWith(
      request,
      '/api/integrations/oauth/github/callback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'code+value', state: 'state/value' }),
      }),
    );
    expect(readData(result)).toEqual({
      ok: true,
      language: 'fr',
      provider: 'github',
      userConnectionId: 'connection-1',
      accountLabel: 'octocat',
      scopes: ['repo', 'read:user'],
    });
  });

  it('classifies API failures without parsing or returning upstream prose', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiRequestMock.mockRejectedValue(
      new Response(JSON.stringify({ code: 'RAW_PROVIDER_CODE', error: 'token=provider-secret' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await loader({
      request: callbackRequest('?code=abc&state=state-token'),
      params: { provider: 'github' },
    } as never);

    const serialized = JSON.stringify(readData(result));

    expect(readData(result)).toEqual({
      ok: false,
      language: 'fr',
      provider: 'github',
      errorCode: 'OAUTH_CALLBACK_RATE_LIMITED',
    });
    expect(serialized).not.toContain('RAW_PROVIDER_CODE');
    expect(serialized).not.toContain('provider-secret');
    expect(serialized).not.toContain('state-token');
  });

  it('rethrows reauthentication redirects', async () => {
    const redirect = new Response(null, { status: 302, headers: { Location: '/login' } });
    apiRequestMock.mockRejectedValue(redirect);

    await expect(
      loader({
        request: callbackRequest('?code=abc&state=state-token'),
        params: { provider: 'github' },
      } as never),
    ).rejects.toBe(redirect);
  });
});

describe('integration OAuth callback rendered i18n', () => {
  it('renders a safe accessible French error and switches live to English', async () => {
    routeState.loaderData = {
      ok: false,
      language: 'fr',
      provider: 'github',
      errorCode: 'OAUTH_CALLBACK_REJECTED',
      errorMessage: 'Raw upstream English secret must never render.',
    };

    const i18n = createTestI18n('fr');

    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <IntegrationOauthCallbackPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Échec de la connexion à GitHub' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Le fournisseur a refusé la connexion.');
    expect(container.textContent).not.toContain('Raw upstream English secret');
    expect(screen.getByRole('button', { name: 'Fermer cette fenêtre de rappel OAuth' }).className).toContain(
      'min-h-11',
    );

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'GitHub connection failed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close this OAuth callback window' })).toBeTruthy();
  });

  it('preserves account content and sends the existing resolved postMessage contract', () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { closed: false, postMessage },
    });
    routeState.loaderData = {
      ok: true,
      language: 'fr',
      provider: 'gitlab',
      userConnectionId: 'connection-2',
      accountLabel: 'Équipe / platform-eng',
      scopes: ['read_user', 'read_repository'],
    };

    render(
      <I18nextProvider i18n={createTestI18n('fr')}>
        <IntegrationOauthCallbackPage />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Connexion réussie' })).toBeTruthy();
    expect(screen.getByText(/Équipe \/ platform-eng/u)).toBeTruthy();
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'e-code.connector.connection.resolved',
        provider: 'gitlab',
        userConnectionId: 'connection-2',
        accountLabel: 'Équipe / platform-eng',
        scopes: ['read_user', 'read_repository'],
      },
      window.location.origin,
    );
  });

  it('sends only the stable code and safe localized prose on the failed postMessage path', () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { closed: false, postMessage },
    });
    routeState.loaderData = {
      ok: false,
      language: 'fr',
      provider: 'bitbucket',
      errorCode: 'OAUTH_CALLBACK_UNAVAILABLE',
      errorMessage: 'upstream secret=abc',
    };

    render(
      <I18nextProvider i18n={createTestI18n('fr')}>
        <IntegrationOauthCallbackPage />
      </I18nextProvider>,
    );

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'e-code.connector.connection.failed',
        provider: 'bitbucket',
        errorCode: 'OAUTH_CALLBACK_UNAVAILABLE',
        errorMessage:
          'Le service de connexion est temporairement indisponible. Veuillez réessayer dans quelques instants.',
      },
      window.location.origin,
    );
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('upstream secret');
  });

  it('marks the sensitive callback noindex without canonical or hreflang links', () => {
    const tags = meta({ data: { language: 'fr' }, matches: [] } as never);

    expect(tags).toContainEqual({ title: 'Rappel sécurisé du connecteur - E-Code' });
    expect(tags).toContainEqual({ name: 'robots', content: 'noindex, nofollow, noarchive' });
    expect(tags).not.toContainEqual(expect.objectContaining({ rel: 'canonical' }));
    expect(tags).not.toContainEqual(expect.objectContaining({ hrefLang: expect.any(String) }));
  });

  it('passes the direct source scanner with no visible hardcoded strings', async () => {
    const file = 'app/routes/integrations.oauth.$provider.callback.tsx';
    const source = readFileSync(file, 'utf8');
    const { scanSource } = await import('../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, file);

    expect(result.findings).toEqual([]);
    expect(source).not.toContain('providerErrorDescription');
    expect(source).not.toContain('error.clone().json()');
    expect(source).not.toContain('error instanceof Error ? error.message');
  });
});
