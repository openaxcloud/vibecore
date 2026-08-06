import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { meta as chatbotMeta } from './solutions.chatbot-builder';
import { meta as dashboardMeta } from './solutions.dashboard-builder';
import { links as enterpriseLinks, meta as enterpriseMeta } from './solutions.enterprise';
import { meta as freelancersMeta } from './solutions.freelancers';
import { meta as gameMeta } from './solutions.game-builder';
import { meta as internalAiMeta } from './solutions.internal-ai-builder';
import { meta as startupsMeta } from './solutions.startups';
import { meta as websiteMeta } from './solutions.website-builder';
import { CHATBOT_BUILDER_COPY } from '~/components/marketing/solutions/chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from '~/components/marketing/solutions/dashboard-builder.copy';
import { ENTERPRISE_COPY } from '~/components/marketing/solutions/enterprise.copy';
import { FREELANCERS_COPY } from '~/components/marketing/solutions/freelancers.copy';
import { GAME_BUILDER_COPY } from '~/components/marketing/solutions/game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from '~/components/marketing/solutions/internal-ai-builder.copy';
import { STARTUPS_COPY } from '~/components/marketing/solutions/startups.copy';
import { WEBSITE_BUILDER_COPY } from '~/components/marketing/solutions/website-builder.copy';

const routes = [
  { slug: 'website-builder', copy: WEBSITE_BUILDER_COPY, meta: websiteMeta },
  { slug: 'game-builder', copy: GAME_BUILDER_COPY, meta: gameMeta },
  { slug: 'dashboard-builder', copy: DASHBOARD_BUILDER_COPY, meta: dashboardMeta },
  { slug: 'chatbot-builder', copy: CHATBOT_BUILDER_COPY, meta: chatbotMeta },
  { slug: 'internal-ai-builder', copy: INTERNAL_AI_BUILDER_COPY, meta: internalAiMeta },
  { slug: 'enterprise', copy: ENTERPRISE_COPY, meta: enterpriseMeta },
  { slug: 'startups', copy: STARTUPS_COPY, meta: startupsMeta },
  { slug: 'freelancers', copy: FREELANCERS_COPY, meta: freelancersMeta },
] as const;

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

        const expectedImageAlt =
          route.slug === 'enterprise'
            ? `${route.copy[language].hero.title} — E-Code`
            : route.copy[language].seo.ogImageAlt;

        expect(metadata).toContainEqual({ property: 'og:image', content: expectedImage });
        expect(metadata).toContainEqual({ property: 'og:image:type', content: 'image/png' });
        expect(metadata).toContainEqual({ property: 'og:image:width', content: '1200' });
        expect(metadata).toContainEqual({ property: 'og:image:height', content: '630' });
        expect(metadata).toContainEqual({ property: 'og:image:alt', content: expectedImageAlt });
        expect(metadata).toContainEqual({ name: 'twitter:image', content: expectedImage });
        expect(metadata).toContainEqual({ name: 'twitter:image:alt', content: expectedImageAlt });
        expect(metadata).toContainEqual({ property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' });

        const imagePath = path.join(process.cwd(), 'public/assets/og/solutions', `${route.slug}-${language}.png`);

        expect(readPngSize(imagePath)).toEqual({ width: 1200, height: 630 });
      });
    }
  }

  for (const route of routes.filter(({ slug }) => slug !== 'enterprise')) {
    for (const language of ['en', 'fr'] as const) {
      it(`${route.slug} ${language}: publishes the exact localized canonical URL`, () => {
        const localizedCanonicalUrl = `https://e-code.ai/solutions/${route.slug}?lang=${language}`;
        const metadata = route.meta({ data: { language } } as Parameters<typeof route.meta>[0]);

        expect(metadata).toContainEqual({ tagName: 'link', rel: 'canonical', href: localizedCanonicalUrl });
        expect(metadata).toContainEqual({ property: 'og:url', content: localizedCanonicalUrl });
      });
    }
  }

  it('preserves the exact unlocalized Enterprise canonical URL', () => {
    const canonicalUrl = 'https://e-code.ai/solutions/enterprise';

    expect(enterpriseLinks()).toEqual([
      { rel: 'canonical', href: canonicalUrl },
      { rel: 'alternate', href: `${canonicalUrl}?lang=en`, hrefLang: 'en' },
      { rel: 'alternate', href: `${canonicalUrl}?lang=fr`, hrefLang: 'fr' },
      { rel: 'alternate', href: canonicalUrl, hrefLang: 'x-default' },
    ]);

    for (const language of ['en', 'fr'] as const) {
      const metadata = enterpriseMeta({ data: { language } } as Parameters<typeof enterpriseMeta>[0]);

      expect(metadata).not.toContainEqual(expect.objectContaining({ rel: 'canonical' }));
      expect(metadata).toContainEqual({ property: 'og:url', content: canonicalUrl });
    }
  });
});
