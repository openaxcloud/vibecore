import type { LoaderFunctionArgs } from 'react-router';
import { getMarketingExactChangelogCopy } from '~/lib/i18n/catalogs/marketing-exact-changelog';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { changelogReleases } from '~/lib/marketing/changelog-releases';

/*
 * F27 — public changelog RSS feed (/changelog.xml). The changelog page itself
 * already existed; this exposes the same New/Improved/Fixed entries as a real
 * RSS 2.0 feed so users can subscribe. Single source of truth is
 * `changelogReleases`; icons are page-only and ignored here.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRfc822(date: string): string | null {
  const parsed = new Date(date);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toUTCString();
}

export function loader({ request }: LoaderFunctionArgs) {
  const origin = new URL(request.url).origin;
  const self = `${origin}/changelog.xml`;
  const page = `${origin}/changelog`;
  const language = resolveRequestLocale(request).language === 'fr' ? 'fr' : 'en';
  const copy = getMarketingExactChangelogCopy(language).exactChangelog;

  const items = changelogReleases
    .map((release) => {
      const link = `${page}#${encodeURIComponent(release.version)}`;
      const releaseCopy = copy.releases[release.id];

      const description = [
        `${copy.timeline.types[release.type]}: ${releaseCopy.title}`,
        ...releaseCopy.changes.map((change) => `• ${change}`),
      ].join('\n');

      const pubDate = toRfc822(release.publishedAt);

      return [
        '    <item>',
        `      <title>${escapeXml(`${release.version} — ${releaseCopy.title}`)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="false">ecode-changelog-${escapeXml(release.version)}</guid>`,
        `      <category>${escapeXml(copy.timeline.types[release.type])}</category>`,
        pubDate ? `      <pubDate>${pubDate}</pubDate>` : '',
        `      <description>${escapeXml(description)}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(copy.feed.title)}</title>
    <link>${escapeXml(page)}</link>
    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(copy.feed.description)}</description>
    <language>${language}</language>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
