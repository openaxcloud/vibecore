import type { LucideIcon } from 'lucide-react';

import type { MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import {
  formatMarketingBlogCopy,
  formatMarketingBlogReadTime,
  getMarketingBlogDetailCopy,
} from '~/lib/i18n/catalogs/marketing-blog-detail';

/**
 * The serializable subset of an E-Code blog post needed to render a public blog
 * detail page. Kept structural (no import from the `.server` data module) so this
 * helper stays client-safe and unit-testable, and so the loader can pass the data
 * through React Router's JSON boundary without leaking server-only types.
 */
export interface BlogDetailInput {
  title: string;
  excerpt: string;
  content: string;
  author: string;
  authorRole: string;
  category: string;
  tags: readonly string[];
  readTime: number;
  publishedAt: string;
}

/**
 * Parse the markdown-ish post body into ordered sections. Each `##` heading
 * starts a new section; text before the first heading (and the leading `#` title)
 * is dropped because the title is already shown in the hero. Bullet lines
 * (`- ` / `* `) become section items, everything else becomes prose.
 */
export function parseBlogSections(
  content: string,
  overviewTitle = getMarketingBlogDetailCopy('en')['marketingBlog.ui.overview'],
): MarketingPageDefinition['sections'] {
  const lines = content.split('\n');
  const sections: { title: string; body: string; items: string[] }[] = [];

  let current: { title: string; body: string; items: string[] } | null = null;

  const bodyLines: string[] = [];

  const flushBody = () => {
    if (current) {
      current.body = bodyLines.join(' ').replace(/\s+/g, ' ').trim();
    }

    bodyLines.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('## ')) {
      flushBody();

      current = { title: line.slice(3).trim(), body: '', items: [] };
      sections.push(current);
      continue;
    }

    if (line.startsWith('# ') || line === '') {
      // Skip the top-level title and blank separators.
      continue;
    }

    if (!current) {
      // Lead paragraph before the first heading — promote it to an intro section.
      current = { title: overviewTitle, body: '', items: [] };
      sections.push(current);
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);

    if (bulletMatch) {
      current.items.push(bulletMatch[1].trim());
      continue;
    }

    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);

    if (numberedMatch) {
      current.items.push(numberedMatch[1].trim());
      continue;
    }

    bodyLines.push(line);
  }

  flushBody();

  return sections.filter((section) => section.body !== '' || section.items.length > 0);
}

/**
 * Build a `MarketingPageDefinition` from a single blog post so the existing
 * `MarketingStaticPage` renderer can present it. The icon is injected by the
 * caller because Lucide components are not serializable across the loader
 * boundary.
 */
export function toBlogDetailPageDefinition(
  post: BlogDetailInput,
  icon: LucideIcon,
  language?: string | null,
): MarketingPageDefinition {
  const copy = getMarketingBlogDetailCopy(language);
  const sections = parseBlogSections(post.content, copy['marketingBlog.ui.overview']);

  const highlights = post.tags.length > 0 ? post.tags.slice(0, 6) : [post.category];

  return {
    slug: 'blog-detail',
    title: post.title,
    eyebrow: post.category || copy['marketingBlog.ui.blog'],
    description: post.excerpt,
    kind: 'resource',
    icon,
    primaryAction: [copy['marketingBlog.ui.readDocs'], '/docs'],
    secondaryAction: [copy['marketingBlog.ui.backToBlog'], '/blog'],
    highlights,
    sections:
      sections.length > 0
        ? sections
        : [
            {
              title: copy['marketingBlog.ui.overview'],
              body: post.excerpt,
              items: [
                formatMarketingBlogCopy(copy['marketingBlog.ui.by'], {
                  author: post.author,
                  role: post.authorRole,
                }),
                formatMarketingBlogReadTime(post.readTime, language),
              ],
            },
          ],
  };
}
