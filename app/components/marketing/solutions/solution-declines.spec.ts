import { describe, expect, it } from 'vitest';

import { CHATBOT_BUILDER_COPY } from './chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from './dashboard-builder.copy';
import { ENTERPRISE_COPY } from './enterprise.copy';
import { FREELANCERS_COPY } from './freelancers.copy';
import { GAME_BUILDER_COPY } from './game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from './internal-ai-builder.copy';
import type { SolutionCopy, SolutionCopyByLanguage } from './solution-copy';
import {
  getSolutionProofVisuals,
  SOLUTION_PROOF_VISUAL_SLUGS,
  type SolutionProofVisualSlug,
} from './solution-proof.visuals';
import { STARTUPS_COPY } from './startups.copy';
import { WEBSITE_BUILDER_COPY } from './website-builder.copy';

const DECLINES = {
  'website-builder': WEBSITE_BUILDER_COPY,
  'game-builder': GAME_BUILDER_COPY,
  'dashboard-builder': DASHBOARD_BUILDER_COPY,
  'chatbot-builder': CHATBOT_BUILDER_COPY,
  'internal-ai-builder': INTERNAL_AI_BUILDER_COPY,
  enterprise: ENTERPRISE_COPY,
  startups: STARTUPS_COPY,
  freelancers: FREELANCERS_COPY,
} as const satisfies Record<SolutionProofVisualSlug, SolutionCopyByLanguage>;

const HONEST_BADGE = { en: 'Fictional demo data', fr: 'Données fictives' } as const;
const HONEST_DISCLAIMER = { en: 'not a generation record', fr: 'pas une trace de génération' } as const;

const REQUIRED_PROMPTS: Readonly<Partial<Record<SolutionProofVisualSlug, Readonly<Record<'en' | 'fr', string>>>>> = {
  'website-builder': {
    en: 'Build a showcase website for my architecture firm, with a portfolio, contact page, and blog.',
    fr: 'Fais-moi un site vitrine pour mon cabinet d’architecte, avec portfolio, contact et blog.',
  },
  'game-builder': {
    en: 'Build a multiplayer quiz game with real-time scoring and a leaderboard.',
    fr: 'Crée un jeu de quiz multijoueur avec score en temps réel et classement.',
  },
  'dashboard-builder': {
    en: 'Build a dashboard for my sales, connected to my database, with charts and filters.',
    fr: 'Un tableau de bord de mes ventes, connecté à ma base, avec graphiques et filtres.',
  },
  'chatbot-builder': {
    en: 'Build an assistant that answers my customers’ questions from my documentation.',
    fr: 'Un assistant qui répond aux questions de mes clients à partir de ma documentation.',
  },
  'internal-ai-builder': {
    en: 'Build an internal agent that searches our HR procedures, available only to my teams.',
    fr: 'Un agent interne qui cherche dans nos procédures RH, réservé à mes équipes.',
  },
};

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
  expect(copy.proofLink.preview.alt.length).toBeGreaterThan(20);
  expect(copy.proofLink.iteration.alt.length).toBeGreaterThan(20);
}

describe('declined solution sales pages (SOL-02 → SOL-09)', () => {
  for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
    const byLanguage = DECLINES[slug];

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

        it(`${language}: describes dedicated IDE evidence without falling back to the App Builder salon`, () => {
          const proof = JSON.stringify(copy.proofLink).toLowerCase();

          expect(proof).not.toMatch(/app builder|salon/);
          expect(proof).toMatch(language === 'fr' ? /captur|preuve|réel|vrai/ : /captur|evidence|real/);
          expect(copy.proofLink.galleryLabel.length).toBeGreaterThan(20);
          expect(copy.proofLink.openFullSizeLabel.length).toBeGreaterThan(0);
        });

        it(`${language}: resolves two dedicated, unique IDE asset paths for its route slug`, () => {
          const assets = getSolutionProofVisuals(slug, language);

          expect(assets.preview.src).toBe(`/assets/solutions/${slug}/${language}/ide-agent-preview.png`);
          expect(assets.iteration.src).toBe(`/assets/solutions/${slug}/${language}/ide-agent-iteration.png`);
          expect(assets.preview.src).not.toBe(assets.iteration.src);
          expect(assets.preview.slug).toBe(slug);
          expect(assets.iteration.slug).toBe(slug);
        });

        it(`${language}: fills every headline and body`, () => {
          expect(copy.seo.title.length).toBeGreaterThan(0);
          expect(copy.hero.title.length).toBeGreaterThan(0);
          expect(copy.finalCta.title.length).toBeGreaterThan(0);
        });

        it(`${language}: uses the approved prompt when the mission defines one`, () => {
          const requiredPrompt = REQUIRED_PROMPTS[slug]?.[language];

          if (requiredPrompt) {
            expect(copy.build.promptText).toBe(requiredPrompt);
          }
        });

        it(`${language}: uses direct customer language instead of specification tone`, () => {
          const blob = JSON.stringify(copy).toLowerCase();
          expect(blob).not.toMatch(/\bshould be\b|\bcan be\b|\bis designed to\b/);
        });
      }
    });
  }

  for (const language of ['en', 'fr'] as const) {
    it(`${language}: keeps every page recognisable without its route title`, () => {
      const signatures = Object.values(DECLINES).map((byLanguage) => {
        const copy = byLanguage[language];

        return [
          copy.demo.brand,
          copy.problem.title,
          copy.build.promptText,
          copy.proofLink.title,
          copy.deliverables.title,
          copy.features.title,
          copy.useCases.title,
          copy.finalCta.title,
        ].join('|');
      });

      expect(new Set(signatures).size).toBe(Object.keys(DECLINES).length);
    });
  }
});
