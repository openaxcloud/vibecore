import { describe, expect, it } from 'vitest';

import { CHATBOT_BUILDER_COPY } from './chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from './dashboard-builder.copy';
import { ENTERPRISE_COPY } from './enterprise.copy';
import { FREELANCERS_COPY } from './freelancers.copy';
import { GAME_BUILDER_COPY } from './game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from './internal-ai-builder.copy';
import type { SolutionCopy, SolutionCopyByLanguage } from './solution-copy';
import { STARTUPS_COPY } from './startups.copy';
import { WEBSITE_BUILDER_COPY } from './website-builder.copy';

const DECLINES: Record<string, SolutionCopyByLanguage> = {
  'website-builder': WEBSITE_BUILDER_COPY,
  'game-builder': GAME_BUILDER_COPY,
  'dashboard-builder': DASHBOARD_BUILDER_COPY,
  'chatbot-builder': CHATBOT_BUILDER_COPY,
  'internal-ai-builder': INTERNAL_AI_BUILDER_COPY,
  enterprise: ENTERPRISE_COPY,
  startups: STARTUPS_COPY,
  freelancers: FREELANCERS_COPY,
};

const HONEST_BADGE = { en: 'Fictional demo data', fr: 'Données fictives' } as const;
const HONEST_DISCLAIMER = { en: 'not a generation record', fr: 'pas une trace de génération' } as const;

function assertStructure(copy: SolutionCopy) {
  expect(copy.demo.nav).toHaveLength(3);
  expect(copy.demo.primaryRows).toHaveLength(3);
  expect(copy.demo.asideRows).toHaveLength(3);
  expect(copy.problem.obstacles).toHaveLength(3);
  expect(copy.build.outputs).toHaveLength(4);
  expect(copy.deliverables.items).toHaveLength(6);
  expect(copy.features.items).toHaveLength(6);
  expect(copy.useCases.items).toHaveLength(4);
  expect(copy.faq.items).toHaveLength(5);
}

describe('declined solution sales pages (SOL-02 → SOL-09)', () => {
  for (const [slug, byLanguage] of Object.entries(DECLINES)) {
    describe(slug, () => {
      for (const language of ['en', 'fr'] as const) {
        const copy = byLanguage[language];

        it(`${language}: has the exact section structure`, () => {
          assertStructure(copy);
        });

        it(`${language}: carries the honest demo labelling`, () => {
          expect(copy.demo.badge).toBe(HONEST_BADGE[language]);
          expect(copy.demo.disclaimer.toLowerCase()).toContain(HONEST_DISCLAIMER[language].toLowerCase());
        });

        it(`${language}: points to the App Builder page for the real IDE proof (no fabricated per-use-case run)`, () => {
          const blob = JSON.stringify(copy).toLowerCase();
          const claimsRealRun = /captured (real )?e-code workspace|real e-code workspace captured/.test(blob);
          expect(claimsRealRun).toBe(false);
        });

        it(`${language}: fills every headline and body`, () => {
          expect(copy.seo.title.length).toBeGreaterThan(0);
          expect(copy.hero.title.length).toBeGreaterThan(0);
          expect(copy.finalCta.title.length).toBeGreaterThan(0);
        });
      }
    });
  }
});
