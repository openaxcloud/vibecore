import { describe, expect, it } from 'vitest';
import { findFrenchAuditResidue } from './live-audit-heuristics';
import { pricingPlanCopy } from './marketing-product';
import { formatPlanQuotaCopy, planQuotaEn, planQuotaFr } from './plan-quota';

/*
 * L'audit des traductions françaises (`tests/e2e/i18n-french-live.spec.ts`)
 * rougissait sur TOUTES les propositions depuis #691 : `/pricing` affichait
 * « Choisir Team ». Un nom d'offre nu après un verbe se lit comme un mot anglais
 * (« team ») ; précédé de « la formule », c'est un nom de formule — la même
 * tournure que /upgrade (« Choisir la formule {plan} »).
 *
 * On passe ici les libellés des boutons de la page de prix au détecteur de
 * l'audit lui-même : ce test rougit comme la CI, sans navigateur.
 */
describe('boutons de la page de prix, vus par le détecteur de l’audit français', () => {
  const plans = Object.entries(pricingPlanCopy.fr) as [string, { cta: string }][];

  for (const [cle, plan] of plans) {
    it(`${cle} : « ${plan.cta} » n'est pas signalé comme de l'anglais`, () => {
      const entree = { kind: 'text', text: plan.cta, locator: `cta-${cle}` };

      const anglais = {
        kind: 'text',
        text: (pricingPlanCopy.en as Record<string, { cta: string }>)[cle]!.cta,
        locator: `cta-${cle}`,
      };

      expect(findFrenchAuditResidue([anglais], [entree])).toEqual([]);
    });
  }

  it('les formules payantes se choisissent avec la même tournure que /upgrade', () => {
    expect(pricingPlanCopy.fr.pro.cta).toBe('Choisir la formule Pro');
    expect(pricingPlanCopy.fr.team.cta).toBe('Choisir la formule Team');
  });

  /*
   * Même famille, autre page : `/plan-comparison` (publique) compose
   * « Choisir {plan} ». Elle n'est pas dans la liste de l'audit ; avec l'offre
   * Team, elle afficherait le même « Choisir Team ».
   */
  for (const offre of ['Pro', 'Team', 'Core']) {
    it(`/plan-comparison : le bouton de l'offre ${offre} n'est pas signalé`, () => {
      const texte = formatPlanQuotaCopy(planQuotaFr['planComparison.action.choose'], { plan: offre });
      const anglais = formatPlanQuotaCopy(planQuotaEn['planComparison.action.choose'], { plan: offre });

      expect(
        findFrenchAuditResidue(
          [{ kind: 'text', text: anglais, locator: 'choisir' }],
          [{ kind: 'text', text: texte, locator: 'choisir' }],
        ),
      ).toEqual([]);
    });
  }
});
