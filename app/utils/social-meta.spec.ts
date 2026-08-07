/**
 * Métadonnées publiques — garde de non-régression SEO/social.
 *
 * Couvre BUG-MKT-003 (canonical), 004 (og:title), 006 (og:url), 007 (og:type /
 * og:site_name) et 008 (twitter:title / twitter:description).
 */
import { describe, expect, it } from 'vitest';

import { canonicalUrl, MARKETING_SITE_URL, socialMetaTags } from './social-meta';

const get = (tags: ReturnType<typeof socialMetaTags>, key: string, attr: 'property' | 'name' = 'property') =>
  (tags.find((t) => (t as Record<string, unknown>)[attr] === key) as Record<string, string> | undefined)?.content;

const canonical = (tags: ReturnType<typeof socialMetaTags>) =>
  tags.find((t) => (t as Record<string, unknown>).rel === 'canonical') as Record<string, string> | undefined;

describe('canonicalUrl', () => {
  it('rend une URL absolue sur l origine marketing', () => {
    expect(canonicalUrl('/pricing')).toBe(`${MARKETING_SITE_URL}/pricing`);
  });

  it('normalise la racine sans barre finale parasite', () => {
    expect(canonicalUrl('/')).toBe(MARKETING_SITE_URL);
  });

  it('retire la barre finale — sinon deux canoniques désignent la même page', () => {
    expect(canonicalUrl('/pricing/')).toBe(`${MARKETING_SITE_URL}/pricing`);
    expect(canonicalUrl('/solutions/app-builder/')).toBe(`${MARKETING_SITE_URL}/solutions/app-builder`);
  });

  it('ignore query et fragment — ?utm_source ne crée pas une page distincte', () => {
    expect(canonicalUrl('/pricing?utm_source=x&utm_campaign=y')).toBe(`${MARKETING_SITE_URL}/pricing`);
    expect(canonicalUrl('/features#multiplayer')).toBe(`${MARKETING_SITE_URL}/features`);
  });

  it('tolère un chemin sans barre initiale', () => {
    expect(canonicalUrl('about')).toBe(`${MARKETING_SITE_URL}/about`);
  });
});

describe('socialMetaTags', () => {
  const tags = socialMetaTags({ title: 'Titre', description: 'Description', path: '/pricing' });

  it('émet le canonical (BUG-MKT-003)', () => {
    expect(canonical(tags)).toMatchObject({ tagName: 'link', rel: 'canonical', href: `${MARKETING_SITE_URL}/pricing` });
  });

  it('émet og:title et og:description (BUG-MKT-004)', () => {
    expect(get(tags, 'og:title')).toBe('Titre');
    expect(get(tags, 'og:description')).toBe('Description');
  });

  it('émet og:url aligné sur le canonical (BUG-MKT-006)', () => {
    expect(get(tags, 'og:url')).toBe(canonical(tags)?.href);
  });

  it('émet og:type et og:site_name (BUG-MKT-007)', () => {
    expect(get(tags, 'og:type')).toBe('website');
    expect(get(tags, 'og:site_name')).toBe('E-Code');
    expect(get(socialMetaTags({ title: 'T', description: 'D', type: 'article' }), 'og:type')).toBe('article');
  });

  it('émet twitter:title et twitter:description (BUG-MKT-008)', () => {
    // Sans eux, la carte affiche un titre deviné dans le corps de la page.
    expect(get(tags, 'twitter:title', 'name')).toBe('Titre');
    expect(get(tags, 'twitter:description', 'name')).toBe('Description');
    expect(get(tags, 'twitter:card', 'name')).toBe('summary_large_image');
  });

  it("n'émet ni canonical ni og:url quand le chemin est inconnu", () => {
    /*
     * Un canonical FAUX est pire qu'absent : il désigne explicitement la mauvaise
     * page aux moteurs. Sans chemin, on n'invente rien.
     */
    const partial = socialMetaTags({ title: 'T', description: 'D' });
    expect(canonical(partial)).toBeUndefined();
    expect(get(partial, 'og:url')).toBeUndefined();
  });

  it('les images sociales sont des URL absolues', () => {
    for (const key of ['og:image'] as const) {
      expect(get(tags, key)).toMatch(/^https:\/\//);
    }
    expect(get(tags, 'twitter:image', 'name')).toMatch(/^https:\/\//);
  });
});
