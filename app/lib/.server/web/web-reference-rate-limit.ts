/**
 * Plafond de lectures de sites, PARTAGÉ entre les replicas du pod web.
 *
 * Le compteur vivait en mémoire de processus (une `Map`). Le pod `web` tourne en
 * plusieurs replicas derrière l'ingress, donc « 12 lectures par 10 minutes »
 * valait en réalité 12 × nombre de pods, et l'utilisateur n'avait rien à faire
 * pour en profiter : le load balancer répartit ses requêtes tout seul. Chaque
 * lecture peut coûter jusqu'à 9 requêtes sortantes vers un site tiers ; le
 * plafond est ce qui empêche la plateforme de se comporter en crawler.
 *
 * Trois propriétés, dans l'esprit de `services/api/src/shared-rate-limit.ts` :
 *
 *  1. **Partagé** — le compteur vit dans Redis (`REDIS_URL` est présent dans le
 *     pod web, qui reçoit le Secret complet, et la NetworkPolicy
 *     `allow-database-redis-egress-managed` porte `podSelector: {}` — donc tous
 *     les pods du namespace, web compris, joignent Redis sur 6379).
 *  2. **Atomique et glissant** — un seul script Lua purge la fenêtre, compte,
 *     puis ajoute l'horodatage. Un `ZCARD` suivi d'un `ZADD` laisserait N
 *     requêtes simultanées lire la même valeur et passer ensemble.
 *  3. **Repli local, jamais illimité** — si Redis est absent ou tombe, on
 *     retombe sur le compteur par pod. C'est un choix DIFFÉRENT de celui du
 *     limiteur d'authentification, et il est motivé : celui-ci ne protège pas
 *     d'un brute force sur des identifiants, il borne un coût sortant. Refuser
 *     toute lecture de site parce que Redis tousse casserait une fonctionnalité
 *     visible ; le repli garde un plafond réel (12 par pod) au lieu d'aucun.
 */
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('web-reference');

/**
 * Soft per-tenant limiter for site reads (in-memory, per web pod). One chat
 * message can cost up to ~9 outbound fetches; without a ceiling a single
 * project could turn the web pod into a crawler. Sliding window, pruned on use.
 */
export const WEB_REFERENCE_RATE_LIMIT = { maxCollections: 12, windowMs: 10 * 60 * 1000 } as const;

const collectionsByKey = new Map<string, number[]>();

export function acquireWebReferenceSlot(key: string, now: number = Date.now()): boolean {
  const since = now - WEB_REFERENCE_RATE_LIMIT.windowMs;
  const recent = (collectionsByKey.get(key) ?? []).filter((at) => at > since);

  if (recent.length >= WEB_REFERENCE_RATE_LIMIT.maxCollections) {
    collectionsByKey.set(key, recent);

    return false;
  }

  recent.push(now);
  collectionsByKey.set(key, recent);

  // Keep the map bounded: drop keys idle for a whole window.
  if (collectionsByKey.size > 5000) {
    for (const [otherKey, stamps] of collectionsByKey) {
      if (!stamps.some((at) => at > since)) {
        collectionsByKey.delete(otherKey);
      }
    }
  }

  return true;
}

/** Test hook: vide le compteur par pod (le compteur partagé vit dans Redis). */
export function resetWebReferenceRateLimiter(): void {
  collectionsByKey.clear();
}

/** Client Redis minimal : réduit à ce qu'on utilise, pour que les tests injectent un double. */
export interface WebReferenceRateLimitRedis {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

/**
 * Fenêtre glissante par ensemble ordonné.
 *   KEYS[1] clé du locataire
 *   ARGV[1] instant courant (ms)  ARGV[2] fenêtre (ms)  ARGV[3] plafond
 * Rend {autorisé (0|1), compte après décision}.
 *
 * L'horodatage n'est ajouté QUE si la lecture est autorisée : un appelant déjà
 * au plafond ne doit pas repousser sa propre fenêtre à chaque tentative, sinon
 * un client qui insiste ne se débloque jamais.
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

local used = redis.call('ZCARD', key)

if used >= maximum then
  redis.call('PEXPIRE', key, window)
  return {0, used}
end

redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
redis.call('PEXPIRE', key, window)

return {1, used + 1}
`;

export const WEB_REFERENCE_RATE_LIMIT_PREFIX = 'vibecore:webref:rl:';

export interface AcquireSharedSlotInput {
  key: string;
  redis?: WebReferenceRateLimitRedis | null;
  now?: number;
  maxCollections?: number;
  windowMs?: number;
}

export interface SharedSlotDecision {
  allowed: boolean;

  /** Vrai quand le compteur n'était PAS partagé (repli par pod). */
  degraded: boolean;
}

/**
 * Prend une place dans le plafond partagé. Retombe sur le compteur par pod si
 * Redis est absent ou en erreur — jamais sur « autorisé sans compter ».
 */
export async function acquireSharedWebReferenceSlot(input: AcquireSharedSlotInput): Promise<SharedSlotDecision> {
  const maximum = input.maxCollections ?? WEB_REFERENCE_RATE_LIMIT.maxCollections;
  const windowMs = input.windowMs ?? WEB_REFERENCE_RATE_LIMIT.windowMs;
  const now = input.now ?? Date.now();

  if (!input.redis) {
    return { allowed: acquireWebReferenceSlot(input.key, now), degraded: true };
  }

  try {
    const raw = (await input.redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      `${WEB_REFERENCE_RATE_LIMIT_PREFIX}${input.key}`,
      String(now),
      String(windowMs),
      String(maximum),
    )) as [number, number];

    const allowed = Number(raw?.[0]) === 1;

    return { allowed, degraded: false };
  } catch (error) {
    logger.warn('web reference shared rate limit unavailable; falling back to the per-pod counter', {
      error: (error as Error)?.message,
    });

    return { allowed: acquireWebReferenceSlot(input.key, now), degraded: true };
  }
}
