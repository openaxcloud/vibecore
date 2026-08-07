/**
 * CONTRAT STARTER — entitlements appliqués côté serveur.
 *
 * Toutes les VALEURS viennent de la rate card versionnée
 * (`starter-rate-card.ts`) : aucun chiffre n'est écrit ici. Ce fichier ne
 * contient que des RÈGLES.
 *
 * Le modèle correct, et pourquoi il compte :
 *
 *   L'offre Starter n'est PAS « un déploiement ». C'est **un projet publié
 *   actif à la fois**. La nuance est tout le sujet : republier le même projet
 *   dix fois est un usage normal — c'est un DEUXIÈME projet distinct qui
 *   dépasse l'offre. Modéliser ça en `maxDeployments = 1` (ou pire,
 *   `deployments = 0`) punit l'itération normale et ne protège rien.
 *
 *   Un projet publié sur Starter **descend automatiquement au bout de 30
 *   jours**. Une fois expiré, il ne compte plus, et le MÊME projet peut être
 *   republié. L'expiration est donc une règle de comptage, pas une punition.
 *
 * Deux compteurs de crédits DISTINCTS existent (crédits Agent quotidiens
 * plafonnés au mois ; crédits cloud mensuels) — voir `StarterCreditCounters`.
 * Ils ne sont pas fusionnés : ce sont deux enveloppes différentes.
 *
 * ⚠️ Le dépassement Starter n'est PAS branché sur du pay-as-you-go Stripe : la
 * doc Replit présente le pay-as-you-go comme un DÉBLOCAGE Core. Tant qu'un
 * compte Starter réel n'a pas démontré le contraire, l'épuisement déclenche une
 * garde d'upgrade CONFIGURABLE (voir `UpgradeGuardMode`).
 */
import { STARTER_RATE_CARD, usableValue } from './starter-rate-card.js';

export type EntitlementPlanKey = 'starter' | 'core' | 'pro' | 'enterprise';

/** Ce que fait la plateforme quand une enveloppe Starter est épuisée. */
export type UpgradeGuardMode =
  /** Refuser et inviter à passer à un plan supérieur. Défaut. */
  | 'block-and-invite-upgrade'
  /** Laisser passer en enregistrant le dépassement (observation seule). */
  | 'observe-only';

export const DEFAULT_UPGRADE_GUARD_MODE: UpgradeGuardMode = 'block-and-invite-upgrade';

/**
 * Cap de projets PUBLIÉS ACTIFS par plan.
 *
 * ⚠️ Ne PAS y injecter la limite « 20 apps simultanées ». Ce sont deux métriques
 * différentes :
 *  - ici, on compte des projets dont une publication est encore vivante — un
 *    état PERSISTANT, qui ne se libère pas tout seul ;
 *  - la borne « 20 » porte sur des workloads en EXÉCUTION simultanée, un état
 *    transitoire qui se libère quand les instances s'arrêtent.
 *
 * Les confondre transformait « publications illimitées » (plans payants) en un
 * plafond dur de 20 projets publiés à vie. `Infinity` = aucun plafond d'offre ;
 * la concurrence d'exécution est gouvernée séparément par
 * `maxConcurrentRunningWorkloads`.
 */
export function maxActivePublishedProjects(plan: EntitlementPlanKey): number {
  if (plan === 'starter') {
    const capped = usableValue(STARTER_RATE_CARD.publishing.maxActivePublishedProjects);

    // Fail-closed : rate card illisible ⇒ on n'invente pas, on bloque.
    return capped ?? 0;
  }

  // Plans payants : publications illimitées, comme annoncé.
  return Number.POSITIVE_INFINITY;
}

/**
 * Concurrence d'EXÉCUTION : nombre de workloads simultanément actifs, tous plans
 * confondus. Métrique DISTINCTE du cap de publications ci-dessus — elle se
 * calcule sur les instances réellement en cours d'exécution, jamais en
 * approximant par le nombre de déploiements READY (un déploiement READY n'est
 * pas un workload qui tourne).
 */
export function maxConcurrentRunningWorkloads(): number | null {
  return usableValue(STARTER_RATE_CARD.technicalLimits.concurrentAppsAllPlans);
}

/** Durée de vie d'une publication Starter, en jours (null si non capturée). */
export function publishedProjectTtlDays(plan: EntitlementPlanKey): number | null {
  return plan === 'starter' ? usableValue(STARTER_RATE_CARD.publishing.publishedProjectTtlDays) : null;
}

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
    case 'team':
      return 'pro';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'starter';
  }
}

/** Une publication vivante : quel projet, et quand elle expire (si elle expire). */
export interface ActivePublication {
  projectId: string;
  publishedAt: Date;
}

/**
 * Une publication compte-t-elle encore ? Sur Starter, elle s'éteint d'elle-même
 * au bout du TTL — un projet expiré ne consomme plus l'unique place, ce qui
 * permet de republier le MÊME projet (ou un autre) sans intervention.
 */
export function isPublicationActive(input: {
  plan: EntitlementPlanKey;
  publishedAt: Date;
  now: Date;
}): boolean {
  const ttl = publishedProjectTtlDays(input.plan);

  if (ttl === null) {
    return true; // pas de TTL connu pour ce plan ⇒ la publication reste active
  }

  const ageMs = input.now.getTime() - input.publishedAt.getTime();

  // Une date future ou illisible est traitée comme active (fail-closed).
  if (!Number.isFinite(ageMs)) {
    return true;
  }

  return ageMs < ttl * 24 * 60 * 60 * 1000;
}

export interface PublishDecision {
  allowed: boolean;
  plan: EntitlementPlanKey;
  cap: number;
  /** Projets DISTINCTS encore publiés, hors celui qu'on republie. */
  activeOtherProjects: number;
  /** Vrai quand il s'agit de republier un projet déjà publié. */
  isRepublish: boolean;
}

/**
 * Décide si `targetProjectId` peut être publié.
 *
 * Deux propriétés que le test naïf « 2e appel Publish → refus » ne capture pas :
 *  - republier un projet DÉJÀ publié est toujours autorisé, quel que soit le
 *    plafond (sinon on interdirait de corriger un bug en production) ;
 *  - les publications expirées ne comptent pas.
 */
export function evaluatePublish(input: {
  planKey: string | undefined | null;
  targetProjectId: string;
  publications: ActivePublication[];
  now?: Date;
  cap?: number;
}): PublishDecision {
  const plan = toEntitlementPlanKey(input.planKey);
  const now = input.now ?? new Date();
  const rawCap = input.cap ?? maxActivePublishedProjects(plan);
  /*
   * `+Infinity` = absence DÉLIBÉRÉE de plafond (plans payants) et doit passer.
   * `NaN` / négatif / `-Infinity` = valeur corrompue et doit BLOQUER : on ne
   * laisse jamais une donnée illisible ouvrir le quota. Les deux cas ne se
   * distinguent pas avec un simple `Number.isFinite`.
   */
  const cap = rawCap === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Number.isFinite(rawCap) && rawCap >= 0 ? rawCap : 0;

  const live = input.publications.filter((p) => isPublicationActive({ plan, publishedAt: p.publishedAt, now }));
  const isRepublish = live.some((p) => p.projectId === input.targetProjectId);
  const activeOtherProjects = new Set(
    live.filter((p) => p.projectId !== input.targetProjectId).map((p) => p.projectId),
  ).size;

  return {
    // Republier ne consomme pas de place supplémentaire : toujours autorisé.
    allowed: isRepublish || activeOtherProjects < cap,
    plan,
    cap,
    activeOtherProjects,
    isRepublish,
  };
}

/** Variante levante, pour les chemins qui doivent refuser. */
export function assertPublishEntitlement(input: {
  planKey: string | undefined | null;
  targetProjectId: string;
  publications: ActivePublication[];
  now?: Date;
  cap?: number;
  guardMode?: UpgradeGuardMode;
}): PublishDecision {
  const decision = evaluatePublish(input);
  const mode = input.guardMode ?? DEFAULT_UPGRADE_GUARD_MODE;

  if (!decision.allowed && mode === 'block-and-invite-upgrade') {
    throw new EntitlementError(
      `Votre plan permet ${decision.cap} projet(s) publié(s) à la fois. Passez à un plan supérieur pour en publier d'autres.`,
      'PLAN_ACTIVE_PUBLISHED_PROJECT_LIMIT',
      402,
      {
        plan: decision.plan,
        cap: decision.cap,
        activeOtherProjects: decision.activeOtherProjects,
        upgradeRequired: true,
      },
    );
  }

  return decision;
}

/**
 * Les DEUX compteurs de crédits Starter, gardés distincts.
 *
 * Aucun montant n'est appliqué tant que la rate card les marque
 * `PENDING_LIVE_CAPTURE` : `limitCents: null` signifie « inconnu, donc non
 * appliqué », et surtout pas « illimité ».
 */
export interface StarterCreditCounters {
  agentDaily: { limitCents: number | null; resetCadence: 'daily'; monthlyCapCents: number | null };
  cloudMonthly: { limitCents: number | null; resetCadence: 'monthly'; covers: readonly string[] };
}

export function starterCreditCounters(): StarterCreditCounters {
  return {
    agentDaily: {
      limitCents: usableValue(STARTER_RATE_CARD.agentCredits.dailyAllowanceCents),
      resetCadence: 'daily',
      monthlyCapCents: usableValue(STARTER_RATE_CARD.agentCredits.monthlyCapCents),
    },
    cloudMonthly: {
      limitCents: usableValue(STARTER_RATE_CARD.cloudCredits.monthlyAllowanceCents),
      resetCadence: 'monthly',
      covers: STARTER_RATE_CARD.cloudCredits.covers,
    },
  };
}

/**
 * Le dépassement Starter ne doit pas être facturé à l'usage tant que ce
 * comportement n'a pas été observé sur un vrai compte Starter. Cette fonction
 * existe pour que l'intention soit explicite et testable.
 */
export function starterOverageIsPayAsYouGo(): boolean {
  return false;
}
