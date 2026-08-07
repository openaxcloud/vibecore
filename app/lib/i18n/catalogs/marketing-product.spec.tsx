import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  aiAgentMarketingCopy,
  getAiAgentMarketingCopy,
  getPricingMarketingCopy,
  getPricingPlanCopy,
  getProductMarketingRouteCopy,
  pricingPlanCopy,
  productMarketingRouteCopy,
} from './marketing-product';
import {
  EcodeAiAgentPage,
  EcodePricingPage,
  makeEcodeProductMeta,
} from '~/components/marketing/EcodeProductMarketingPages';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/'] });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe('product marketing EN/FR catalogs', () => {
  it('keeps route, plan and interactive AI Agent data aligned by stable keys', () => {
    expect(Object.keys(productMarketingRouteCopy.fr)).toEqual(Object.keys(productMarketingRouteCopy.en));
    expect(Object.keys(pricingPlanCopy.fr)).toEqual(Object.keys(pricingPlanCopy.en));
    expect(aiAgentMarketingCopy.fr.segments.map(({ id }) => id)).toEqual(
      aiAgentMarketingCopy.en.segments.map(({ id }) => id),
    );
    expect(aiAgentMarketingCopy.fr.reels.map(({ id }) => id)).toEqual(
      aiAgentMarketingCopy.en.reels.map(({ id }) => id),
    );
    expect(aiAgentMarketingCopy.fr.capabilities).toHaveLength(aiAgentMarketingCopy.en.capabilities.length);
    expect(aiAgentMarketingCopy.fr.comparison).toHaveLength(aiAgentMarketingCopy.en.comparison.length);
  });

  it('falls back to English while resolving complete French page and pricing copy', () => {
    expect(getProductMarketingRouteCopy('pricing', 'fr').title).toBe('Tarifs');
    expect(getProductMarketingRouteCopy('pricing', 'de').title).toBe('Pricing');
    expect(getAiAgentMarketingCopy('fr').heroAccent).toBe('Créez des applications en langage naturel');
    expect(getPricingPlanCopy('fr').core.features).toContain('25 € de crédits par mois');
    expect(getPricingMarketingCopy('fr').recommended).toBe('RECOMMANDÉ');
  });

  it('keeps the localized Starter offer aligned with the five-benefit public contract', () => {
    expect(pricingPlanCopy.en.free.features).toEqual([
      'Free Agent credits, refreshed every day',
      'Full-stack database included',
      'Build slide decks, videos and animations',
      'One published project at a time',
      'Private or password-protected deployments',
    ]);
    expect(pricingPlanCopy.fr.free.features).toEqual([
      'Crédits Agent gratuits, renouvelés chaque jour',
      'Base de données intégrée pour une application complète',
      'Création de présentations, de vidéos et d’animations',
      'Un projet publié à la fois',
      'Déploiements privés ou protégés par mot de passe',
    ]);

    expect(getPricingMarketingCopy('en').comparisonRows).toContainEqual([
      'Published projects at a time',
      '1',
      'Unlimited',
      'Unlimited',
      'Unlimited',
    ]);
    expect(getPricingMarketingCopy('fr').comparisonRows).toContainEqual([
      'Projets publiés simultanément',
      '1',
      'Illimités',
      'Illimités',
      'Illimités',
    ]);
  });

  it('renders the AI Agent page in French without its former English hero copy', () => {
    const markup = renderInFrench(<EcodeAiAgentPage />);

    expect(markup).toContain('Créez des applications en langage naturel');
    expect(markup).toContain('Aucune carte bancaire requise');
    expect(markup).toContain('Démonstrations à la une');
    expect(markup).not.toContain('Build Apps with Natural Language');
    expect(markup).not.toContain('Featured Demos');
  });

  it('renders pricing in French with locale-aware euro formatting', () => {
    const markup = renderInFrench(<EcodePricingPage />);

    expect(markup).toContain('Des tarifs qui évoluent');
    expect(markup).toContain('RECOMMANDÉ');
    expect(markup).toMatch(/25[\u00a0\u202f]€/u);
    expect(markup).toContain('Questions fréquentes');
    expect(markup).toContain('aria-label="Période de facturation"');
    expect(markup).toContain('aria-label="Afficher les tarifs annuels"');
    expect(markup).toContain('aria-label="Comparaison détaillée des offres tarifaires E-Code"');
    expect(markup).toContain('Création de présentations, de vidéos et d’animations');
    expect(markup).toContain('Projets publiés simultanément');
    expect(markup).toContain('min-h-11');
    expect(markup).not.toContain('Compare plans in detail');
    expect(markup).not.toContain('Contact for pricing');
  });

  it('localizes product metadata from the active root locale', () => {
    const descriptors = makeEcodeProductMeta('ai-agent')({
      data: undefined,
      matches: [{ id: 'root', data: { language: 'fr' } }],
    } as never);

    expect(descriptors).toEqual(
      expect.arrayContaining([
        { title: 'Agent IA v2 - E-Code' },
        { property: 'og:title', content: 'Agent IA v2 - E-Code' },
        { name: 'description', content: expect.stringContaining('Décrivez votre idée') },
      ]),
    );
  });

  it('keeps the completed AI Agent and pricing slices free of their former inline copy', () => {
    const source = readFileSync(
      new URL('../../../components/marketing/EcodeProductMarketingPages.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('Build Apps with Natural Language');
    expect(source).not.toContain('Compare plans in detail');
    expect(source).not.toContain("Built for the world's most demanding teams");
    expect(source).toContain('getAiAgentMarketingCopy');
    expect(source).toContain('getPricingMarketingCopy');
  });
});
