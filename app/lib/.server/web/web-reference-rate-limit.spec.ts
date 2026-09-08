import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireSharedWebReferenceSlot,
  acquireWebReferenceSlot,
  resetWebReferenceRateLimiter,
  WEB_REFERENCE_RATE_LIMIT,
  WEB_REFERENCE_RATE_LIMIT_PREFIX,
  type WebReferenceRateLimitRedis,
} from './web-reference-rate-limit';

/*
 * Le plafond de lectures de sites doit être PARTAGÉ entre les replicas du pod
 * web : en mémoire de processus, « 12 par 10 minutes » valait 12 × nombre de
 * pods, et le load balancer répartissait les requêtes tout seul.
 */

/** Double de Redis : rejoue le script Lua en mémoire, mêmes arguments. */
function fakeRedis() {
  const sets = new Map<string, number[]>();
  const calls: Array<{ key: string; now: number; window: number; maximum: number }> = [];

  const redis: WebReferenceRateLimitRedis = {
    async eval(_script, _numKeys, ...args) {
      const [key, now, window, maximum] = args as [string, string, string, string];
      const at = Number(now);
      const windowMs = Number(window);
      const cap = Number(maximum);

      calls.push({ key, now: at, window: windowMs, maximum: cap });

      const kept = (sets.get(key) ?? []).filter((stamp) => stamp > at - windowMs);

      if (kept.length >= cap) {
        sets.set(key, kept);

        return [0, kept.length];
      }

      kept.push(at);
      sets.set(key, kept);

      return [1, kept.length];
    },
  };

  return { redis, calls, sets };
}

describe('acquireSharedWebReferenceSlot', () => {
  beforeEach(() => resetWebReferenceRateLimiter());

  it('compte dans Redis : le plafond tient même quand chaque appel vient d’un pod différent', async () => {
    const { redis, calls } = fakeRedis();
    const now = 1_000_000;

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i += 1) {
      const decision = await acquireSharedWebReferenceSlot({ key: 'proj-a', redis, now: now + i });

      expect(decision).toEqual({ allowed: true, degraded: false });
    }

    // Le compteur PAR POD n'a jamais été touché : il autoriserait encore.
    expect(acquireWebReferenceSlot('proj-a', now)).toBe(true);

    // Redis, lui, refuse — c'est toute la différence.
    expect(await acquireSharedWebReferenceSlot({ key: 'proj-a', redis, now: now + 50 })).toEqual({
      allowed: false,
      degraded: false,
    });

    expect(calls[0].key).toBe(`${WEB_REFERENCE_RATE_LIMIT_PREFIX}proj-a`);
    expect(calls[0].window).toBe(WEB_REFERENCE_RATE_LIMIT.windowMs);
    expect(calls[0].maximum).toBe(WEB_REFERENCE_RATE_LIMIT.maxCollections);
  });

  it('la fenêtre glisse, et un locataire n’entame pas celle d’un autre', async () => {
    const { redis } = fakeRedis();
    const now = 2_000_000;

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i += 1) {
      await acquireSharedWebReferenceSlot({ key: 'proj-a', redis, now: now + i });
    }

    expect((await acquireSharedWebReferenceSlot({ key: 'proj-a', redis, now: now + 60 })).allowed).toBe(false);
    expect((await acquireSharedWebReferenceSlot({ key: 'proj-b', redis, now: now + 60 })).allowed).toBe(true);

    const apres = now + WEB_REFERENCE_RATE_LIMIT.windowMs + 1;

    expect((await acquireSharedWebReferenceSlot({ key: 'proj-a', redis, now: apres })).allowed).toBe(true);
  });

  it('un refus ne repousse pas la fenêtre : le client qui insiste finit par repasser', async () => {
    const { redis } = fakeRedis();
    const now = 3_000_000;

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i += 1) {
      await acquireSharedWebReferenceSlot({ key: 'proj-c', redis, now: now + i });
    }

    // Il insiste pendant toute la fenêtre…
    for (let t = 100; t < WEB_REFERENCE_RATE_LIMIT.windowMs; t += 60_000) {
      expect((await acquireSharedWebReferenceSlot({ key: 'proj-c', redis, now: now + t })).allowed).toBe(false);
    }

    // …et repasse dès que les premières places sortent de la fenêtre.
    expect(
      (await acquireSharedWebReferenceSlot({ key: 'proj-c', redis, now: now + WEB_REFERENCE_RATE_LIMIT.windowMs + 2 }))
        .allowed,
    ).toBe(true);
  });

  it('sans Redis : repli sur le compteur par pod, signalé comme dégradé, JAMAIS illimité', async () => {
    const now = 4_000_000;

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i += 1) {
      expect(await acquireSharedWebReferenceSlot({ key: 'proj-d', redis: null, now: now + i })).toEqual({
        allowed: true,
        degraded: true,
      });
    }

    expect(await acquireSharedWebReferenceSlot({ key: 'proj-d', now: now + 50 })).toEqual({
      allowed: false,
      degraded: true,
    });
  });

  it('Redis en erreur : repli sur le compteur par pod, jamais « autorisé sans compter »', async () => {
    const failing: WebReferenceRateLimitRedis = {
      eval: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };

    const now = 5_000_000;

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i += 1) {
      expect(await acquireSharedWebReferenceSlot({ key: 'proj-e', redis: failing, now: now + i })).toEqual({
        allowed: true,
        degraded: true,
      });
    }

    expect((await acquireSharedWebReferenceSlot({ key: 'proj-e', redis: failing, now: now + 60 })).allowed).toBe(false);
    expect(failing.eval).toHaveBeenCalled();
  });

  it('une réponse Redis inattendue est traitée comme un refus, pas comme un blanc-seing', async () => {
    const weird: WebReferenceRateLimitRedis = { eval: async () => null };

    expect(await acquireSharedWebReferenceSlot({ key: 'proj-f', redis: weird, now: 6_000_000 })).toEqual({
      allowed: false,
      degraded: false,
    });
  });
});
