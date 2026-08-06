import { describe, expect, it } from 'vitest';

import {
  APP_BUILDER_CANONICAL_URL,
  APP_BUILDER_OG_IMAGES,
  handle,
  headers,
  links,
  loader,
  meta,
  resolveAppBuilderLanguage,
} from './solutions.app-builder';
import { APP_BUILDER_COPY } from '~/components/marketing/solutions/app-builder.copy';

function buildRequest(headers?: HeadersInit, url = APP_BUILDER_CANONICAL_URL): Request {
  return new Request(url, { headers });
}

function readLoaderData<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

describe('App Builder solution route', () => {
  describe('resolveAppBuilderLanguage', () => {
    it('prioritizes an explicit language URL over saved and browser preferences', () => {
      const request = buildRequest(
        {
          Cookie: 'vibecore-lang=es',
          'Accept-Language': 'ar;q=1, en;q=0.8',
        },
        `${APP_BUILDER_CANONICAL_URL}?lang=fr`,
      );

      expect(resolveAppBuilderLanguage(request)).toBe('fr');
    });

    it('prioritizes the saved language cookie over Accept-Language', () => {
      const request = buildRequest({
        Cookie: 'session=active; vibecore-lang=fr',
        'Accept-Language': 'es-ES;q=1, en-US;q=0.8',
      });

      expect(resolveAppBuilderLanguage(request)).toBe('fr');
    });

    it('honors Accept-Language quality weights and skips unsupported languages', () => {
      const request = buildRequest({
        'Accept-Language': 'de-DE;q=1, es-ES;q=0.4, fr-FR;q=0.9, en-US;q=0.2',
      });

      expect(resolveAppBuilderLanguage(request)).toBe('fr');
    });

    it('falls back to English when no supported preference is present', () => {
      expect(resolveAppBuilderLanguage(buildRequest({ 'Accept-Language': 'de-DE, it-IT;q=0.8' }))).toBe('en');
      expect(resolveAppBuilderLanguage(buildRequest({ 'Accept-Language': 'fr-FR;q=0, de-DE;q=1' }))).toBe('en');
      expect(resolveAppBuilderLanguage(buildRequest())).toBe('en');
    });
  });

  it('returns the resolved language from the loader', async () => {
    const result = await loader({
      request: buildRequest({ 'Accept-Language': 'es-MX, en;q=0.8' }),
      params: {},
      context: {},
    });

    expect(readLoaderData<{ language: string }>(result)).toEqual({ language: 'es' });

    const responseHeaders = new Headers((result as { init?: ResponseInit }).init?.headers);

    expect(responseHeaders.get('content-language')).toBe('es');
    expect(responseHeaders.get('vary')).toBe('Origin, Cookie, Accept-Language');
  });

  it('persists an explicit English or French selection in the language cookie', async () => {
    const result = await loader({
      request: buildRequest(undefined, `${APP_BUILDER_CANONICAL_URL}?lang=fr`),
      params: {},
      context: {},
    });

    const responseHeaders = new Headers((result as { init?: ResponseInit }).init?.headers);

    expect(readLoaderData<{ language: string }>(result)).toEqual({ language: 'fr' });
    expect(responseHeaders.get('set-cookie')).toBe('vibecore-lang=fr; Path=/; Max-Age=31536000; SameSite=Lax');
  });

  it('merges localized response headers with the public shell headers', () => {
    const responseHeaders = new Headers(
      headers({
        actionHeaders: new Headers(),
        errorHeaders: undefined,
        loaderHeaders: new Headers({
          'Content-Language': 'fr',
          'Set-Cookie': 'vibecore-lang=fr; Path=/; SameSite=Lax',
          Vary: 'Origin, Cookie, Accept-Language',
        }),
        parentHeaders: new Headers({
          'Cache-Control': 'no-store',
          Vary: 'Origin',
        }),
      }),
    );

    expect(responseHeaders.get('cache-control')).toBe('no-store');
    expect(responseHeaders.get('content-language')).toBe('fr');
    expect(responseHeaders.get('set-cookie')).toBe('vibecore-lang=fr; Path=/; SameSite=Lax');
    expect(responseHeaders.get('vary')).toBe('Origin, Cookie, Accept-Language');
  });

  it('publishes complete localized French metadata', () => {
    const copy = APP_BUILDER_COPY.fr;
    const metadata = meta({ data: { language: 'fr' } } as Parameters<typeof meta>[0]);

    expect(metadata).toEqual([
      { title: copy.seo.title },
      { name: 'description', content: copy.seo.description },
      { name: 'robots', content: 'index,follow' },
      { tagName: 'link', rel: 'canonical', href: `${APP_BUILDER_CANONICAL_URL}?lang=fr` },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'E-Code' },
      { property: 'og:url', content: `${APP_BUILDER_CANONICAL_URL}?lang=fr` },
      { property: 'og:locale', content: 'fr_FR' },
      { property: 'og:locale:alternate', content: 'en_US' },
      { property: 'og:locale:alternate', content: 'es_ES' },
      { property: 'og:locale:alternate', content: 'ar_SA' },
      { property: 'og:title', content: copy.seo.title },
      { property: 'og:description', content: copy.seo.description },
      { property: 'og:image', content: APP_BUILDER_OG_IMAGES.fr },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: copy.seo.ogImageAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: copy.seo.title },
      { name: 'twitter:description', content: copy.seo.description },
      { name: 'twitter:image', content: APP_BUILDER_OG_IMAGES.fr },
      { name: 'twitter:image:alt', content: copy.seo.ogImageAlt },
    ]);
  });

  it.each(['en', 'fr', 'es', 'ar'] as const)('publishes the authored %s social image alternative', (language) => {
    const metadata = meta({ data: { language } } as Parameters<typeof meta>[0]);
    const expectedAlt = APP_BUILDER_COPY[language].seo.ogImageAlt;

    expect(metadata).toContainEqual({ property: 'og:image:alt', content: expectedAlt });
    expect(metadata).toContainEqual({ name: 'twitter:image:alt', content: expectedAlt });
  });

  it.each(['en', 'fr'] as const)('publishes the exact %s-localized canonical URL', (language) => {
    const localizedCanonicalUrl = `${APP_BUILDER_CANONICAL_URL}?lang=${language}`;
    const metadata = meta({ data: { language } } as Parameters<typeof meta>[0]);

    expect(metadata).toContainEqual({ tagName: 'link', rel: 'canonical', href: localizedCanonicalUrl });
    expect(metadata).toContainEqual({ property: 'og:url', content: localizedCanonicalUrl });
  });

  it('exposes reciprocal language alternates and an x-default URL', () => {
    expect(links()).toEqual([
      { rel: 'alternate', href: `${APP_BUILDER_CANONICAL_URL}?lang=en`, hrefLang: 'en' },
      { rel: 'alternate', href: `${APP_BUILDER_CANONICAL_URL}?lang=fr`, hrefLang: 'fr' },
      { rel: 'alternate', href: APP_BUILDER_CANONICAL_URL, hrefLang: 'x-default' },
    ]);
  });

  it('opts the route into the isolated server-rendered marketing path', () => {
    expect(handle).toEqual({ serverRenderedMarketing: true });
  });

  it('uses a valid Arabic Open Graph locale', () => {
    const metadata = meta({ data: { language: 'ar' } } as Parameters<typeof meta>[0]);

    expect(metadata).toContainEqual({ property: 'og:locale', content: 'ar_SA' });
  });
});
