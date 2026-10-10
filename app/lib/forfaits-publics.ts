/*
 * LA GRILLE PUBLIQUE, telle que la page de prix l'affiche.
 *
 * Décision d'Avi du 2026-10-01 : Pro 29 €/mois, Team 99 €/mois, Core sur mesure
 * (devis, pas de prix public), 20 % de réduction en paiement annuel ; places :
 * gratuit 1, Pro 5, Team 25.
 *
 * Ces chiffres DOIVENT être ceux que le produit applique (`billingPlans`,
 * packages/billing). Ils ne sont pas importés de là parce que ce module-là tire
 * `node:crypto` et la page de prix se rend dans le navigateur : ils sont recopiés
 * ici, et `forfaits-publics.spec.ts` ROUGIT dès qu'une valeur diverge. La page ne
 * peut donc plus promettre ce que le produit ne fait pas — c'était le cas le
 * 2026-10-01 : Core 25 €, Pro 100 €, « jusqu'à 15 collaborateurs ».
 */
export const REMISE_ANNUELLE_PUBLIQUE = 0.2;

export type ForfaitPublicPayant = 'pro' | 'team';
export type ForfaitPublic = 'free' | ForfaitPublicPayant | 'core';

export interface LimitesPubliques {
  mensuelCents: number;
  places: number;

  /** `null` = pas de plafond publié. */
  projets: number | null;
  espacesActifs: number;
  messagesIaParMois: number;
  publicationsParMois: number | null;
  stockageGo: number;
}

export const forfaitsPublics: Record<'free' | ForfaitPublicPayant, LimitesPubliques> = {
  free: {
    mensuelCents: 0,
    places: 1,
    projets: null,
    espacesActifs: 1,
    messagesIaParMois: 50,
    publicationsParMois: null,
    stockageGo: 2,
  },
  pro: {
    mensuelCents: 2900,
    places: 5,
    projets: 25,
    espacesActifs: 4,
    messagesIaParMois: 1000,
    publicationsParMois: 50,
    stockageGo: 25,
  },
  team: {
    mensuelCents: 9900,
    places: 25,
    projets: 100,
    espacesActifs: 15,
    messagesIaParMois: 10_000,
    publicationsParMois: 500,
    stockageGo: 250,
  },
};

/** Montant annuel en centimes : mensuel × 12 − 20 % (278,40 € pour Pro, 950,40 € pour Team). */
export function annuelPublicCents(mensuelCents: number): number {
  return Math.round(mensuelCents * 12 * (1 - REMISE_ANNUELLE_PUBLIQUE));
}

/** Un identifiant de prix Stripe, et rien d'autre (la production a porté une adresse e-mail à la place d'un prix annuel). */
export function estUnPrixStripe(valeur: string | null | undefined): boolean {
  return typeof valeur === 'string' && /^price_[A-Za-z0-9_]+$/.test(valeur.trim());
}

/** Où mène le bouton d'un forfait : l'offre ET la période choisies survivent à l'inscription. */
export function lienDuForfait(cle: ForfaitPublic, periode: 'monthly' | 'yearly'): string {
  if (cle === 'free') {
    return '/register';
  }

  if (cle === 'core') {
    return '/contact-sales';
  }

  return `/subscribe?plan=${cle}&interval=${periode === 'yearly' ? 'annual' : 'monthly'}`;
}
