import { billingPlans, montantAnnuelCents } from '@vibecore/billing';
import { describe, expect, it } from 'vitest';

import { annuelPublicCents, estUnPrixStripe, forfaitsPublics, lienDuForfait } from './forfaits-publics';

/*
 * La page de prix affiche `forfaitsPublics` ; le produit applique `billingPlans`.
 * Ce test rougit dès qu'ils divergent (règle 22 : une affirmation qui doit
 * survivre va dans un test). Mesuré le 2026-10-01 : la page vendait Core 25 € et
 * Pro 100 € avec « jusqu'à 15 collaborateurs », le paiement facturait Pro 29 €
 * avec UNE place.
 */
const plafond = (valeur: number) => (valeur >= 1_000_000 ? null : valeur);

describe('la grille publique est celle que le produit applique', () => {
  it.each(['free', 'pro', 'team'] as const)('%s : prix et limites identiques au catalogue de facturation', (cle) => {
    const plan = billingPlans.find((p) => p.key === cle)!;
    const affiche = forfaitsPublics[cle];

    expect(affiche).toEqual({
      mensuelCents: plan.monthlyCents,
      places: plan.limits['team.members'],
      projets: plafond(plan.limits['projects.count']),
      espacesActifs: plan.limits['workspaces.active'],
      messagesIaParMois: plan.limits['ai.messages'],
      publicationsParMois: plafond(plan.limits['deployments.count']),
      stockageGo: plan.limits['storage.gb'],
    });
  });

  it('annuel −20 % : 278,40 € pour Pro, 950,40 € pour Team — la même règle que la facturation', () => {
    expect(annuelPublicCents(forfaitsPublics.pro.mensuelCents)).toBe(27_840);
    expect(annuelPublicCents(forfaitsPublics.team.mensuelCents)).toBe(95_040);
    expect(annuelPublicCents(2900)).toBe(montantAnnuelCents(2900));
  });

  it('seul un vrai identifiant de prix compte comme prix annuel — pas l’adresse e-mail mesurée en production', () => {
    expect(estUnPrixStripe('price_1RrH8b2VSIgdqPLPCDou48K3')).toBe(true);
    expect(estUnPrixStripe('quelquun@example.com')).toBe(false);
    expect(estUnPrixStripe('')).toBe(false);
    expect(estUnPrixStripe(null)).toBe(false);
  });

  it('les boutons emmènent l’offre et la période jusqu’au paiement ; Core passe par un devis', () => {
    expect(lienDuForfait('pro', 'yearly')).toBe('/subscribe?plan=pro&interval=annual');
    expect(lienDuForfait('team', 'monthly')).toBe('/subscribe?plan=team&interval=monthly');
    expect(lienDuForfait('core', 'monthly')).toBe('/contact-sales');
    expect(lienDuForfait('free', 'yearly')).toBe('/register');
  });
});
