/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConnectionTest } from './useConnectionTest';
import { createI18nInstance } from '~/lib/i18n/runtime';

const frenchI18n = createI18nInstance('fr');

function FrenchWrapper({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={frenchI18n}>{children}</I18nextProvider>;
}

describe('useConnectionTest i18n', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders French success copy while preserving the provider and account names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ login: 'octocat' }), { status: 200 })),
    );

    const { result } = renderHook(
      () =>
        useConnectionTest({
          testEndpoint: '/api/test-github',
          serviceName: 'GitHub',
          getUserIdentifier: (data) => String(data.login),
        }),
      { wrapper: FrenchWrapper },
    );

    await act(async () => {
      await result.current.testConnection();
    });

    expect(result.current.testResult?.message).toBe('Connexion à GitHub établie en tant que octocat.');

    await act(async () => {
      await frenchI18n.changeLanguage('en');
    });
    expect(result.current.testResult?.message).toBe('Connected successfully to GitHub as octocat.');

    await act(async () => {
      await frenchI18n.changeLanguage('fr');
    });
  });

  it('never exposes a raw API error in French', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'token=private' }), {
          status: 401,
          statusText: 'Unauthorized',
        }),
      ),
    );

    const { result } = renderHook(
      () => useConnectionTest({ testEndpoint: '/api/test-gitlab', serviceName: 'GitLab' }),
      { wrapper: FrenchWrapper },
    );

    await act(async () => {
      await result.current.testConnection();
    });

    expect(result.current.testResult?.message).toBe(
      'Impossible de se connecter à GitLab. Vérifiez vos identifiants et votre réseau, puis réessayez.',
    );
    expect(result.current.testResult?.message).not.toContain('token=private');
  });
});
