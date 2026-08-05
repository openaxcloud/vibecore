import { describe, expect, it } from 'vitest';

import { loader, meta } from './blog.$slug';

describe('blog detail route i18n', () => {
  it('loads the complete French article with locale headers', async () => {
    const result = (await loader({
      request: new Request('https://e-code.ai/blog/introducing-e-code?lang=fr'),
      params: { slug: 'introducing-e-code' },
      context: {},
    } as never)) as {
      data: { language: string; title: string; content: string };
      init: { headers: HeadersInit };
    };

    const headers = new Headers(result.init.headers);

    expect(result.data.language).toBe('fr');
    expect(result.data.title).toBe('Découvrez l’agent IA E-Code 2.0');
    expect(result.data.content).toContain('## Ce qui change');
    expect(headers.get('Content-Language')).toBe('fr');
  });

  it('emits localized SEO with canonical, hreflang, Open Graph and Twitter tags', () => {
    const tags = meta({
      data: {
        language: 'fr',
        title: 'Découvrez l’agent IA E-Code 2.0',
        excerpt: 'Extrait français.',
      },
      matches: [],
      params: { slug: 'introducing-e-code' },
    } as never);

    expect(tags).toContainEqual({ title: 'Découvrez l’agent IA E-Code 2.0 - E-Code Blog' });
    expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/blog/introducing-e-code?lang=fr',
    });
  });
});
