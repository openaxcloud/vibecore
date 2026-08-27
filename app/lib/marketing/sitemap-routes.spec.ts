/**
 * BUG-MKT-001 — le sitemap annoncé par robots.txt doit exister ET être valide.
 *
 * Le défaut d'origine n'était pas « il manque un sitemap » mais « le site
 * annonce un sitemap qui n'existe pas » : robots.txt porte une directive
 * `Sitemap:` que chaque robot suit, pour tomber sur un 404. Ces tests verrouillent
 * les deux moitiés — le document est correct, et il reste raccroché à robots.txt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { escapeXml, renderSitemap, sitemapEntries } from './sitemap-routes';
import { solutionPages } from '~/components/marketing/EcodeMarketingPages';

const ORIGIN = 'https://e-code.ai';
const LASTMOD = '2026-08-06';

describe('inventaire du sitemap', () => {
  it('contient les pages marketing majeures', () => {
    const paths = sitemapEntries().map((e) => e.path);

    for (const expected of ['/', '/pricing', '/features', '/solutions', '/enterprise', '/blog', '/terms', '/privacy']) {
      expect(paths, expected).toContain(expected);
    }
  });

  it('dérive les solutions du catalogue — pas de liste recopiée', () => {
    const paths = sitemapEntries().map((e) => e.path);

    /*
     * Garde anti-dérive : ajouter une solution sans l'exposer au sitemap la
     * rendrait invisible aux robots. Le test échoue si les deux divergent.
     */
    for (const slug of Object.keys(solutionPages)) {
      expect(paths, slug).toContain(`/solutions/${slug}`);
    }
  });

  it("n'expose aucun chemin en double", () => {
    const paths = sitemapEntries().map((e) => e.path);
    expect(paths.length).toBe(new Set(paths).size);
  });

  it("n'expose ni espace authentifié, ni API, ni page de confirmation", () => {
    const paths = sitemapEntries().map((e) => e.path);

    for (const path of paths) {
      expect(path.startsWith('/'), path).toBe(true);
      expect(path, path).not.toMatch(/^\/(api|admin|account|billing|register|login)/);

      // Une page atteignable seulement après une action ne doit pas être indexée.
      expect(path, path).not.toMatch(/newsletter|confirmed|unsubscribe/);
    }
  });

  it('porte des priorités et fréquences valides', () => {
    for (const entry of sitemapEntries()) {
      expect(entry.priority, entry.path).toBeGreaterThanOrEqual(0);
      expect(entry.priority, entry.path).toBeLessThanOrEqual(1);
      expect(['daily', 'weekly', 'monthly', 'yearly'], entry.path).toContain(entry.changefreq);
    }
  });
});

describe('rendu du document', () => {
  const xml = renderSitemap(ORIGIN, LASTMOD);

  it('est un urlset sitemap 0.9 bien formé', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);

    // Autant de <url> que d'entrées, et les balises sont équilibrées.
    expect((xml.match(/<url>/g) ?? []).length).toBe(sitemapEntries().length);
    expect((xml.match(/<url>/g) ?? []).length).toBe((xml.match(/<\/url>/g) ?? []).length);
  });

  it('émet des URL absolues sur l origine fournie', () => {
    for (const entry of sitemapEntries()) {
      expect(xml).toContain(`<loc>${ORIGIN}${entry.path}</loc>`);
    }
  });

  it("suit l'origine de la requête — une préprod ne référence pas la production", () => {
    /*
     * Une origine codée en dur ferait indexer les pages de production depuis une
     * préprod, ou l'inverse.
     */
    const staging = renderSitemap('https://staging.e-code.ai', LASTMOD);
    expect(staging).toContain('<loc>https://staging.e-code.ai/pricing</loc>');
    expect(staging).not.toContain('https://e-code.ai/pricing<');
  });

  it('échappe les caractères XML', () => {
    expect(escapeXml(`a&b<c>"d'e`)).toBe('a&amp;b&lt;c&gt;&quot;d&apos;e');

    // Aucune esperluette nue ne doit subsister dans le document rendu.
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });
});

describe('raccord avec robots.txt', () => {
  it('robots.txt annonce bien /sitemap.xml (la directive qui pointait dans le vide)', () => {
    const robots = readFileSync(join(process.cwd(), 'public', 'robots.txt'), 'utf8');
    const directive = robots.match(/^Sitemap:\s*(\S+)$/m);

    expect(directive, 'robots.txt doit porter une directive Sitemap').toBeTruthy();
    expect(directive![1]).toMatch(/\/sitemap\.xml$/);
  });
});
