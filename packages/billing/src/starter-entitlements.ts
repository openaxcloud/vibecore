/**
 * Entitlements du plan Starter appliqués CÔTÉ SERVEUR (EX-05).
 *
 * Le problème que ce module corrige : plusieurs entitlements Starter étaient
 * **déclarés** (catalogue de plans, page pricing) sans aucune application
 * serveur — un utilisateur gratuit pouvait donc dépasser ce que l'offre annonce.
 * D'autres étaient appliqués mais derrière `BILLING_CREDITS_ENABLED`, non défini
 * en production : du code de garde qui ne garde rien.
 *
 * Règles de conception :
 *
 *  - **Fail-closed.** Une limite illisible, non finie ou négative bloque au lieu
 *    de laisser passer. Un plan inconnu retombe sur Starter (le plus restrictif),
 *    jamais sur « illimité ».
 *  - **Indépendant du flag crédits.** Ces limites décrivent l'OFFRE, pas le
 *    modèle de facturation à l'usage ; les mettre derrière le flag reviendrait à
 *    ne pas les appliquer du tout en prod.
 *  - **402 quand il faut payer pour lever la limite**, distinct du 429 des
 *    quotas de débit : un Starter qui atteint son app publiée n'est pas
 *    « trop rapide », il lui manque un plan. Le code d'erreur dit lequel.
 *
 * ⚠️ Les valeurs marquées UNKNOWN ne sont PAS inventées : Replit ne les publie
 * pas. Voir `STARTER_PARITY_SOURCES` — un chiffre non sourcé reste `null` et
 * n'est appliqué par personne.
 */

export type EntitlementPlanKey = 'starter' | 'core' | 'pro' | 'enterprise';

/**
 * Traçabilité de chaque chiffre. `value: null` = non publié par Replit ⇒ aucune
 * application, aucune supposition. C'est volontaire : mieux vaut un trou déclaré
 * qu'un chiffre inventé qui refuserait à tort de vrais utilisateurs.
 */
export const STARTER_PARITY_SOURCES = {
  publishedApps: {
    value: 1,
    source: 'docs.replit.com/billing/plans/starter-plan — « Get 1 free published app »',
    verifiedOn: '2026-08-04',
  },
  workspaceStorageGb: {
    value: 2,
    source: 'docs.replit.com/billing/plans/starter-plan — StarterWorkspaceStorage = 2GB',
    verifiedOn: '2026-08-04',
  },
  publishedAppTtlDays: {
    value: 30,
    source: "docs.replit.com/billing/plans/starter-plan — published apps « go down after 30 days »",
    verifiedOn: '2026-08-04',
  },
  egressGibPerMonth: {
    value: 10,
    source: 'replit.com/blog/new-limits-and-plans — free tier « 10 GiB/month »',
    verifiedOn: '2026-08-04',
  },
  concurrentAppsAllPlans: {
    value: 20,
    source: 'docs.replit.com/legal-and-security-info/usage — « Concurrent Replit Apps: 20 (hard) »',
    verifiedOn: '2026-08-04',
  },
  // --- Non publiés par Replit : NE PAS INVENTER ---
  collaborators: {
    value: null,
    source: 'NON PUBLIÉ pour Starter (Core=5, Pro=15 seulement). docs.replit.com/build/invite-teammates',
    verifiedOn: '2026-08-04',
  },
  projectsCount: {
    value: null,
    source: 'NON PUBLIÉ. Seule la borne 20 apps concurrentes, tous plans confondus, est documentée.',
    verifiedOn: '2026-08-04',
  },
  dailyCreditAmount: {
    value: null,
    source: 'NON PUBLIÉ — « daily credits, up to a monthly cap », sans montant.',
    verifiedOn: '2026-08-04',
  },
} as const;

/** Cap d'applications publiées SIMULTANÉMENT, par plan. */
export const PUBLISHED_APP_CAP: Record<EntitlementPlanKey, number> = {
  // Chiffre Replit vérifié.
  starter: 1,
  /*
   * Core/Pro : « unlimited published apps » côté Replit, borné en pratique par
   * la limite dure de 20 apps concurrentes, tous plans confondus.
   */
  core: 20,
  pro: 20,
  enterprise: 20,
};

/** Stockage d'espace de travail par plan, en Go (chiffre Replit vérifié pour Starter). */
export const WORKSPACE_STORAGE_GB_CAP: Record<EntitlementPlanKey, number> = {
  starter: 2,
  core: 50,
  pro: 100,
  enterprise: 250,
};

export class EntitlementError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'EntitlementError';
  }
}

/**
 * Normalise une clé de plan. Tout ce qui n'est pas reconnu retombe sur
 * `starter` — le plan le PLUS restrictif. Retomber sur un plan permissif
 * transformerait une donnée corrompue en montée de privilèges silencieuse.
 */
export function toEntitlementPlanKey(key: string | undefined | null): EntitlementPlanKey {
  switch ((key ?? '').toLowerCase()) {
    case 'core':
      return 'core';
    case 'pro':
    case 'team': // clé héritée
      return 'pro';
    case 'enterprise':
      return 'enterprise';
    default:
      // 'starter', 'free', undefined, inconnu → le plus restrictif.
      return 'starter';
  }
}

/** Lecture fail-closed d'un cap : une valeur inutilisable bloque tout (0). */
function safeCap(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) >= 0 ? (value as number) : 0;
}

/**
 * Refuse de publier une app de plus que ce que le plan autorise.
 *
 * `active` = nombre d'apps DÉJÀ publiées, hors celle qu'on republie (republier
 * une app déjà en ligne ne doit jamais déclencher son propre cap).
 *
 * 402 et non 429 : la limite se lève en changeant de plan, pas en attendant.
 */
export function assertPublishedAppEntitlement(input: {
  planKey: string | undefined | null;
  active: number;
  cap?: number;
}): void {
  const plan = toEntitlementPlanKey(input.planKey);
  const cap = safeCap(input.cap ?? PUBLISHED_APP_CAP[plan]);
  // Un compteur illisible compte comme « déjà au plafond ».
  const active = Number.isFinite(input.active) ? input.active : Number.POSITIVE_INFINITY;

  if (active >= cap) {
    throw new EntitlementError(
      `Le plan ${plan} autorise ${cap} application(s) publiée(s) simultanément.`,
      'PLAN_PUBLISHED_APP_LIMIT',
      402,
      { plan, cap, active },
    );
  }
}

/**
 * Refuse de dépasser le stockage d'espace de travail du plan.
 * `usedBytes` illisible ⇒ traité comme au plafond (fail-closed).
 */
export function assertWorkspaceStorageEntitlement(input: {
  planKey: string | undefined | null;
  usedBytes: number;
  incomingBytes?: number;
  capGb?: number;
}): void {
  const plan = toEntitlementPlanKey(input.planKey);
  const capGb = safeCap(input.capGb ?? WORKSPACE_STORAGE_GB_CAP[plan]);
  const capBytes = capGb * 1024 * 1024 * 1024;
  const used = Number.isFinite(input.usedBytes) ? input.usedBytes : Number.POSITIVE_INFINITY;
  const incoming = Number.isFinite(input.incomingBytes) ? (input.incomingBytes as number) : 0;

  if (used + incoming > capBytes) {
    throw new EntitlementError(
      `Le plan ${plan} est limité à ${capGb} Go de stockage d'espace de travail.`,
      'PLAN_STORAGE_LIMIT',
      402,
      { plan, capGb, usedBytes: Number.isFinite(used) ? used : null, incomingBytes: incoming },
    );
  }
}
