/**
 * Extinction des publications Starter arrivées à 30 jours — côté SERVER.
 *
 * Le premier lot n'éteignait que le chemin STATIQUE (`/static-deployments/*`).
 * Les déploiements SERVER sont servis par preview-proxy, qui transmet
 * `d-<id>.<domaine>` DIRECTEMENT au Service in-cluster `app-<id>` sans jamais
 * consulter l'API : aucune expiration ne pouvait donc s'appliquer, et une app
 * serveur Starter restait joignable indéfiniment. C'est le trou que ce module
 * ferme.
 *
 * Deux niveaux, volontairement distincts :
 *
 *  1. **La substance** — le workload est réellement ARRÊTÉ en amont
 *     (`stopExpiredServerDeployments`). Sans ça, un 410 ne serait qu'une façade :
 *     l'app continuerait de tourner, de consommer, et resterait joignable par
 *     tout chemin contournant le proxy.
 *  2. **La façade** — l'URL publique répond 410 (`servingState`), pour que
 *     l'utilisateur reçoive un refus explicite et non un 502 d'infrastructure.
 *
 * Les deux sont nécessaires : l'arrêt sans le 410 donne une erreur illisible ;
 * le 410 sans l'arrêt laisse tourner ce qu'on prétend avoir éteint.
 */

/** Ce qu'il faut savoir d'un déploiement pour décider de son extinction. */
export interface ExpiryCandidate {
  id: string;
  projectId: string;
  organizationId?: string;
  /** `server` | `static` | provider externe. */
  provider: string;
  environmentName?: string;
  status: string;
  createdAt: string;
  /** Plan de l'org, uniquement si l'abonnement est ACTIF. */
  planKey?: string;
  /** Déjà éteint par un balayage précédent — ne pas retraiter. */
  expiredAt?: string;
}

export type ServingState = 'live' | 'expired' | 'not-found';

/**
 * Un déploiement est-il éteint ?
 *
 * Conditions cumulatives, chacune pour une raison :
 *  - PRODUCTION seulement : une preview n'est pas une publication ;
 *  - plan soumis à un TTL : les plans payants n'expirent pas ;
 *  - date lisible : sans date on ne prétend pas savoir, donc on ne coupe pas.
 */
export function isExpiredPublication(input: {
  candidate: Pick<ExpiryCandidate, 'environmentName' | 'createdAt' | 'planKey'>;
  ttlDays: number | null;
  now: Date;
}): boolean {
  const { candidate, ttlDays, now } = input;

  if (candidate.environmentName !== 'production' || ttlDays === null) {
    return false;
  }

  const publishedAt = new Date(candidate.createdAt).getTime();

  if (!Number.isFinite(publishedAt)) {
    return false;
  }

  const ageMs = now.getTime() - publishedAt;

  // Une date future (horloge décalée) ne doit pas éteindre une app vivante.
  return Number.isFinite(ageMs) && ageMs >= ttlDays * 24 * 60 * 60 * 1000;
}

/**
 * Sélectionne les déploiements SERVER à arrêter.
 *
 * On ne retient que `READY` : un build en cours ou déjà échoué n'a pas de
 * workload à arrêter, et le ré-arrêter en boucle à chaque balayage produirait du
 * bruit et des appels manager inutiles.
 */
export function selectExpiredServerDeployments(input: {
  candidates: ExpiryCandidate[];
  ttlDaysForPlan: (planKey: string | undefined) => number | null;
  now: Date;
}): ExpiryCandidate[] {
  return input.candidates.filter(
    (candidate) =>
      candidate.provider === 'server' &&
      candidate.status === 'READY' &&
      // Déjà éteint : le ré-arrêter à chaque balayage produirait des appels
      // manager inutiles et du bruit de log, sans rien changer à l'état.
      !candidate.expiredAt &&
      isExpiredPublication({
        candidate,
        ttlDays: input.ttlDaysForPlan(candidate.planKey),
        now: input.now,
      }),
  );
}

export interface SweepResult {
  examined: number;
  expired: number;
  stopped: string[];
  failed: Array<{ deploymentId: string; error: string }>;
}

/**
 * Arrête les workloads expirés et marque les lignes.
 *
 * Best-effort PAR DÉPLOIEMENT : l'échec d'un arrêt ne doit pas empêcher les
 * autres d'être traités, sinon un seul déploiement récalcitrant garderait toute
 * la flotte expirée en ligne. Les échecs sont rendus, pas avalés.
 *
 * La ligne n'est marquée `EXPIRED` qu'APRÈS un arrêt réussi : marquer d'abord
 * ferait disparaître le déploiement des balayages suivants alors que son
 * workload tourne encore — précisément l'état qu'on veut interdire.
 */
export async function stopExpiredServerDeployments(input: {
  candidates: ExpiryCandidate[];
  ttlDaysForPlan: (planKey: string | undefined) => number | null;
  now: Date;
  stopWorkload: (deploymentId: string) => Promise<void>;
  markExpired: (deployment: ExpiryCandidate) => Promise<void>;
  onError?: (deploymentId: string, error: unknown) => void;
}): Promise<SweepResult> {
  const expired = selectExpiredServerDeployments({
    candidates: input.candidates,
    ttlDaysForPlan: input.ttlDaysForPlan,
    now: input.now,
  });

  const stopped: string[] = [];
  const failed: SweepResult['failed'] = [];

  for (const deployment of expired) {
    try {
      await input.stopWorkload(deployment.id);
      await input.markExpired(deployment);
      stopped.push(deployment.id);
    } catch (error) {
      input.onError?.(deployment.id, error);
      failed.push({ deploymentId: deployment.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { examined: input.candidates.length, expired: expired.length, stopped, failed };
}

/**
 * État de service exposé au proxy.
 *
 * Un déploiement inconnu rend `not-found` plutôt que `live` : le proxy ne doit
 * jamais servir une app parce que l'API n'a pas su répondre.
 */
export function servingState(input: {
  candidate?: Pick<ExpiryCandidate, 'environmentName' | 'createdAt' | 'planKey' | 'status'>;
  ttlDays: number | null;
  now: Date;
}): ServingState {
  if (!input.candidate) {
    return 'not-found';
  }

  // Only READY is a serving state. In particular, a CAS-losing rollback is
  // marked FAILED before its external workload cleanup starts; treating FAILED
  // as live would keep the public d-<id> route open during a manager fault.
  if (input.candidate.status !== 'READY') {
    return 'not-found';
  }

  return isExpiredPublication({ candidate: input.candidate, ttlDays: input.ttlDays, now: input.now })
    ? 'expired'
    : 'live';
}

/** Levée quand un chemin de démarrage vise un déploiement éteint. */
export class ExpiredPublicationStartError extends Error {
  readonly code = 'PUBLISHED_DEPLOYMENT_EXPIRED';
  readonly statusCode = 410;

  constructor(readonly deploymentId: string) {
    super(`Le déploiement ${deploymentId} a expiré et ne peut plus être démarré.`);
    this.name = 'ExpiredPublicationStartError';
  }
}

/**
 * BARRIÈRE DE DÉMARRAGE — l'extinction doit être DURABLE, pas seulement un
 * arrêt ponctuel.
 *
 * Arrêter un workload ne suffit pas : tout chemin capable de le redémarrer
 * (redéploiement, réconciliation, réveil scale-from-zero, autoscaling) le
 * ramènerait en ligne et l'extinction ne serait qu'une pause. Cette barrière est
 * ce qui fait du plan de contrôle la véritable AUTORITÉ d'extinction, et non le
 * garde du proxy — lequel n'est qu'une défense secondaire.
 *
 * Deux signaux, l'un ou l'autre suffit :
 *  - `expiredAt` déjà posé par un balayage ;
 *  - l'âge dépasse le TTL du plan, même si aucun balayage n'est encore passé
 *    (sinon une course entre le balayage et un redémarrage rouvrirait l'app).
 */
export function assertPublicationStartable(input: {
  deploymentId: string;
  candidate?: Pick<ExpiryCandidate, 'environmentName' | 'createdAt' | 'planKey' | 'expiredAt'>;
  ttlDays: number | null;
  now: Date;
}): void {
  const { candidate } = input;

  if (!candidate) {
    return;
  }

  const expired =
    Boolean(candidate.expiredAt) ||
    isExpiredPublication({ candidate, ttlDays: input.ttlDays, now: input.now });

  if (expired) {
    throw new ExpiredPublicationStartError(input.deploymentId);
  }
}
