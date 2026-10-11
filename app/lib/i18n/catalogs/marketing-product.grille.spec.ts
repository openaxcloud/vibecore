import { describe, expect, it } from 'vitest';
import {
  avantagesDuForfait,
  lignesDeComparaison,
  pricingMarketingCopy,
  pricingPlanCopy,
  reponseAnnuelle,
} from './marketing-product';

/*
 * L'ANTI-DÉRIVE SANS L'INTERDIT DU VALIDATEUR.
 *
 * Le catalogue doit porter des chaînes LITTÉRALES : `scripts/i18n/validate-catalogs.mjs`
 * refuse toute valeur calculée (`catalog-entry-non-static`), parce que l'extraction
 * et l'audit i18n doivent voir chaque chaîne sans exécuter le code.
 *
 * Mesuré le 2026-10-10 : la première version de la grille appelait
 * `avantagesDuForfait('pro', 'en')`, `lignesDeComparaison('en')` et
 * `reponseAnnuelle('en')` DANS le catalogue, et la CI a refusé **8 entrées**.
 *
 * Mais écrire les montants à la main crée le risque inverse : le catalogue et la
 * grille divergent, et la page de prix annonce autre chose que ce qui est facturé.
 * C'est ce test qui tient l'écart.
 *
 * ⚠️ Si ce test rougit après un changement de prix, la réponse n'est PAS de le
 * mettre à jour à la main : régénérer les littéraux depuis les trois fonctions.
 */

describe('le catalogue marketing dit exactement ce que la grille calcule', () => {
  it('TÉMOIN — les deux catalogues sont chargés et non vides', () => {
    expect(Object.keys(pricingPlanCopy.en).length, 'forfaits EN vides : lecture cassée ?').toBeGreaterThan(2);
    expect(Object.keys(pricingPlanCopy.fr).length, 'forfaits FR vides : lecture cassée ?').toBeGreaterThan(2);
  });

  it('les avantages de Pro et Team, en anglais', () => {
    expect([...pricingPlanCopy.en.pro.features], 'Pro (en) : le littéral du catalogue a dérivé de la grille').toEqual([
      ...avantagesDuForfait('pro', 'en'),
    ]);
    expect([...pricingPlanCopy.en.team.features], 'Team (en) : le littéral du catalogue a dérivé').toEqual([
      ...avantagesDuForfait('team', 'en'),
      'Shared billing and audit logs',
    ]);
  });

  it('les avantages de Pro et Team, en français', () => {
    expect([...pricingPlanCopy.fr.pro.features], 'Pro (fr) : le littéral du catalogue a dérivé de la grille').toEqual([
      ...avantagesDuForfait('pro', 'fr'),
    ]);
    expect([...pricingPlanCopy.fr.team.features], 'Team (fr) : le littéral du catalogue a dérivé').toEqual([
      ...avantagesDuForfait('team', 'fr'),
      'Facturation partagée et journaux d’audit',
    ]);
  });

  it('le tableau de comparaison, dans les deux langues', () => {
    expect(
      pricingMarketingCopy.en.comparisonRows.map((l) => [...l]),
      'comparaison (en) : les montants du catalogue ont dérivé',
    ).toEqual(lignesDeComparaison('en').map((l) => [...l]));
    expect(
      pricingMarketingCopy.fr.comparisonRows.map((l) => [...l]),
      'comparaison (fr) : les montants du catalogue ont dérivé',
    ).toEqual(lignesDeComparaison('fr').map((l) => [...l]));
  });

  it('la réponse sur la facturation annuelle, dans les deux langues', () => {
    const porte = (faq: readonly { answer: string }[], attendu: string) => faq.some((q) => q.answer === attendu);

    expect(
      porte(pricingMarketingCopy.en.billingFaq, reponseAnnuelle('en')),
      'réponse annuelle (en) : le catalogue a dérivé de la grille',
    ).toBe(true);
    expect(
      porte(pricingMarketingCopy.fr.billingFaq, reponseAnnuelle('fr')),
      'réponse annuelle (fr) : le catalogue a dérivé de la grille',
    ).toBe(true);
  });

  it('CONTRÔLE POSITIF — les fonctions calculent bien quelque chose', () => {
    /*
     * Sans ce cas, une fonction qui rendrait un tableau vide passerait tous les
     * tests ci-dessus : « égal à rien » est vrai des deux côtés.
     */
    expect(avantagesDuForfait('pro', 'en').length, 'la grille ne calcule plus rien').toBeGreaterThan(3);
    expect(lignesDeComparaison('en').length, 'plus aucune ligne de comparaison calculée').toBeGreaterThan(2);
    expect(reponseAnnuelle('fr'), 'la réponse annuelle est vide').toMatch(/20\s?%/u);
  });
});
