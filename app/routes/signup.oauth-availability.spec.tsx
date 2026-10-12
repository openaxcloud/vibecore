/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SignupPage, { loader } from './signup';
import { toResponse } from '~/lib/test/rr7-data';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en', language: 'en' } }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('inscription : disponibilité réelle des boutons sociaux', () => {
  it.each(
    [
      { github: true, google: true },
      { github: false, google: true },
      { github: false, google: false },
    ].flatMap((providers) => [null, '/projects/new'].map((returnTo) => ({ ...providers, returnTo }))),
  )('rend uniquement les boutons disponibles : $github / $google', async ({ github, google, returnTo }) => {
    vi.stubEnv('SAAS_API_URL', 'http://api.test.local');

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/auth/oauth/providers');
      return new Response(
        JSON.stringify({
          providers: [
            { provider: 'github', ready: github },
            { provider: 'google', ready: google },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await loader({
      request: new Request(`http://localhost/register${returnTo ? '?returnTo=%2Fprojects%2Fnew' : ''}`),
      params: {},
      context: {},
    } as Parameters<typeof loader>[0]);

    const data = await toResponse(result).json();

    const router = createMemoryRouter(
      [{ id: 'signup', path: '/register', loader: () => data, Component: SignupPage }],
      { initialEntries: ['/register'], hydrationData: { loaderData: { signup: data } } },
    );
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'auth.signup.submit' })).toBeDefined());
    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('/auth/oauth/providers');
    expect(Boolean(screen.queryByRole('link', { name: 'auth.signup.github' }))).toBe(github);
    expect(Boolean(screen.queryByRole('link', { name: 'auth.signup.google' }))).toBe(google);

    for (const [provider, ready] of [
      ['github', github],
      ['google', google],
    ] as const) {
      if (ready) {
        expect(screen.getByRole('link', { name: `auth.signup.${provider}` }).getAttribute('href')).toBe(
          `/auth/oauth/${provider}${returnTo ? '?returnTo=%2Fprojects%2Fnew' : ''}`,
        );
      }
    }
    router.dispose();
  });
});
