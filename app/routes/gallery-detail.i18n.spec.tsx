/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GalleryDetailRoute, { action, loader, meta } from './gallery.$slug';
import { publicGalleryEn, publicGalleryFr } from '~/lib/i18n/catalogs/public-gallery';
import { createI18nInstance } from '~/lib/i18n/runtime';

const listing = {
  id: 'gallery-1',
  slug: 'client-portal',
  title: 'Client Portal',
  description: 'User-authored description',
  category: 'SaaS',
  tags: ['React', 'TypeScript'],
  featured: true,
  author: 'Avi',
  appUrl: 'https://example.com/app',
  thumbnailUrl: 'https://example.com/preview.png',
  remixAllowed: true,
  license: null,
  licenseText: null,
  piiHandling: { mode: 'MASKED' as const },
  remixConsentVersion: '2026-08',
  views: 12_345,
  uses: 2,
  publishedAt: null,
};

const testState = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  listing: undefined as unknown,
}));

testState.listing = listing;

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return { ...actual, apiRequest: testState.apiRequest };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    Form: ({ children, method }: { children: React.ReactNode; method?: string }) => (
      <form method={method}>{children}</form>
    ),
    useLoaderData: () => ({ listing: testState.listing, language: 'fr' }),
    useActionData: () => undefined,
    useNavigation: () => ({ state: 'idle', formMethod: undefined }),
  };
});

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  testState.listing = listing;
});

function renderFrenchRoute() {
  return render(
    <I18nextProvider i18n={createI18nInstance('fr')}>
      <MemoryRouter>
        <GalleryDetailRoute />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('gallery detail i18n', () => {
  it('keeps complete runtime catalog parity', () => {
    expect(Object.keys(publicGalleryFr).sort()).toEqual(Object.keys(publicGalleryEn).sort());
  });

  it('renders French chrome while preserving user content, technical values, and URLs', () => {
    renderFrenchRoute();

    expect(screen.getByRole('link', { name: 'Retour à la galerie' }).getAttribute('href')).toBe('/gallery');
    expect(screen.getByRole('heading', { level: 1, name: 'Client Portal' })).toBeTruthy();
    expect(screen.getByText('par Avi')).toBeTruthy();
    expect(screen.getByAltText('Aperçu de Client Portal').getAttribute('src')).toBe('https://example.com/preview.png');
    expect(screen.getByText('User-authored description')).toBeTruthy();
    expect(
      screen.getByText((content, element) => element?.tagName === 'DD' && content.replace(/\s/gu, '') === '12345'),
    ).toBeTruthy();
    expect(screen.getByText('2 fois')).toBeTruthy();
    expect(screen.getByText('Aucune licence indiquée par l’auteur')).toBeTruthy();
    expect(screen.getByText(/Les données personnelles détectées/)).toBeTruthy();
    expect(screen.getByText(/consentement 2026-08/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remixer cette application' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ouvrir l’application' }).getAttribute('href')).toBe(
      'https://example.com/app',
    );
    expect(screen.getByRole('link', { name: 'Signaler cette application' }).getAttribute('href')).toContain(
      'trust-safety@e-code.ai',
    );
    expect(document.body.textContent).not.toMatch(/Back to gallery|No license specified|Remix this app|View app/);
  });

  it('emits localized SEO without translating listing content', () => {
    const descriptors = meta({ data: { listing, language: 'fr' } } as Parameters<typeof meta>[0]);
    expect(descriptors).toContainEqual({ title: 'Client Portal — Galerie — E-Code' });
    expect(descriptors).toContainEqual({ name: 'description', content: 'User-authored description' });
    expect(descriptors).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(descriptors).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/gallery/client-portal',
    });
  });

  it('returns a localized safe action error instead of upstream English', async () => {
    testState.apiRequest
      .mockResolvedValueOnce({ organizations: [{ id: 'org-1', slug: 'acme' }] })
      .mockRejectedValueOnce(new Response('raw upstream English', { status: 400 }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = (await action({
      request: new Request('https://e-code.ai/gallery/client-portal', {
        method: 'POST',
        headers: { 'Accept-Language': 'fr-FR', 'content-type': 'application/x-www-form-urlencoded' },
        body: 'acceptLicense=on',
      }),
      params: { slug: 'client-portal' },
      context: {},
    } as Parameters<typeof action>[0])) as {
      data: { error: string };
      init: { status: number };
    };

    expect(response.init.status).toBe(400);
    expect(response.data).toEqual({
      error: 'Impossible de remixer cette application. Vérifiez votre consentement, puis réessayez.',
    });
  });

  it('returns a localized 404 from the loader', async () => {
    expect.assertions(2);
    testState.apiRequest.mockRejectedValueOnce(new Response('Not found', { status: 404 }));

    try {
      await loader({
        request: new Request('https://e-code.ai/gallery/missing', {
          headers: { 'Accept-Language': 'fr-FR' },
        }),
        params: { slug: 'missing' },
        context: {},
      } as Parameters<typeof loader>[0]);
    } catch (response) {
      const result = response as { data: { error: string }; init: { status: number } };
      expect(result.init.status).toBe(404);
      expect(result.data).toEqual({
        error: 'Cette application est introuvable dans la galerie.',
      });
    }
  });
});
