import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { links as chatbotLinks, meta as chatbotMeta } from './solutions.chatbot-builder';
import { links as dashboardLinks, meta as dashboardMeta } from './solutions.dashboard-builder';
import { links as enterpriseLinks, meta as enterpriseMeta } from './solutions.enterprise';
import { links as freelancersLinks, meta as freelancersMeta } from './solutions.freelancers';
import { links as gameLinks, meta as gameMeta } from './solutions.game-builder';
import { links as internalAiLinks, meta as internalAiMeta } from './solutions.internal-ai-builder';
import { links as startupsLinks, meta as startupsMeta } from './solutions.startups';
import { links as websiteLinks, meta as websiteMeta } from './solutions.website-builder';
import { CHATBOT_BUILDER_COPY } from '~/components/marketing/solutions/chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from '~/components/marketing/solutions/dashboard-builder.copy';
import { ENTERPRISE_COPY } from '~/components/marketing/solutions/enterprise.copy';
import { FREELANCERS_COPY } from '~/components/marketing/solutions/freelancers.copy';
import { GAME_BUILDER_COPY } from '~/components/marketing/solutions/game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from '~/components/marketing/solutions/internal-ai-builder.copy';
import type { SolutionCopyByLanguage } from '~/components/marketing/solutions/solution-copy';
import { STARTUPS_COPY } from '~/components/marketing/solutions/startups.copy';
import { WEBSITE_BUILDER_COPY } from '~/components/marketing/solutions/website-builder.copy';

const routes = [
  { slug: 'website-builder', meta: websiteMeta, links: websiteLinks, copy: WEBSITE_BUILDER_COPY },
  { slug: 'game-builder', meta: gameMeta, links: gameLinks, copy: GAME_BUILDER_COPY },
  { slug: 'dashboard-builder', meta: dashboardMeta, links: dashboardLinks, copy: DASHBOARD_BUILDER_COPY },
  { slug: 'chatbot-builder', meta: chatbotMeta, links: chatbotLinks, copy: CHATBOT_BUILDER_COPY },
  {
    slug: 'internal-ai-builder',
    meta: internalAiMeta,
    links: internalAiLinks,
    copy: INTERNAL_AI_BUILDER_COPY,
  },
  { slug: 'enterprise', meta: enterpriseMeta, links: enterpriseLinks, copy: ENTERPRISE_COPY },
  { slug: 'startups', meta: startupsMeta, links: startupsLinks, copy: STARTUPS_COPY },
  { slug: 'freelancers', meta: freelancersMeta, links: freelancersLinks, copy: FREELANCERS_COPY },
] as const;

function metaValue(
  metadata: ReturnType<(typeof routes)[number]['meta']>,
  attribute: 'name' | 'property',
  key: string,
): string | undefined {
  const descriptor = metadata?.find((candidate) =>
    attribute === 'name'
      ? 'name' in candidate && candidate.name === key
      : 'property' in candidate && candidate.property === key,
  );

  return descriptor && 'content' in descriptor ? String(descriptor.content) : undefined;
}

function readPngSize(file: string): { width: number; height: number } {
  const image = readFileSync(file);

  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

describe('declined solution routes', () => {
  for (const route of routes) {
    for (const language of ['en', 'fr'] as const) {
      it(`${route.slug} ${language}: publishes a dedicated complete Open Graph image`, () => {
        const metadata = route.meta({ data: { language } } as Parameters<typeof route.meta>[0]);
        const expectedImage = `https://e-code.ai/assets/og/solutions/${route.slug}-${language}.png`;

        expect(metadata).toContainEqual({ property: 'og:image', content: expectedImage });
        expect(metadata).toContainEqual({ property: 'og:image:type', content: 'image/png' });
        expect(metadata).toContainEqual({ property: 'og:image:width', content: '1200' });
        expect(metadata).toContainEqual({ property: 'og:image:height', content: '630' });
        expect(metadata).toContainEqual({ name: 'twitter:image', content: expectedImage });
        expect(metadata).toContainEqual({ property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' });

        const imagePath = path.join(process.cwd(), 'public/assets/og/solutions', `${route.slug}-${language}.png`);

        expect(readPngSize(imagePath)).toEqual({ width: 1200, height: 630 });
      });
    }

    it(`${route.slug}: keeps canonical and hreflang stable across EN and FR`, () => {
      const canonicalUrl = `https://e-code.ai/solutions/${route.slug}`;
      const links = route.links();
      const fr = route.meta({ data: { language: 'fr' } } as Parameters<typeof route.meta>[0]);
      const en = route.meta({ data: { language: 'en' } } as Parameters<typeof route.meta>[0]);

      expect(links).toContainEqual({ rel: 'canonical', href: canonicalUrl });
      expect(links).toContainEqual({ rel: 'alternate', href: `${canonicalUrl}?lang=en`, hrefLang: 'en' });
      expect(links).toContainEqual({ rel: 'alternate', href: `${canonicalUrl}?lang=fr`, hrefLang: 'fr' });
      expect(links).toContainEqual({ rel: 'alternate', href: canonicalUrl, hrefLang: 'x-default' });
      expect(metaValue(fr, 'property', 'og:url')).toBe(canonicalUrl);
      expect(metaValue(en, 'property', 'og:url')).toBe(canonicalUrl);
    });

    it(`${route.slug}: localizes title, description, OG, Twitter and image alt from one catalogue`, () => {
      for (const language of ['en', 'fr'] as const) {
        const copy = (route.copy as SolutionCopyByLanguage)[language];
        const metadata = route.meta({ data: { language } } as Parameters<typeof route.meta>[0]);

        expect(metadata).toContainEqual({ title: copy.seo.title });
        expect(metaValue(metadata, 'name', 'description')).toBe(copy.seo.description);
        expect(metaValue(metadata, 'property', 'og:title')).toBe(copy.seo.title);
        expect(metaValue(metadata, 'property', 'og:description')).toBe(copy.seo.description);
        expect(metaValue(metadata, 'property', 'og:image:alt')).toBe(copy.seo.ogImageAlt);
        expect(metaValue(metadata, 'name', 'twitter:title')).toBe(copy.seo.title);
        expect(metaValue(metadata, 'name', 'twitter:description')).toBe(copy.seo.description);
        expect(metaValue(metadata, 'name', 'twitter:image:alt')).toBe(copy.seo.ogImageAlt);
      }

      const fr = route.meta({ data: { language: 'fr' } } as Parameters<typeof route.meta>[0]);
      const en = route.meta({ data: { language: 'en' } } as Parameters<typeof route.meta>[0]);

      expect(metaValue(fr, 'property', 'og:title')).not.toBe(metaValue(en, 'property', 'og:title'));
      expect(metaValue(fr, 'property', 'og:description')).not.toBe(metaValue(en, 'property', 'og:description'));
      expect(metaValue(fr, 'property', 'og:locale')).toBe('fr_FR');
      expect(metaValue(fr, 'property', 'og:locale:alternate')).toBe('en_US');
      expect(metaValue(en, 'property', 'og:locale')).toBe('en_US');
      expect(metaValue(en, 'property', 'og:locale:alternate')).toBe('fr_FR');
    });

    it(`${route.slug}: falls back to complete English metadata for an unsupported locale`, () => {
      const metadata = route.meta({ data: { language: 'de' } } as Parameters<typeof route.meta>[0]);

      expect(metadata).toContainEqual({ title: route.copy.en.seo.title });
      expect(metaValue(metadata, 'name', 'description')).toBe(route.copy.en.seo.description);
      expect(metaValue(metadata, 'property', 'og:locale')).toBe('en_US');
      expect(metaValue(metadata, 'property', 'og:image')).toBe(
        `https://e-code.ai/assets/og/solutions/${route.slug}-en.png`,
      );
      expect(metaValue(metadata, 'name', 'twitter:title')).toBe(route.copy.en.seo.title);
    });
  }
});
