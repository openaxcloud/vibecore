import { describe, expect, it } from 'vitest';

import { billingPlans } from './index';

/*
 * Décision d'Avi du 2026-10-01 — places d'équipe (`team.members`) par forfait :
 * gratuit 1, Pro 5, Team 25. Pro valait 1 : un client qui PAIE ne pouvait inviter
 * personne (mesuré le 2026-10-01, BUG-QA0930-INVITATION-SANS-PLACE).
 *
 * Ces limites sont recopiées dans la table `Plan` à chaque démarrage de l'API
 * (`seedBillingPlans`) : c'est bien ce chiffre qui s'applique en production.
 */
describe('places d’équipe par forfait (décision d’Avi du 01/10)', () => {
  it.each([
    ['free', 1],
    ['pro', 5],
    ['team', 25],
  ] as const)('%s : %i place(s)', (cle, places) => {
    const forfait = billingPlans.find((plan) => plan.key === cle);

    expect(forfait, `le forfait ${cle} existe`).toBeDefined();
    expect(forfait!.limits['team.members']).toBe(places);
  });

  it('prix de la grille qui fait foi : Pro 29 / mois, Team 99 / mois', () => {
    expect(billingPlans.find((plan) => plan.key === 'pro')?.monthlyCents).toBe(2900);
    expect(billingPlans.find((plan) => plan.key === 'team')?.monthlyCents).toBe(9900);
  });
});
