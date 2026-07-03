import type { MetaDescriptor } from 'react-router';

/**
 * Shared Open Graph / Twitter card meta for the public marketing pages (E6).
 * Social crawlers need absolute URLs, so the default image is pinned to the
 * canonical marketing origin rather than a root-relative path.
 */
export const MARKETING_SITE_URL = 'https://e-code.ai';
export const DEFAULT_OG_IMAGE = `${MARKETING_SITE_URL}/social_preview_index.jpg`;

export function socialMetaTags({ title, description }: { title: string; description: string }): MetaDescriptor[] {
  return [
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: DEFAULT_OG_IMAGE },
    { name: 'twitter:card', content: 'summary_large_image' },
  ];
}
