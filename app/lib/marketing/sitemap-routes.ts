/**
 * Inventaire des URL publiques indexables — source unique du sitemap.
 *
 * BUG-MKT-001 : `public/robots.txt` annonce `Sitemap: https://e-code.ai/sitemap.xml`
 * alors que cette URL renvoyait 404. Le site publiait donc lui-même un pointeur
 * mort : chaque robot qui suit la directive tombe sur une erreur, et aucune page
 * n'est découverte par ce canal.
 *
 * Les pages de solutions sont dérivées de `solutionPages` plutôt que recopiées :
 * une liste écrite à la main diverge dès qu'on ajoute une solution, et un sitemap
 * qui ment est pire que pas de sitemap.
 */
import { solutionPages } from '~/components/marketing/EcodeMarketingPages';

export interface SitemapEntry {
  path: string;

  /** Indication de fréquence pour les robots — jamais une garantie. */
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';

  /** Priorité RELATIVE au sein du site, pas un classement absolu. */
  priority: number;
}

/**
 * Pages marketing publiques, hors solutions.
 *
 * N'y figurent que des pages réellement publiques et indexables : ni espace
 * authentifié, ni route d'API, ni page de confirmation atteignable seulement
 * après une action (par ex. `/newsletter-confirmed`), qu'un robot ne doit pas
 * référencer.
 */
const STATIC_MARKETING_ROUTES: SitemapEntry[] = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/pricing', changefreq: 'weekly', priority: 0.9 },
  { path: '/features', changefreq: 'weekly', priority: 0.9 },
  { path: '/solutions', changefreq: 'weekly', priority: 0.8 },
  { path: '/enterprise', changefreq: 'monthly', priority: 0.8 },
  { path: '/about', changefreq: 'monthly', priority: 0.6 },
  { path: '/contact', changefreq: 'monthly', priority: 0.6 },
  { path: '/contact-sales', changefreq: 'monthly', priority: 0.6 },
  { path: '/blog', changefreq: 'daily', priority: 0.7 },
  { path: '/changelog', changefreq: 'weekly', priority: 0.5 },
  { path: '/careers', changefreq: 'weekly', priority: 0.5 },
  { path: '/community', changefreq: 'weekly', priority: 0.5 },
  { path: '/templates', changefreq: 'weekly', priority: 0.6 },
  { path: '/legal', changefreq: 'yearly', priority: 0.3 },
  { path: '/terms', changefreq: 'yearly', priority: 0.3 },
  { path: '/privacy', changefreq: 'yearly', priority: 0.3 },
  { path: '/security', changefreq: 'monthly', priority: 0.4 },
];

/** Toutes les entrées du sitemap, solutions comprises, sans doublon. */
export function sitemapEntries(): SitemapEntry[] {
  const solutions: SitemapEntry[] = Object.keys(solutionPages).map((slug) => ({
    path: `/solutions/${slug}`,
    changefreq: 'monthly',
    priority: 0.7,
  }));

  const all = [...STATIC_MARKETING_ROUTES, ...solutions];
  const seen = new Set<string>();

  // Un chemin en double ferait un sitemap invalide aux yeux de certains robots.
  return all.filter((entry) => (seen.has(entry.path) ? false : (seen.add(entry.path), true)));
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Rend le document sitemap 0.9 complet pour une origine donnée. */
export function renderSitemap(origin: string, lastmod: string): string {
  const urls = sitemapEntries()
    .map((entry) =>
      [
        '  <url>',
        `    <loc>${escapeXml(`${origin}${entry.path}`)}</loc>`,
        `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority.toFixed(1)}</priority>`,
        '  </url>',
      ].join('\n'),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
