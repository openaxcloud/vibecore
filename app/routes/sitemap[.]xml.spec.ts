import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { collectSitemapPaths, ECODE_CANONICAL_ORIGIN, loader, renderSitemap } from './sitemap[.]xml';

describe('/sitemap.xml', () => {
  it('emits one English canonical and en/fr/x-default alternates for every public URL', async () => {
    const response = loader();
    const xml = await response.text();
    const paths = collectSitemapPaths();
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(locations).toHaveLength(paths.length);
    expect(new Set(locations).size).toBe(paths.length);
    expect(locations).toContain(`${ECODE_CANONICAL_ORIGIN}/`);

    for (const path of paths) {
      const canonical = new URL(path, ECODE_CANONICAL_ORIGIN).toString();
      const english = new URL(path, ECODE_CANONICAL_ORIGIN);
      const french = new URL(path, ECODE_CANONICAL_ORIGIN);
      french.searchParams.set('lang', 'fr');

      expect(xml).toContain(`<loc>${canonical}</loc>`);
      expect(xml).toContain(`hreflang="en" href="${english.toString()}"`);
      expect(xml).toContain(`hreflang="fr" href="${french.toString()}"`);
      expect(xml).toContain(`hreflang="x-default" href="${canonical}"`);
    }
  });

  it('includes every published in-repo blog article and excludes private app routes', () => {
    const xml = renderSitemap();

    expect(xml).toContain('/blog/introducing-e-code');
    expect(xml).toContain('/blog/building-at-scale-how-we-handle-10m-requests');
    expect(xml).toContain('/blog/getting-started-with-e-code-in-5-minutes');
    expect(xml).not.toContain(`<loc>${ECODE_CANONICAL_ORIGIN}/dashboard</loc>`);
    expect(xml).not.toContain(`<loc>${ECODE_CANONICAL_ORIGIN}/projects</loc>`);
    expect(xml).not.toContain(`<loc>${ECODE_CANONICAL_ORIGIN}/admin</loc>`);
  });

  it('includes the public policy, safety, gallery and language pages that publish localized SEO', () => {
    const paths = collectSitemapPaths();

    expect(paths).toEqual(
      expect.arrayContaining([
        '/account-inactivity',
        '/data-deletion',
        '/deleting-your-data',
        '/enforcement',
        '/gallery',
        '/licensing',
        '/strike-system',
        '/support-policy',
        '/templates/languages',
        '/trust-and-safety',
        '/usage-limits',
      ]),
    );
  });

  it.each(['public/robots.txt', 'public/ecode-static/robots.txt'])(
    '%s allows exact locale query variants before the general query-string block',
    async (path) => {
      const robots = await readFile(resolve(process.cwd(), path), 'utf8');
      const block = robots.indexOf('Disallow: /*?*');

      expect(robots).toContain('Sitemap: https://e-code.ai/sitemap.xml');
      expect(robots.indexOf('Allow: /*?lang=en$')).toBeGreaterThan(-1);
      expect(robots.indexOf('Allow: /*?lang=fr$')).toBeGreaterThan(-1);
      expect(robots.indexOf('Allow: /*?lang=en$')).toBeLessThan(block);
      expect(robots.indexOf('Allow: /*?lang=fr$')).toBeLessThan(block);
      expect(robots).not.toMatch(/User-agent: (?:Googlebot|Bingbot)[\s\S]*?Allow: \/(?:\s|$)/u);
    },
  );
});
