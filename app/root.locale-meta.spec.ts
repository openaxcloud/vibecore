import { describe, expect, it } from 'vitest';

import { loader, meta } from './root';

function dataOf<T>(result: unknown): T {
  return result && typeof result === 'object' && 'data' in result ? (result as { data: T }).data : (result as T);
}

describe('root locale and SEO metadata', () => {
  it('serves French SSR metadata, language headers and canonical alternates', () => {
    const result = loader({
      request: new Request('https://e-code.ai/pricing?lang=fr'),
      params: {},
      context: {},
    });
    const data = dataOf<{
      language: 'fr';
      seo: { canonical: string; english: string; french: string };
    }>(result);

    const headers = new Headers((result as { init?: ResponseInit }).init?.headers);
    const metadata = meta({ data } as Parameters<typeof meta>[0]);

    expect(data.language).toBe('fr');
    expect(data.seo).toEqual({
      canonical: 'https://e-code.ai/pricing',
      english: 'https://e-code.ai/pricing',
      french: 'https://e-code.ai/pricing?lang=fr',
    });
    expect(headers.get('content-language')).toBe('fr');
    expect(headers.get('set-cookie')).toContain('vibecore-lang=fr');
    expect(metadata).toContainEqual({ title: 'E-Code — Plateforme de développement d’applications par IA' });
    expect(metadata).toContainEqual({
      name: 'twitter:description',
      content: 'Créez, testez et déployez des applications de production avec les agents IA E-Code.',
    });
    expect(metadata).toContainEqual({ property: 'og:url', content: 'https://e-code.ai/pricing' });
    expect(metadata).toContainEqual({ property: 'og:image', content: 'https://e-code.ai/social_preview_index.jpg' });
    expect(metadata).toContainEqual({ name: 'twitter:image', content: 'https://e-code.ai/social_preview_index.jpg' });
  });

  it('derives the canonical scheme from X-Forwarded-Proto behind the TLS-terminating ingress', () => {
    /*
     * Reproduit la condition de PRODUCTION, pas une URL de test commode : TLS
     * termine sur l'ingress, donc l'application reçoit du http en clair et
     * `request.url` porte `http:`. Les autres cas de ce fichier construisent
     * directement des URL `https://`, ce qui masquait le défaut — la prod
     * servait `<link rel="canonical" href="http://e-code.ai/">`, un canonical
     * pointant vers une origine autre que celle réellement servie.
     */
    const result = loader({
      request: new Request('http://e-code.ai/pricing', { headers: { 'x-forwarded-proto': 'https' } }),
      params: {},
      context: {},
    });

    const data = dataOf<{ seo: { canonical: string; english: string; french: string } }>(result);

    expect(data.seo).toEqual({
      canonical: 'https://e-code.ai/pricing',
      english: 'https://e-code.ai/pricing',
      french: 'https://e-code.ai/pricing?lang=fr',
    });

    // Une chaîne de proxys ne retient que le maillon d'origine.
    const chained = dataOf<{ seo: { canonical: string } }>(
      loader({
        request: new Request('http://e-code.ai/pricing', { headers: { 'x-forwarded-proto': 'https, http' } }),
        params: {},
        context: {},
      }),
    );

    expect(chained.seo.canonical).toBe('https://e-code.ai/pricing');

    // Sans en-tête (dev local en http), on ne réécrit rien.
    const local = dataOf<{ seo: { canonical: string } }>(
      loader({ request: new Request('http://localhost:5173/pricing'), params: {}, context: {} }),
    );

    expect(local.seo.canonical).toBe('http://localhost:5173/pricing');
  });

  it('strips all stateful and sensitive query parameters from SEO URLs', () => {
    const result = loader({
      request: new Request('https://e-code.ai/invitations/accept?lang=fr&token=invitation-secret&utm_source=test'),
      params: {},
      context: {},
    });
    const data = dataOf<{
      language: 'fr';
      seo: { canonical: string; english: string; french: string };
    }>(result);

    expect(data.seo).toEqual({
      canonical: 'https://e-code.ai/invitations/accept',
      english: 'https://e-code.ai/invitations/accept',
      french: 'https://e-code.ai/invitations/accept?lang=fr',
    });
    expect(JSON.stringify(data.seo)).not.toMatch(/invitation-secret|utm_source/u);
  });

  it('keeps English as the canonical fallback', () => {
    const result = loader({
      request: new Request('https://e-code.ai/about', { headers: { 'Accept-Language': 'de-DE' } }),
      params: {},
      context: {},
    });

    const data = dataOf<{ language: 'en'; seo: { canonical: string } }>(result);

    expect(data.language).toBe('en');
    expect(meta({ data } as Parameters<typeof meta>[0])).toContainEqual({
      title: 'E-Code — AI application development platform',
    });
  });

  it.each([
    {
      status: 404,
      expectedTitle: 'Cette page est introuvable · E-Code',
      expectedDescription: 'La page recherchée a peut-être été déplacée, renommée ou n’a jamais existé.',
    },
    {
      status: 500,
      expectedTitle: 'Une erreur est survenue · E-Code',
      expectedDescription: 'Une erreur inattendue a interrompu cette page. Réessayez ou revenez à une page connue.',
    },
  ])(
    'serves localized noindex metadata for a $status route error',
    ({ status, expectedTitle, expectedDescription }) => {
      const result = loader({
        request: new Request('https://e-code.ai/missing?lang=fr'),
        params: {},
        context: {},
      });

      const data = dataOf<{ language: 'fr' }>(result);
      const error = { status, statusText: 'Error', data: null, internal: false };
      const metadata = meta({ data, error } as Parameters<typeof meta>[0]);

      expect(metadata).toContainEqual({ title: expectedTitle });
      expect(metadata).toContainEqual({ name: 'description', content: expectedDescription });
      expect(metadata).toContainEqual({ name: 'robots', content: 'noindex,follow' });
    },
  );

  it('never exposes capability tokens through root canonical, hreflang or social metadata', () => {
    const result = loader({
      request: new Request('https://e-code.ai/share/secret-capability-token?lang=fr'),
      params: { token: 'secret-capability-token' },
      context: {},
    });
    const data = dataOf<{
      language: 'fr';
      privateCapabilityRoute: boolean;
      seo: null;
    }>(result);

    expect(data.language).toBe('fr');
    expect(data.privateCapabilityRoute).toBe(true);
    expect(data.seo).toBeNull();
    expect(JSON.stringify(data)).not.toContain('secret-capability-token');
    expect(meta({ data } as Parameters<typeof meta>[0])).toEqual([]);
  });

  it.each([
    'https://e-code.ai/projects/share/project-capability-token?lang=fr',
    'https://e-code.ai/integrations/oauth/github/callback?code=oauth-secret&state=csrf-secret&lang=fr',
  ])('suppresses root SEO for sensitive route %s', (url) => {
    const result = loader({ request: new Request(url), params: {}, context: {} });
    const data = dataOf<{ suppressRootSeo: boolean; seo: null }>(result);

    expect(data.suppressRootSeo).toBe(true);
    expect(data.seo).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/project-capability-token|oauth-secret|csrf-secret/u);
    expect(meta({ data } as Parameters<typeof meta>[0])).toEqual([]);
  });
});
