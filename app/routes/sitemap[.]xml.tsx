import { MARKETING_BLOG_POST_SLUGS } from '~/lib/i18n/catalogs/marketing-blog-detail';

export const ECODE_CANONICAL_ORIGIN = 'https://e-code.ai';

/**
 * Canonical, indexable English marketing routes. Authenticated application
 * routes, validation/demo utilities and duplicate `/marketing/*` aliases are
 * intentionally absent. Locale alternates are emitted for each URL below.
 */
export const INDEXABLE_PUBLIC_PATHS = [
  '/',
  '/about',
  '/acceptable-use',
  '/accessibility',
  '/account-inactivity',
  '/ai',
  '/ai-agent',
  '/ai-agent/studio',
  '/ai-docs',
  '/ai-documentation',
  '/blog',
  '/bounties',
  '/careers',
  '/case-studies',
  '/changelog',
  '/collaboration',
  '/commercial-agreement',
  '/community',
  '/compare',
  '/compare/aws-cloud9',
  '/compare/codesandbox',
  '/compare/github-codespaces',
  '/compare/glitch',
  '/compare/heroku',
  '/contact',
  '/contact-sales',
  '/customers',
  '/data-deletion',
  '/deleting-your-data',
  '/demo',
  '/deployments',
  '/desktop',
  '/docs',
  '/dpa',
  '/enterprise',
  '/enforcement',
  '/explore',
  '/features',
  '/forum',
  '/gallery',
  '/help',
  '/help-center',
  '/languages',
  '/legal',
  '/licensing',
  '/marketplace',
  '/marketplace/templates',
  '/mcp',
  '/mobile',
  '/newsletter',
  '/partners',
  '/polyglot',
  '/press',
  '/pricing',
  '/privacy',
  '/product',
  '/report-abuse',
  '/search',
  '/security',
  '/solutions',
  '/solutions/app-builder',
  '/solutions/chatbot-builder',
  '/solutions/dashboard-builder',
  '/solutions/enterprise',
  '/solutions/freelancers',
  '/solutions/game-builder',
  '/solutions/internal-ai-builder',
  '/solutions/startups',
  '/solutions/website-builder',
  '/status',
  '/strike-system',
  '/student-dpa',
  '/subprocessors',
  '/support-policy',
  '/team',
  '/templates',
  '/templates/languages',
  '/terms',
  '/trust-and-safety',
  '/tutorials',
  '/usage-limits',
] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absoluteUrl(path: string, language?: 'en' | 'fr'): string {
  const url = new URL(path, ECODE_CANONICAL_ORIGIN);

  if (language) {
    url.searchParams.set('lang', language);
  }

  return url.toString();
}

export function collectSitemapPaths(): string[] {
  const blogPaths = MARKETING_BLOG_POST_SLUGS.map((slug) => `/blog/${slug}`);
  const paths = new Set<string>([...INDEXABLE_PUBLIC_PATHS, ...blogPaths]);

  return [...paths].sort((left, right) => {
    if (left === '/') {
      return -1;
    }

    if (right === '/') {
      return 1;
    }

    return left.localeCompare(right);
  });
}

export function renderSitemap(paths = collectSitemapPaths()): string {
  const urls = paths
    .map((path) => {
      const canonical = absoluteUrl(path);
      const english = canonical;
      const french = absoluteUrl(path, 'fr');

      return [
        '  <url>',
        `    <loc>${escapeXml(canonical)}</loc>`,
        `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(english)}" />`,
        `    <xhtml:link rel="alternate" hreflang="fr" href="${escapeXml(french)}" />`,
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(canonical)}" />`,
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

export function loader() {
  return new Response(renderSitemap(), {
    headers: {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      'content-type': 'application/xml; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  });
}
