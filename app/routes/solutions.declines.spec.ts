import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { meta as chatbotMeta } from './solutions.chatbot-builder';
import { meta as dashboardMeta } from './solutions.dashboard-builder';
import { meta as enterpriseMeta } from './solutions.enterprise';
import { meta as freelancersMeta } from './solutions.freelancers';
import { meta as gameMeta } from './solutions.game-builder';
import { meta as internalAiMeta } from './solutions.internal-ai-builder';
import { meta as startupsMeta } from './solutions.startups';
import { meta as websiteMeta } from './solutions.website-builder';

const routes = [
  { slug: 'website-builder', meta: websiteMeta },
  { slug: 'game-builder', meta: gameMeta },
  { slug: 'dashboard-builder', meta: dashboardMeta },
  { slug: 'chatbot-builder', meta: chatbotMeta },
  { slug: 'internal-ai-builder', meta: internalAiMeta },
  { slug: 'enterprise', meta: enterpriseMeta },
  { slug: 'startups', meta: startupsMeta },
  { slug: 'freelancers', meta: freelancersMeta },
] as const;

function readPngSize(file: string): { width: number; height: number } {
  const image = readFileSync(file);

  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

describe('solution routes', () => {
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
  }
});
