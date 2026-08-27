/**
 * Limiteur de débit PARTAGÉ entre replicas.
 *
 * Le problème corrigé ici : les compteurs vivaient en mémoire de PROCESSUS
 * (`Map` pour le limiteur admin, cache local par défaut de `@fastify/rate-limit`).
 * L'API tourne en 2 replicas, HPA jusqu'à 6 (`values-prod.yaml`). Un plafond
 * « 10 tentatives de login par minute » devenait donc 10 × nombre de pods, et
 * l'attaquant n'avait rien à faire pour en profiter : le load balancer répartit
 * ses requêtes tout seul. Plus la plateforme scalait sous l'attaque, plus la
 * protection faiblissait.
 *
 * Trois propriétés que ce module garantit :
 *
 *  1. **Partagé** — le compteur vit dans Redis, donc tous les pods voient le
 *     même. C'est la correction principale.
 *  2. **Atomique** — l'incrément et la pose du TTL se font dans UN script Lua.
 *     Un `GET` puis `SET` laisserait N requêtes simultanées lire la même valeur
 *     et passer ensemble : sous rafale, c'est exactement le moment où le
 *     limiteur doit tenir.
 *  3. **Fail-closed par défaut** — si le store partagé tombe, on REFUSE. Un
 *     limiteur protège du brute force : ne plus pouvoir compter et laisser
 *     passer quand même revient à désactiver la protection précisément au
 *     moment où l'attaquant a intérêt à faire tomber Redis. Le coût est réel et
 *     assumé — une panne Redis dégrade la disponibilité des routes limitées ;
 *     `RATE_LIMIT_STORE_FAILURE_POLICY=degrade-local` permet à un opérateur de
 *     choisir explicitement l'inverse (compteur par pod, jamais illimité).
 *
 * Il n'existe aucun chemin par lequel une panne rende « autorisé sans compter ».
 */

import { appPublicEnglish } from './app-public-copy.js';

export interface RateLimitHit {
  /** Nombre de requêtes comptées dans la fenêtre courante, CETTE requête incluse. */
  count: number;
  /** Millisecondes restantes avant remise à zéro. */
  ttlMs: number;
  /** Vrai quand le compteur n'était PAS partagé (repli local explicite). */
  degraded: boolean;
}

export interface RateLimitBackend {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

/**
 * Client Redis minimal attendu. Volontairement réduit à ce qu'on utilise, pour
 * que les tests puissent injecter un double sans tirer ioredis.
 */
export interface RateLimitRedis {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

/*
 * Fenêtre fixe. Le TTL n'est posé QUE lorsque le compteur vaut 1 (première
 * requête de la fenêtre) : le reposer à chaque hit prolongerait indéfiniment la
 * fenêtre d'un client actif, qui ne serait alors jamais réinitialisé.
 */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

export class RedisRateLimitBackend implements RateLimitBackend {
  constructor(private readonly redis: RateLimitRedis) {}

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const raw = (await this.redis.eval(HIT_SCRIPT, 1, key, String(windowMs))) as [number, number];
    const count = Number(raw?.[0]);
    const ttl = Number(raw?.[1]);

    if (!Number.isFinite(count) || count < 1) {
      throw new Error(appPublicEnglish('RATE_LIMIT_NON_NUMERIC_COUNT_INTERNAL'));
    }

    return {
      count,
      // PTTL rend -1 (pas de TTL) ou -2 (clé absente) : on retombe sur la fenêtre.
      ttlMs: Number.isFinite(ttl) && ttl > 0 ? ttl : windowMs,
      degraded: false,
    };
  }
}

/** Compteur en mémoire de processus. Utilisé seul en test, ou en REPLI. */
export class LocalRateLimitBackend implements RateLimitBackend {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = this.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });

      return { count: 1, ttlMs: windowMs, degraded: true };
    }

    bucket.count += 1;

    return { count: bucket.count, ttlMs: Math.max(1, bucket.resetAt - now), degraded: true };
  }

  /** Purge des fenêtres expirées — sinon la Map croît avec les clés vues. */
  prune(): void {
    const now = this.now();

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

/** Levée quand le store partagé est injoignable et que la politique est fail-closed. */
export class RateLimitStoreUnavailableError extends Error {
  readonly code = 'RATE_LIMIT_STORE_UNAVAILABLE';

  constructor(readonly cause: unknown) {
    super(appPublicEnglish('RATE_LIMIT_STORE_UNREACHABLE_INTERNAL'));
    this.name = 'RateLimitStoreUnavailableError';
  }
}

/**
 * Politique appliquée quand le store PARTAGÉ tombe.
 *
 * `fail-closed` (défaut) — on REFUSE. Un limiteur protège du brute force et de
 * l'abus : si on ne peut plus compter, laisser passer revient à désactiver la
 * protection exactement au moment où un attaquant a intérêt à faire tomber
 * Redis. Le coût est assumé et réel : une panne Redis dégrade la disponibilité
 * des routes limitées.
 *
 * `degrade-local` — on compte par pod. Moins sûr (le plafond vaut N× pods) mais
 * jamais illimité. À réserver aux opérateurs qui préfèrent explicitement la
 * disponibilité, via RATE_LIMIT_STORE_FAILURE_POLICY.
 */
export type StoreFailurePolicy = 'fail-closed' | 'degrade-local';

export const DEFAULT_STORE_FAILURE_POLICY: StoreFailurePolicy = 'fail-closed';

export function parseStoreFailurePolicy(raw: string | undefined): StoreFailurePolicy {
  return raw === 'degrade-local' ? 'degrade-local' : DEFAULT_STORE_FAILURE_POLICY;
}

/**
 * Store partagé en primaire, avec une politique de panne EXPLICITE. Il n'existe
 * aucun chemin par lequel une panne rende « autorisé sans compter ».
 */
export class SharedRateLimitBackend implements RateLimitBackend {
  private readonly fallback: LocalRateLimitBackend;
  private readonly policy: StoreFailurePolicy;
  private readonly onStoreFailure?: (error: unknown, policy: StoreFailurePolicy) => void;

  constructor(
    private readonly primary: RateLimitBackend,
    options: {
      policy?: StoreFailurePolicy;
      fallback?: LocalRateLimitBackend;
      onStoreFailure?: (error: unknown, policy: StoreFailurePolicy) => void;
    } = {},
  ) {
    this.policy = options.policy ?? DEFAULT_STORE_FAILURE_POLICY;
    this.fallback = options.fallback ?? new LocalRateLimitBackend();
    this.onStoreFailure = options.onStoreFailure;
  }

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    try {
      return await this.primary.hit(key, windowMs);
    } catch (error) {
      // Une panne silencieuse est un affaiblissement invisible : on la signale.
      this.onStoreFailure?.(error, this.policy);

      if (this.policy === 'fail-closed') {
        throw new RateLimitStoreUnavailableError(error);
      }

      return this.fallback.hit(key, windowMs);
    }
  }
}

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
  degraded: boolean;
}

/**
 * Consomme un jeton et rend la décision.
 *
 * `limit` illisible (NaN, négatif) ⇒ on retombe sur 1, le plus restrictif :
 * une configuration corrompue ne doit pas ouvrir la vanne.
 */
export async function consumeRateLimit(input: {
  backend: RateLimitBackend;
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitDecision> {
  const limit = Number.isFinite(input.limit) && input.limit >= 1 ? Math.floor(input.limit) : 1;
  const windowMs = Number.isFinite(input.windowMs) && input.windowMs >= 1000 ? input.windowMs : 60_000;
  const hit = await input.backend.hit(input.key, windowMs);

  return {
    allowed: hit.count <= limit,
    count: hit.count,
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil(hit.ttlMs / 1000)),
    degraded: hit.degraded,
  };
}

/**
 * Adaptateur au contrat de store de `@fastify/rate-limit`.
 *
 * Il existe pour que les DEUX limiteurs (global et admin) partagent exactement
 * la même politique de panne. Sans lui, le plugin gardait sa propre gestion
 * d'erreur : `skipOnError: false` empêchait bien l'ouverture de la vanne, mais
 * l'échec remontait en 500 générique — sans `retry-after`, indistinguable d'un
 * bug applicatif, et illisible pour l'appelant comme pour l'astreinte.
 */
export interface FastifyRateLimitStoreResult {
  current: number;
  ttl: number;
}

export class FastifyRateLimitSharedStore {
  /*
   * `options` est typé large : le plugin construit le store avec SES propres
   * options et n'a aucune connaissance de `backend`, qu'on y glisse à
   * l'enregistrement. Un type strict ici ne compilerait pas contre
   * `FastifyRateLimitStoreCtor`.
   */
  constructor(private readonly options: { backend?: unknown; timeWindow?: unknown; scope?: unknown }) {}

  /**
   * Discriminant de compartiment.
   *
   * Le plugin instancie UN store racine (limite globale) puis, pour chaque route
   * qui déclare sa propre `config.rateLimit`, un store dérivé via `child()`. Avec
   * un store en mémoire, chaque instance possède sa propre Map : les
   * compartiments sont naturellement séparés. Avec un store PARTAGÉ, ils ne le
   * sont plus — la clé seule les distingue, et `keyGenerator` ne rend que
   * l'identité de l'appelant, jamais la route.
   *
   * Sans ce préfixe, toutes les routes incrémentaient donc le MÊME compteur
   * Redis par appelant, et la limite la plus stricte s'appliquait de fait à tout
   * le trafic : dix requêtes sur n'importe quelle route suffisaient à faire
   * refuser une inscription légitime (`/auth/register`, max 10/min) — situation
   * immédiate derrière un NAT d'entreprise ou un CGNAT mobile.
   */
  private get scope(): string {
    return typeof this.options.scope === 'string' ? this.options.scope : 'global';
  }

  private get backend(): RateLimitBackend {
    const backend = this.options.backend as RateLimitBackend | undefined;

    if (!backend) {
      // Mieux vaut échouer que compter dans le vide : sans backend, il n'y a
      // pas de limite du tout, ce qui est le pire des états.
      throw new Error(appPublicEnglish('RATE_LIMIT_BACKEND_MISSING_INTERNAL'));
    }

    return backend;
  }

  incr(
    key: string,
    callback: (error: Error | null, result?: FastifyRateLimitStoreResult) => void,
    timeWindowMs?: number,
  ): void {
    const windowMs = Number(timeWindowMs ?? this.options.timeWindow ?? 60_000);

    this.backend
      .hit(`${this.scope}|${key}`, windowMs)
      .then((hit) => callback(null, { current: hit.count, ttl: hit.ttlMs }))
      // L'erreur typée remonte telle quelle : le gestionnaire d'erreurs la
      // traduit en 503 explicite plutôt qu'en 500 anonyme.
      .catch((error) => callback(error as Error));
  }

  /**
   * Le plugin dérive un store par route ; la politique et le backend restent
   * communs. Le paramètre est volontairement large : le plugin passe ses
   * `RouteOptions`, un type qu'on ne veut pas importer ici pour garder le module
   * indépendant de Fastify — on ne lit de toute façon que ce qu'on a nous-même
   * injecté.
   */
  child(routeOptions: object): FastifyRateLimitSharedStore {
    const route = routeOptions as { method?: unknown; url?: unknown };
    const method = Array.isArray(route.method) ? route.method.join(',') : String(route.method ?? '');
    const url = String(route.url ?? '');
    /*
     * Un store dérivé porte SON compartiment. Repli sur `global` si le plugin ne
     * fournit ni méthode ni url : mieux vaut partager le compartiment global que
     * d'en fabriquer un anonyme que rien ne pourrait rapprocher d'une route.
     */
    const scope = method || url ? `${method} ${url}`.trim() : 'global';

    return new FastifyRateLimitSharedStore({
      ...this.options,
      ...(routeOptions as Record<string, unknown>),
      scope,
    });
  }
}

/**
 * Fabrique la CLASSE de store attendue par `@fastify/rate-limit`, en y capturant
 * le backend.
 *
 * Pourquoi une fabrique plutôt qu'une option : le plugin instancie le store avec
 * `new Store(globalParams)`, et `globalParams` est reconstruit à partir de SES
 * propres champs — toute option supplémentaire qu'on lui passe est ignorée. Un
 * backend transmis via les options n'arrivait donc jamais jusqu'ici, et le store
 * ne comptait rien : le limiteur laissait tout passer en silence. La capture par
 * closure supprime cette dépendance à un passthrough qui n'existe pas.
 */
export function createFastifyRateLimitStore(backend: RateLimitBackend) {
  return class BoundSharedStore extends FastifyRateLimitSharedStore {
    constructor(options: { timeWindow?: unknown } = {}) {
      super({ ...options, backend });
    }
  };
}
