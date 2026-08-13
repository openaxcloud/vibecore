import type { LoaderFunctionArgs } from 'react-router';
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

  const items = changelogReleases
    .map((release) => {
      const link = `${page}#${encodeURIComponent(release.version)}`;

      const description = [`${release.type}: ${release.title}`, ...release.changes.map((change) => `• ${change}`)].join(
        '\n',
      );

      const pubDate = toRfc822(release.date);

      return [
        '    <item>',
        `      <title>${escapeXml(`${release.version} — ${release.title}`)}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="false">ecode-changelog-${escapeXml(release.version)}</guid>`,
        `      <category>${escapeXml(release.type)}</category>`,
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
    <title>E-Code Changelog</title>
    <link>${escapeXml(page)}</link>
    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml" />
    <description>The latest features, improvements and fixes shipped in E-Code.</description>
    <language>en</language>
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
