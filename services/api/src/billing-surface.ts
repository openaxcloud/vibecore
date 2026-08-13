/*
 * KILL-SWITCH FACTURATION — quelles routes serveur disparaissent à OFF.
 *
 * Deux choix de conception portent la sûreté de ce fichier.
 *
 * 1. On matche le MOTIF DE ROUTE ENREGISTRÉ (`request.routeOptions.url`), pas
 *    l'URL brute. Un filtre par préfixe d'URL est contournable — encodage,
 *    double slash, segments `..` — et ce piège a déjà coûté une exemption
 *    fail-open sur `/internal/*`. Le motif, lui, est celui que Fastify a
 *    réellement résolu : il n'y a rien à contourner.
 *
 * 2. La liste est EXPLICITE et auditable, doublée d'un filet par mots-clés. Une
 *    liste seule oublie la route ajoutée demain ; un filet seul est illisible et
 *    attrape des routes innocentes. Les deux ensemble donnent une garde qu'on
 *    peut relire, et un test parcourt `app.ts` pour vérifier qu'aucune route de
 *    paiement n'échappe à l'ensemble.
 */

/** Routes de paiement / facturation, énumérées telles qu'elles sont enregistrées. */
export const BILLING_ROUTE_PATTERNS: readonly string[] = [
  // Encaissement et abonnement
  '/orgs/:orgId/billing/checkout',
  '/orgs/:orgId/billing/portal',
  '/orgs/:orgId/billing/email',
  '/orgs/:orgId/billing/invoices',
  '/orgs/:orgId/billing',
  '/billing/:orgId',
  '/billing/stripe/webhook',

  // Crédits (achat de packs, politiques et limites de dépense)
  '/orgs/:orgId/credits/packs/checkout',
  '/orgs/:orgId/credits/ai-policy',
  '/orgs/:orgId/credits/limits',
  '/orgs/:orgId/credits',

  // Administration de la facturation
  '/admin/billing',
  '/admin/stripe-config',
  '/admin/stripe-health',
  '/admin/stripe/webhook-failures',
  '/admin/stripe/webhook-failures/:eventId/replay',
  '/admin/stripe/webhook-failures/replay-all',
  '/admin/wallets',
  '/admin/wallets/:organizationId/adjust',
  '/admin/wallets/:organizationId/ledger',
  '/admin/plan-overrides',
];

/**
 * Filet de sécurité par mots-clés, pour la route de paiement ajoutée demain sans
 * que personne ne pense à cette liste.
 *
 * Volontairement restreint à des termes qui ne désignent QUE de la facturation.
 * `usage` et `quota` en sont exclus : ils portent aussi de la télémétrie et des
 * limites techniques qui doivent continuer de fonctionner en gratuit — leur
 * neutralisation passe par `ensureQuota`, pas par une disparition de route.
 */
const BILLING_KEYWORDS = /(stripe|checkout|invoice|billing|credits|wallet|subscription|payment|plan-override)/i;

/** Chemins qui CONTIENNENT un mot-clé sans relever de la facturation. */
const KEYWORD_EXCEPTIONS: readonly string[] = [
  // Git : « checkout » y désigne une branche, pas un encaissement.
  '/projects/:projectId/git/branches/checkout',
];

export interface BillingSurfaceVerdict {
  blocked: boolean;

  /** D'où vient la décision — utile en journal et en test. */
  reason?: 'listed' | 'keyword';
}

/**
 * Cette route est-elle une surface de facturation à faire disparaître à OFF ?
 *
 * @param routePattern le motif ENREGISTRÉ (`request.routeOptions.url`).
 */
export function classifyBillingRoute(routePattern: string | undefined): BillingSurfaceVerdict {
  if (!routePattern) {
    /*
     * Aucun motif : la requête n'a pas été résolue vers une route connue (404
     * naturel). Rien à bloquer, et surtout rien à deviner sur l'URL brute.
     */
    return { blocked: false };
  }

  const normalized = routePattern.split('?')[0].replace(/\/+$/, '') || '/';

  if (BILLING_ROUTE_PATTERNS.includes(normalized)) {
    return { blocked: true, reason: 'listed' };
  }

  if (KEYWORD_EXCEPTIONS.includes(normalized)) {
    return { blocked: false };
  }

  if (BILLING_KEYWORDS.test(normalized)) {
    return { blocked: true, reason: 'keyword' };
  }

  return { blocked: false };
}
