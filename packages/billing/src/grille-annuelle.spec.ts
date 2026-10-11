import { describe, expect, it } from 'vitest';

import { billingPlans, montantAnnuelCents, REMISE_ANNUELLE } from './index';

/*
 * Décision d'Avi du 2026-10-01 : 20 % de réduction en paiement annuel sur tous les
 * forfaits mensuels. Les montants attendus sont ceux qu'Avi a donnés, en clair.
 */
describe('grille annuelle : mensuel × 12 − 20 %', () => {
  it('la remise est de 20 %', () => {
    expect(REMISE_ANNUELLE).toBe(0.2);
  });

  it.each([
    ['pro', 2900, 27_840],
    ['team', 9900, 95_040],
  ] as const)('%s : %i centimes/mois → %i centimes/an (278,40 € et 950,40 € selon Avi)', (cle, mensuel, annuel) => {
    expect(billingPlans.find((plan) => plan.key === cle)?.monthlyCents).toBe(mensuel);
    expect(montantAnnuelCents(mensuel)).toBe(annuel);
  });
});
