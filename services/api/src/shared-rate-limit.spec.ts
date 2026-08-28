/**
 * Rigueur adverse sur le limiteur de débit.
 *
 * Chaque test correspond à une façon dont un limiteur échoue en vrai :
 *  - il compte par pod, donc l'horizontalité le défait ;
 *  - il lit-puis-écrit, donc une rafale simultanée passe en bloc ;
 *  - il s'ouvre quand son store tombe, donc on l'attaque en tombant Redis ;
 *  - sa clé est falsifiable, donc l'attaquant se fabrique des compartiments.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  consumeRateLimit,
  createFastifyRateLimitStore,
  DEFAULT_STORE_FAILURE_POLICY,
  LocalRateLimitBackend,
  parseStoreFailurePolicy,
  RateLimitStoreUnavailableError,
  RedisRateLimitBackend,
  SharedRateLimitBackend,
  type RateLimitBackend,
  type RateLimitRedis,
} from './shared-rate-limit.js';

/**
 * Faux Redis à sémantique RÉELLE pour INCR/PEXPIRE/PTTL : compteur partagé,
 * incrément atomique. Sans cette fidélité, les tests de rafale ne prouveraient
 * rien.
 */
class FakeRedis implements RateLimitRedis {
  readonly store = new Map<string, { count: number; expiresAt: number }>();
  failNext = false;
  evalCalls = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  async eval(_script: string, _numKeys: number, ...args: Array<string | number>) {
    this.evalCalls += 1;

    if (this.failNext) {
      throw new Error('ECONNREFUSED redis');
    }

    const key = String(args[0]);
    const windowMs = Number(args[1]);
    const now = this.now();
    const existing = this.store.get(key);

    if (!existing || existing.expiresAt <= now) {
      this.store.set(key, { count: 1, expiresAt: now + windowMs });

      return [1, windowMs];
    }

    existing.count += 1;

    return [existing.count, Math.max(1, existing.expiresAt - now)];
  }
}

const LIMIT = 10;
const WINDOW = 60_000;

describe('partage entre replicas — le cœur du défaut', () => {
  it('DEUX instances partageant Redis appliquent UN SEUL plafond', async () => {
    const redis = new FakeRedis();
    // Deux backends distincts = deux pods derrière le load balancer.
    const podA = new RedisRateLimitBackend(redis);
    const podB = new RedisRateLimitBackend(redis);

    let allowed = 0;

    for (let i = 0; i < LIMIT * 2; i += 1) {
      const backend = i % 2 === 0 ? podA : podB;
      const decision = await consumeRateLimit({ backend, key: 'ip:1.2.3.4', limit: LIMIT, windowMs: WINDOW });

      if (decision.allowed) {
        allowed += 1;
      }
    }

    // Exactement LIMIT, pas 2×LIMIT : le compteur est commun.
    expect(allowed).toBe(LIMIT);
  });

  it("CONTRÔLE NÉGATIF : deux compteurs LOCAUX laissent passer le double", async () => {
    /*
     * C'est l'état d'avant correctif. Ce test échouerait si le partage était
     * illusoire — il garantit que le test ci-dessus a des dents.
     */
    const podA = new LocalRateLimitBackend();
    const podB = new LocalRateLimitBackend();

    let allowed = 0;

    for (let i = 0; i < LIMIT * 2; i += 1) {
      const backend = i % 2 === 0 ? podA : podB;
      const decision = await consumeRateLimit({ backend, key: 'ip:1.2.3.4', limit: LIMIT, windowMs: WINDOW });

      if (decision.allowed) {
        allowed += 1;
      }
    }

    expect(allowed).toBe(LIMIT * 2);
  });

  it('six pods (HPA max) ne multiplient pas le plafond', async () => {
    const redis = new FakeRedis();
    const pods = Array.from({ length: 6 }, () => new RedisRateLimitBackend(redis));

    let allowed = 0;

    for (let i = 0; i < LIMIT * 6; i += 1) {
      const decision = await consumeRateLimit({
        backend: pods[i % pods.length],
        key: 'ip:9.9.9.9',
        limit: LIMIT,
        windowMs: WINDOW,
      });

      if (decision.allowed) {
        allowed += 1;
      }
    }

    expect(allowed).toBe(LIMIT);
  });
});

describe('concurrence — rafales simultanées', () => {
  it('une rafale SIMULTANÉE de 200 requêtes n en laisse passer que LIMIT', async () => {
    const redis = new FakeRedis();
    const backend = new RedisRateLimitBackend(redis);

    /*
     * Toutes lancées sans await intermédiaire : elles sont en vol ensemble. Un
     * compteur lit-puis-écrit laisserait passer tout le lot.
     */
    const decisions = await Promise.all(
      Array.from({ length: 200 }, () =>
        consumeRateLimit({ backend, key: 'burst', limit: LIMIT, windowMs: WINDOW }),
      ),
    );

    expect(decisions.filter((d) => d.allowed)).toHaveLength(LIMIT);
    expect(decisions.filter((d) => !d.allowed)).toHaveLength(190);
  });

  it('rafale simultanée RÉPARTIE sur 6 pods : toujours LIMIT', async () => {
    const redis = new FakeRedis();
    const pods = Array.from({ length: 6 }, () => new RedisRateLimitBackend(redis));

    const decisions = await Promise.all(
      Array.from({ length: 120 }, (_, i) =>
        consumeRateLimit({ backend: pods[i % pods.length], key: 'burst-multi', limit: LIMIT, windowMs: WINDOW }),
      ),
    );

    expect(decisions.filter((d) => d.allowed)).toHaveLength(LIMIT);
  });

  it('chaque requête est comptée une fois et une seule', async () => {
    const redis = new FakeRedis();
    const backend = new RedisRateLimitBackend(redis);
    const total = 50;

    const decisions = await Promise.all(
      Array.from({ length: total }, () => consumeRateLimit({ backend, key: 'count', limit: 1000, windowMs: WINDOW })),
    );

    // Les compteurs rendus forment exactement 1..total, sans trou ni doublon.
    expect([...decisions.map((d) => d.count)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: total }, (_, i) => i + 1),
    );
  });
});

describe('panne du store — fail-closed', () => {
  it('REFUSE quand le store partagé tombe (politique par défaut)', async () => {
    const redis = new FakeRedis();
    const onStoreFailure = vi.fn();
    const backend = new SharedRateLimitBackend(new RedisRateLimitBackend(redis), { onStoreFailure });

    redis.failNext = true;

    await expect(consumeRateLimit({ backend, key: 'k', limit: LIMIT, windowMs: WINDOW })).rejects.toBeInstanceOf(
      RateLimitStoreUnavailableError,
    );
    // La panne est signalée : un affaiblissement silencieux est le pire cas.
    expect(onStoreFailure).toHaveBeenCalledOnce();
  });

  it('la politique par défaut EST fail-closed', () => {
    expect(DEFAULT_STORE_FAILURE_POLICY).toBe('fail-closed');
    expect(parseStoreFailurePolicy(undefined)).toBe('fail-closed');
    expect(parseStoreFailurePolicy('')).toBe('fail-closed');
    expect(parseStoreFailurePolicy('nimporte-quoi')).toBe('fail-closed');
    // Seule la valeur exacte, écrite volontairement, change la politique.
    expect(parseStoreFailurePolicy('degrade-local')).toBe('degrade-local');
  });

  it('en degrade-local, on compte localement — JAMAIS illimité', async () => {
    const redis = new FakeRedis();
    const backend = new SharedRateLimitBackend(new RedisRateLimitBackend(redis), { policy: 'degrade-local' });

    redis.failNext = true;

    const decisions = [];

    for (let i = 0; i < LIMIT * 2; i += 1) {
      decisions.push(await consumeRateLimit({ backend, key: 'k', limit: LIMIT, windowMs: WINDOW }));
    }

    expect(decisions.filter((d) => d.allowed)).toHaveLength(LIMIT);
    // Et la dégradation est visible dans la décision.
    expect(decisions[0].degraded).toBe(true);
  });

  it('aucune politique ne rend « autorisé sans compter »', async () => {
    for (const policy of ['fail-closed', 'degrade-local'] as const) {
      const redis = new FakeRedis();
      const backend = new SharedRateLimitBackend(new RedisRateLimitBackend(redis), { policy });
      redis.failNext = true;

      let allowedWithoutCounting = 0;

      for (let i = 0; i < LIMIT * 3; i += 1) {
        try {
          const d = await consumeRateLimit({ backend, key: 'k', limit: LIMIT, windowMs: WINDOW });

          if (d.allowed) {
            allowedWithoutCounting += 1;
          }
        } catch {
          // fail-closed : refus, donc rien n'est laissé passer.
        }
      }

      expect(allowedWithoutCounting).toBeLessThanOrEqual(LIMIT);
    }
  });

  it('une réponse Redis corrompue est traitée comme une panne, pas comme un feu vert', async () => {
    const corrupt: RateLimitRedis = { eval: async () => ['pas-un-nombre', 'x'] as unknown as [number, number] };
    const backend = new SharedRateLimitBackend(new RedisRateLimitBackend(corrupt));

    await expect(consumeRateLimit({ backend, key: 'k', limit: LIMIT, windowMs: WINDOW })).rejects.toBeInstanceOf(
      RateLimitStoreUnavailableError,
    );
  });
});

describe('frontières et isolation', () => {
  it('deux tenants ne partagent JAMAIS un compartiment', async () => {
    const redis = new FakeRedis();
    const backend = new RedisRateLimitBackend(redis);

    // Le tenant A épuise entièrement son budget…
    for (let i = 0; i < LIMIT; i += 1) {
      await consumeRateLimit({ backend, key: 'cred:tenantA', limit: LIMIT, windowMs: WINDOW });
    }

    expect(
      (await consumeRateLimit({ backend, key: 'cred:tenantA', limit: LIMIT, windowMs: WINDOW })).allowed,
    ).toBe(false);

    // …sans entamer celui du tenant B, même derrière la même IP de sortie.
    expect(
      (await consumeRateLimit({ backend, key: 'cred:tenantB', limit: LIMIT, windowMs: WINDOW })).allowed,
    ).toBe(true);
  });

  it("un même credential garde UN budget, quelle que soit l'IP source", async () => {
    const redis = new FakeRedis();
    const backend = new RedisRateLimitBackend(redis);

    /*
     * La clé authentifiée ne contient PAS l'IP : un attaquant qui tourne sur des
     * centaines d'adresses n'obtient pas un compartiment neuf à chaque fois.
     */
    for (let i = 0; i < LIMIT; i += 1) {
      await consumeRateLimit({ backend, key: 'cred:jeton', limit: LIMIT, windowMs: WINDOW });
    }

    expect((await consumeRateLimit({ backend, key: 'cred:jeton', limit: LIMIT, windowMs: WINDOW })).allowed).toBe(
      false,
    );
  });

  it('une limite illisible retombe sur la plus restrictive, pas sur l ouverture', async () => {
    const redis = new FakeRedis();
    const backend = new RedisRateLimitBackend(redis);

    for (const limit of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      const first = await consumeRateLimit({ backend, key: `bad:${String(limit)}`, limit, windowMs: WINDOW });
      const second = await consumeRateLimit({ backend, key: `bad:${String(limit)}`, limit, windowMs: WINDOW });

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(false);
    }
  });

  it('une fenêtre illisible retombe sur 60 s, jamais sur 0', async () => {
    const redis = new FakeRedis();
    const backend = new RedisRateLimitBackend(redis);

    const decision = await consumeRateLimit({ backend, key: 'w', limit: LIMIT, windowMs: Number.NaN });
    // Une fenêtre nulle réinitialiserait le compteur à chaque requête.
    expect(decision.retryAfterSeconds).toBeGreaterThan(1);
  });
});

describe('fenêtre fixe — le TTL ne glisse pas', () => {
  it('la fenêtre ne se prolonge pas à chaque requête', async () => {
    let now = 1_000_000;
    const redis = new FakeRedis(() => now);
    const backend = new RedisRateLimitBackend(redis);

    await consumeRateLimit({ backend, key: 'ttl', limit: LIMIT, windowMs: WINDOW });
    now += 30_000;
    await consumeRateLimit({ backend, key: 'ttl', limit: LIMIT, windowMs: WINDOW });

    // 30 s consommées : il doit rester ~30 s, pas 60 s.
    const third = await consumeRateLimit({ backend, key: 'ttl', limit: LIMIT, windowMs: WINDOW });
    expect(third.retryAfterSeconds).toBeLessThanOrEqual(30);

    // Passé la fenêtre, le compteur repart à zéro.
    now += 31_000;
    expect((await consumeRateLimit({ backend, key: 'ttl', limit: LIMIT, windowMs: WINDOW })).count).toBe(1);
  });

  it('le compteur local purge ses fenêtres expirées (pas de fuite mémoire)', async () => {
    let now = 0;
    const local = new LocalRateLimitBackend(() => now);

    for (let i = 0; i < 100; i += 1) {
      await local.hit(`k${i}`, 1000);
    }

    expect(local.size).toBe(100);
    now += 5000;
    local.prune();
    expect(local.size).toBe(0);
  });
});

describe('le backend partagé délègue vraiment', () => {
  it('chaque hit atteint le store partagé (pas de cache local masquant)', async () => {
    const redis = new FakeRedis();
    const backend: RateLimitBackend = new SharedRateLimitBackend(new RedisRateLimitBackend(redis));

    for (let i = 0; i < 5; i += 1) {
      await backend.hit('k', WINDOW);
    }

    expect(redis.evalCalls).toBe(5);
  });
});

describe('isolation des compartiments entre routes', () => {
  /*
   * Défaut trouvé en réel par l'audit i18n live : la TOUTE PREMIÈRE requête
   * `/auth/register` d'un job répondait 429, alors que Redis était sain et
   * qu'aucune autre inscription n'avait eu lieu. Cause : le plugin dérive un
   * store par route via `child()`, mais `incr()` utilisait la clé telle quelle.
   * Avec un store en mémoire chaque instance a sa propre Map, donc le défaut
   * était invisible ; avec un store PARTAGÉ, toutes les routes incrémentaient
   * le même compteur par appelant.
   *
   * Conséquence en production : la limite la plus stricte s'appliquait à tout
   * le trafic. Dix requêtes sur n'importe quelle route suffisaient à faire
   * refuser une inscription légitime (`/auth/register`, max 10/min) — immédiat
   * derrière un NAT d'entreprise ou un CGNAT mobile.
   */
  const hit = (store: { incr: Function }, key: string) =>
    new Promise<number>((resolve, reject) => {
      store.incr(key, (error: Error | null, result?: { current: number }) =>
        error ? reject(error) : resolve(result!.current),
      );
    });

  it('le trafic d’une route ne consomme pas le budget d’une autre', async () => {
    const Store = createFastifyRateLimitStore(new LocalRateLimitBackend());
    const root = new Store({ timeWindow: 60_000 });
    const register = root.child({ routeInfo: { method: 'POST', url: '/auth/register' } });
    const gallery = root.child({ routeInfo: { method: 'GET', url: '/gallery' } });

    for (let index = 0; index < 5; index += 1) {
      await hit(gallery, '127.0.0.1');
    }

    // Avant le correctif : 6.
    expect(await hit(register, '127.0.0.1')).toBe(1);
    expect(await hit(gallery, '127.0.0.1')).toBe(6);
  });

  it('la même route et le même appelant partagent bien un compartiment', async () => {
    const Store = createFastifyRateLimitStore(new LocalRateLimitBackend());
    const root = new Store({ timeWindow: 60_000 });
    const a = root.child({ routeInfo: { method: 'POST', url: '/auth/login' } });
    const b = root.child({ routeInfo: { method: 'POST', url: '/auth/login' } });

    expect(await hit(a, '10.0.0.1')).toBe(1);
    expect(await hit(b, '10.0.0.1')).toBe(2);
  });

  it('deux appelants distincts restent séparés sur une même route', async () => {
    const Store = createFastifyRateLimitStore(new LocalRateLimitBackend());
    const route = new Store({ timeWindow: 60_000 }).child({ routeInfo: { method: 'POST', url: '/auth/login' } });

    expect(await hit(route, '10.0.0.1')).toBe(1);
    expect(await hit(route, '10.0.0.2')).toBe(1);
  });

  it('le store racine garde son propre compartiment (limite globale)', async () => {
    const Store = createFastifyRateLimitStore(new LocalRateLimitBackend());
    const root = new Store({ timeWindow: 60_000 });
    const route = root.child({ routeInfo: { method: 'POST', url: '/auth/register' } });

    expect(await hit(root, '127.0.0.1')).toBe(1);
    expect(await hit(route, '127.0.0.1')).toBe(1);
    expect(await hit(root, '127.0.0.1')).toBe(2);
  });

  /*
   * Ce cas existe parce que je m'y suis trompé. Ma première version lisait
   * `method`/`url` au premier niveau de l'objet passé à `child()`. Les tests
   * passaient — parce qu'ils passaient eux aussi cette forme-là. Or
   * `@fastify/rate-limit` appelle
   *
   *     store.child(mergeParams(globalParams, routeConfig, { routeInfo }))
   *
   * et la route vit sous `routeInfo`. Le discriminant était donc toujours
   * `undefined` en vrai, le compartiment retombait sur `global`, et le
   * correctif n'avait aucun effet : la première `/auth/register` d'un job
   * répondait encore 429. Ce test fige la forme RÉELLE du plugin.
   */
  it('lit la route sous `routeInfo`, comme le plugin la transmet réellement', async () => {
    const Store = createFastifyRateLimitStore(new LocalRateLimitBackend());
    const root = new Store({ timeWindow: 60_000 });
    const register = root.child({ max: 10, timeWindow: 60_000, routeInfo: { method: 'POST', url: '/auth/register' } });
    const gallery = root.child({ max: 2000, timeWindow: 60_000, routeInfo: { method: 'GET', url: '/gallery' } });

    for (let index = 0; index < 12; index += 1) {
      await hit(gallery, '127.0.0.1');
    }

    expect(await hit(register, '127.0.0.1')).toBe(1);
  });
});
