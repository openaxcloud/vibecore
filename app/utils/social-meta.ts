import type { MetaDescriptor } from 'react-router';

/**
 * Métadonnées partagées des pages publiques (Open Graph / Twitter / canonical).
 *
 * Les crawlers sociaux exigent des URL ABSOLUES : l'image par défaut est donc
 * épinglée à l'origine marketing plutôt qu'à un chemin relatif.
 *
 * Bugs couverts par ce module :
 *  - BUG-MKT-003 : aucune balise `<link rel="canonical">` n'était émise. Avec une
 *    négociation de langue qui sert deux contenus sous la même URL, les moteurs
 *    arbitraient seuls quelle version indexer.
 *  - BUG-MKT-004 : `og:title` manquait sur 4 pages (`/solutions`, `/terms`,
 *    `/privacy`, `/changelog`) qui n'appelaient pas ce helper.
 *  - BUG-MKT-006 : `og:url` absent — un partage social ne portait pas l'adresse
 *    canonique de la page.
 *  - BUG-MKT-007 : `og:type` et `og:site_name` absents.
 *  - BUG-MKT-008 : `twitter:title` / `twitter:description` absents — seule
 *    l'image était fournie, donc la carte affichait un titre deviné.
 */
export const MARKETING_SITE_URL = 'https://e-code.ai';
export const DEFAULT_OG_IMAGE = `${MARKETING_SITE_URL}/social_preview_index.jpg`;
export const DEFAULT_OG_IMAGE_ALT = 'E-Code — build, ship and scale production applications with AI';

/**
 * Construit l'URL absolue canonique d'un chemin.
 *
 * Normalise pour qu'une même page n'ait jamais deux canoniques concurrents :
 * la barre finale est retirée (sauf racine) et la query est ignorée — deux URL
 * qui ne diffèrent que par `?utm_source` désignent la même page.
 */
export function canonicalUrl(path: string): string {
  const withoutQuery = path.split('?')[0].split('#')[0];
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;

  const normalized = withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : '/';

  return `${MARKETING_SITE_URL}${normalized === '/' ? '' : normalized}` || MARKETING_SITE_URL;
}

export interface SocialMetaInput {
  title: string;
  description: string;

  /** Chemin de la page (`/pricing`). Omis ⇒ pas de canonical ni d'og:url. */
  path?: string;

  /** `website` par défaut ; `article` pour un billet de blog. */
  type?: 'website' | 'article';

  /**
   * Alternative textuelle de l'image sociale.
   *
   * Par défaut le TITRE de la page, pas une constante anglaise : sur une page
   * servie en français, un alt figé en anglais est précisément la régression
   * que la localisation corrige. Les pages dont l'illustration mérite une
   * description propre passent leur propre valeur (déjà traduite).
   */
  imageAlt?: string;
}

export function socialMetaTags({
  title,
  description,
  path,
  type = 'website',
  imageAlt = title,
}: SocialMetaInput): MetaDescriptor[] {
  const url = path ? canonicalUrl(path) : undefined;

  return [
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: type },
    { property: 'og:site_name', content: 'E-Code' },
    ...(url ? [{ property: 'og:url', content: url } as MetaDescriptor] : []),
    { property: 'og:image', content: DEFAULT_OG_IMAGE },
    { property: 'og:image:type', content: 'image/jpeg' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },

    /*
     * Sans titre ni description explicites, la carte Twitter retombe sur ce
     * qu'elle devine dans la page — souvent le premier texte venu.
     */
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: DEFAULT_OG_IMAGE },
    { name: 'twitter:image:alt', content: imageAlt },
    ...(url ? [{ tagName: 'link', rel: 'canonical', href: url } as unknown as MetaDescriptor] : []),
  ];
}
