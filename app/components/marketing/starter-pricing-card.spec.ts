/**
 * Carte publique Starter — test UI (contenu des deux pages de prix).
 *
 * Ce que ce test verrouille, et pourquoi :
 *
 *  - La carte Starter expose **5 avantages** et **aucun quota chiffré**. Les
 *    chiffres qui y figuraient (5 projets actifs, 10 Go, 50 Go, 100 requêtes IA)
 *    n'avaient AUCUNE source et contredisaient à la fois le catalogue et ce qui
 *    est réellement appliqué côté serveur.
 *  - Les deux pages de prix doivent raconter la MÊME chose. Elles divergeaient.
 *  - Les limites TECHNIQUES (CPU/RAM/stockage/bande passante) ne sont pas des
 *    avantages commerciaux et n'ont pas leur place sur une carte de prix.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { creditPlanCatalog } from '@vibecore/billing';
import { describe, expect, it } from 'vitest';
import { pricingMarketingCopy, pricingPlanCopy } from '~/lib/i18n/catalogs/marketing-product';

const root = join(__dirname, '..', '..', '..');
const readSource = (relative: string) => readFileSync(join(root, relative), 'utf8');

/** Retire les commentaires : seul le contenu RENDU compte. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const MARKETING_PAGE = 'app/components/marketing/EcodeProductMarketingPages.tsx';

describe('carte publique Starter — 5 avantages, aucun quota chiffré', () => {
  it('le catalogue expose exactement 5 avantages Starter', () => {
    const starter = creditPlanCatalog.find((plan) => plan.key === 'starter');
    expect(starter).toBeTruthy();
    expect(starter!.features).toHaveLength(5);
  });

  it('les 5 avantages couvrent la structure attendue', () => {
    const starter = creditPlanCatalog.find((plan) => plan.key === 'starter')!;
    const joined = starter.features.join(' | ').toLowerCase();

    /*
     * crédits Agent quotidiens · base de données · slides/vidéos/animations ·
     * un projet publié · déploiements privés ou protégés par mot de passe
     */
    expect(joined).toMatch(/agent credits/);
    expect(joined).toMatch(/every day|daily/);
    expect(joined).toMatch(/database/);
    expect(joined).toMatch(/slide|video|animation/);
    expect(joined).toMatch(/one published project/);
    expect(joined).toMatch(/private|password/);
  });

  it("aucun avantage Starter n'affiche de quota chiffré", () => {
    const starter = creditPlanCatalog.find((plan) => plan.key === 'starter')!;

    for (const feature of starter.features) {
      /*
       * « One published project » est une structure d'offre, pas un quota chiffré :
       * on interdit les unités (Go/GB/requêtes) et les compteurs numériques.
       */
      expect(feature).not.toMatch(/\d+\s?(GB|Go|GiB|requests|requêtes|projects|vCPU)/i);
    }
  });
});

describe('les deux pages de prix ne publient plus de valeur sans source', () => {
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['5 projets actifs', /'5 active'/],
    ['10 Go de stockage Starter', /starter:\s*'10 GB'/],
    ['50 Go de bande passante Starter', /starter:\s*'50 GB'/],
    ['100 requêtes IA/mois Starter', /'AI requests\/month',\s*starter:\s*'100'/],
    ['3 projets', /'projects\.count':\s*3\b/],
  ];

  for (const page of [MARKETING_PAGE]) {
    for (const [label, pattern] of FORBIDDEN) {
      it(`${page} ne contient plus ${label}`, () => {
        expect(withoutComments(readSource(page))).not.toMatch(pattern);
      });
    }
  }

  it('les deux pages annoncent UN projet publié à la fois', () => {
    expect(pricingPlanCopy.en.free.features).toContain('One published project at a time');
    expect(pricingPlanCopy.fr.free.features).toContain('Un projet publié à la fois');
    expect(pricingMarketingCopy.en.comparisonRows).toContainEqual([
      'Published projects at a time',
      '1',
      'Unlimited',
      'Unlimited',
      'Unlimited',
    ]);
  });

  it('les deux pages décrivent les crédits Agent comme quotidiens', () => {
    expect(pricingPlanCopy.en.free.features.join(' ').toLowerCase()).toMatch(/refreshed every day|daily/);
    expect(pricingPlanCopy.fr.free.features.join(' ').toLowerCase()).toMatch(/renouvelés chaque jour|quotidiens/);
  });
});
