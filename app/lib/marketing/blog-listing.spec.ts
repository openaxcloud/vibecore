/**
 * BUG-MKT-011 — la liste du blog doit pointer vers les VRAIS articles.
 *
 * Le défaut d'origine n'était pas un mauvais lien isolé mais deux sources de
 * données concurrentes : la liste était codée en dur dans le composant, sans
 * champ `slug`, donc aucun lien vers un article n'était seulement exprimable.
 * Les tests vérifient donc la propriété qui interdit le retour du bug — ce qui
 * est listé est exactement ce qui est servi — et pas seulement la forme des URL.
 */
import { describe, expect, it } from 'vitest';

import { ALL_CATEGORIES, buildBlogListing, formatPublishedAt, type BlogRegistryPost } from './blog-listing';
import { ecodeBlogPosts } from './ecode-public-api-data.server';

const post = (over: Partial<BlogRegistryPost> = {}): BlogRegistryPost => ({
  title: 'Titre',
  slug: 'titre',
  excerpt: 'Extrait',
  category: 'Product',
  author: 'E-Code Team',
  coverImage: '/img.png',
  readTime: 5,
  published: true,
  featured: false,
  publishedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('buildBlogListing', () => {
  it('lie chaque billet à son article — jamais à la page de liste', () => {
    /*
     * C'est LE défaut d'origine : tous les « Read more » portaient href="/blog".
     * Un lien vers la page courante n'est pas un lien mort au sens HTTP, donc
     * aucune vérification de statut ne l'aurait attrapé.
     */
    const { featured, posts } = buildBlogListing([
      post({ slug: 'a', featured: true }),
      post({ slug: 'b', publishedAt: '2025-12-01T00:00:00.000Z' }),
    ]);

    expect(featured?.href).toBe('/blog/a');
    expect(posts.map((p) => p.href)).toEqual(['/blog/b']);

    for (const entry of [featured!, ...posts]) {
      expect(entry.href, entry.slug).not.toBe('/blog');
      expect(entry.href, entry.slug).toMatch(/^\/blog\/.+/);
    }
  });

  it('exclut les billets non publiés', () => {
    const listing = buildBlogListing([post({ slug: 'visible' }), post({ slug: 'brouillon', published: false })]);
    const slugs = [listing.featured, ...listing.posts].map((p) => p?.slug);

    expect(slugs).toContain('visible');
    expect(slugs).not.toContain('brouillon');
  });

  it('ignore un billet sans slug — il serait listé sans être atteignable', () => {
    const listing = buildBlogListing([post({ slug: 'ok' }), post({ slug: '' })]);

    expect([listing.featured, ...listing.posts].filter(Boolean)).toHaveLength(1);
  });

  it('trie du plus récent au plus ancien', () => {
    const { posts } = buildBlogListing([
      post({ slug: 'vedette', featured: true, publishedAt: '2026-06-01T00:00:00.000Z' }),
      post({ slug: 'vieux', publishedAt: '2025-01-01T00:00:00.000Z' }),
      post({ slug: 'recent', publishedAt: '2026-03-01T00:00:00.000Z' }),
    ]);

    expect(posts.map((p) => p.slug)).toEqual(['recent', 'vieux']);
  });

  it("prend le plus récent en vedette quand aucun n'est marqué", () => {
    // Une section « Featured » vide serait un trou visible là où du contenu existe.
    const { featured } = buildBlogListing([
      post({ slug: 'vieux', publishedAt: '2025-01-01T00:00:00.000Z' }),
      post({ slug: 'recent', publishedAt: '2026-03-01T00:00:00.000Z' }),
    ]);

    expect(featured?.slug).toBe('recent');
  });

  it("n'affiche jamais la vedette une seconde fois dans la liste", () => {
    const { featured, posts } = buildBlogListing([post({ slug: 'a', featured: true }), post({ slug: 'b' })]);

    expect(posts.map((p) => p.slug)).not.toContain(featured?.slug);
  });

  it('dérive les catégories des billets listés — aucun filtre ne doit être vide', () => {
    const { posts, categories } = buildBlogListing([
      post({ slug: 'a', featured: true, category: 'Product' }),
      post({ slug: 'b', category: 'Engineering' }),
      post({ slug: 'c', category: 'Tutorial' }),
    ]);

    expect(categories[0]).toBe(ALL_CATEGORIES);

    for (const category of categories.slice(1)) {
      expect(
        posts.some((p) => p.category === category),
        category,
      ).toBe(true);
    }
  });

  it('supporte un registre vide sans casser', () => {
    expect(buildBlogListing([])).toEqual({ featured: null, posts: [], categories: [ALL_CATEGORIES] });
  });
});

describe('formatPublishedAt', () => {
  it('formate en UTC avec une locale fixe (sinon serveur et client divergent)', () => {
    // Une date proche de minuit révèle un décalage de fuseau s'il y en a un.
    expect(formatPublishedAt('2026-01-15T00:00:00.000Z')).toBe('January 15, 2026');
    expect(formatPublishedAt('2026-01-15T23:59:00.000Z')).toBe('January 15, 2026');
  });

  it('ne jette pas sur une date invalide', () => {
    expect(formatPublishedAt('pas-une-date')).toBe('');
  });
});

describe('raccord avec le registre réel', () => {
  it('chaque billet listé correspond à un billet réellement servi', () => {
    /*
     * Garde anti-divergence : c'est la propriété que le bug violait. Si la liste
     * repartait un jour d'une source parallèle, ce test tomberait.
     */
    const listing = buildBlogListing(ecodeBlogPosts);
    const servedSlugs = new Set(ecodeBlogPosts.filter((p) => p.published).map((p) => p.slug));

    const listed = [listing.featured, ...listing.posts].filter(Boolean);
    expect(listed.length).toBeGreaterThan(0);

    for (const entry of listed) {
      expect(servedSlugs.has(entry!.slug), entry!.slug).toBe(true);
    }
  });
});
