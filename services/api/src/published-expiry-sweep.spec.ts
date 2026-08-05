/**
 * Balayage d'extinction 30 j — la SUBSTANCE derrière le 410.
 *
 * Un 410 au niveau du proxy ne suffit pas : sans arrêt du workload, l'app
 * continuerait de tourner, de consommer, et resterait joignable par tout chemin
 * ne passant pas par le proxy. Ces tests portent sur l'arrêt réel.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  assertPublicationStartable,
  ExpiredPublicationStartError,
  isExpiredPublication,
  selectExpiredServerDeployments,
  servingState,
  stopExpiredServerDeployments,
  type ExpiryCandidate,
} from './published-expiry-sweep.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-05T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const candidate = (patch: Partial<ExpiryCandidate> = {}): ExpiryCandidate => ({
  id: 'dep1',
  projectId: 'proj1',
  organizationId: 'org1',
  provider: 'server',
  environmentName: 'production',
  status: 'READY',
  createdAt: daysAgo(31),
  planKey: 'free',
  ...patch,
});

/** Starter = TTL 30 j ; plans payants = pas de TTL. */
const ttlForPlan = (planKey: string | undefined) => (planKey === 'free' || !planKey ? 30 : null);

describe('sélection des publications à éteindre', () => {
  it('retient un déploiement SERVER Starter de plus de 30 jours', () => {
    const selected = selectExpiredServerDeployments({ candidates: [candidate()], ttlDaysForPlan: ttlForPlan, now: NOW });
    expect(selected.map((c) => c.id)).toEqual(['dep1']);
  });

  it("n'éteint pas avant l'échéance", () => {
    for (const age of [0, 1, 29]) {
      const selected = selectExpiredServerDeployments({
        candidates: [candidate({ createdAt: daysAgo(age) })],
        ttlDaysForPlan: ttlForPlan,
        now: NOW,
      });
      expect(selected, `âge ${age} j`).toHaveLength(0);
    }
  });

  it("n'éteint JAMAIS un plan payant", () => {
    for (const planKey of ['core', 'pro', 'enterprise']) {
      const selected = selectExpiredServerDeployments({
        candidates: [candidate({ planKey, createdAt: daysAgo(400) })],
        ttlDaysForPlan: ttlForPlan,
        now: NOW,
      });
      expect(selected, planKey).toHaveLength(0);
    }
  });

  it("n'éteint pas une preview — une preview n'est pas une publication", () => {
    const selected = selectExpiredServerDeployments({
      candidates: [candidate({ environmentName: 'preview' })],
      ttlDaysForPlan: ttlForPlan,
      now: NOW,
    });
    expect(selected).toHaveLength(0);
  });

  it('ignore les déploiements non-READY (aucun workload à arrêter)', () => {
    for (const status of ['QUEUED', 'BUILDING', 'FAILED', 'CANCELED']) {
      expect(
        selectExpiredServerDeployments({ candidates: [candidate({ status })], ttlDaysForPlan: ttlForPlan, now: NOW }),
      ).toHaveLength(0);
    }
  });

  it('ignore le chemin STATIQUE — il a son propre garde', () => {
    expect(
      selectExpiredServerDeployments({
        candidates: [candidate({ provider: 'static' })],
        ttlDaysForPlan: ttlForPlan,
        now: NOW,
      }),
    ).toHaveLength(0);
  });

  it('ne retraite pas un déploiement déjà éteint', () => {
    expect(
      selectExpiredServerDeployments({
        candidates: [candidate({ expiredAt: daysAgo(1) })],
        ttlDaysForPlan: ttlForPlan,
        now: NOW,
      }),
    ).toHaveLength(0);
  });

  it('une date illisible ou future ne coupe pas une app vivante', () => {
    for (const createdAt of ['pas-une-date', new Date(NOW.getTime() + 10 * DAY).toISOString()]) {
      expect(
        isExpiredPublication({ candidate: { environmentName: 'production', createdAt, planKey: 'free' }, ttlDays: 30, now: NOW }),
      ).toBe(false);
    }
  });
});

describe('arrêt réel du workload', () => {
  it('ARRÊTE le workload puis marque la ligne — dans cet ordre', async () => {
    const order: string[] = [];
    const stopWorkload = vi.fn(async (id: string) => {
      order.push(`stop:${id}`);
    });
    const markExpired = vi.fn(async (c: ExpiryCandidate) => {
      order.push(`mark:${c.id}`);
    });

    const result = await stopExpiredServerDeployments({
      candidates: [candidate()],
      ttlDaysForPlan: ttlForPlan,
      now: NOW,
      stopWorkload,
      markExpired,
    });

    expect(result.stopped).toEqual(['dep1']);
    /*
     * L'ordre compte : marquer AVANT d'arrêter ferait disparaître le déploiement
     * des balayages suivants alors que son workload tourne encore — exactement
     * l'état qu'on veut interdire.
     */
    expect(order).toEqual(['stop:dep1', 'mark:dep1']);
  });

  it("ne marque PAS la ligne si l'arrêt échoue (sinon on l'oublierait en marche)", async () => {
    const markExpired = vi.fn();

    const result = await stopExpiredServerDeployments({
      candidates: [candidate()],
      ttlDaysForPlan: ttlForPlan,
      now: NOW,
      stopWorkload: async () => {
        throw new Error('manager injoignable');
      },
      markExpired,
    });

    expect(markExpired).not.toHaveBeenCalled();
    expect(result.stopped).toHaveLength(0);
    // L'échec est RENDU, pas avalé.
    expect(result.failed).toEqual([{ deploymentId: 'dep1', error: 'manager injoignable' }]);
  });

  it("l'échec d'un déploiement n'empêche pas les autres d'être éteints", async () => {
    const stopped: string[] = [];

    const result = await stopExpiredServerDeployments({
      candidates: [candidate({ id: 'a' }), candidate({ id: 'boom' }), candidate({ id: 'c' })],
      ttlDaysForPlan: ttlForPlan,
      now: NOW,
      stopWorkload: async (id) => {
        if (id === 'boom') {
          throw new Error('échec isolé');
        }

        stopped.push(id);
      },
      markExpired: async () => {},
    });

    // Un récalcitrant ne doit pas garder toute la flotte expirée en ligne.
    expect(stopped).toEqual(['a', 'c']);
    expect(result.failed.map((f) => f.deploymentId)).toEqual(['boom']);
  });

  it("n'arrête rien quand rien n'a expiré", async () => {
    const stopWorkload = vi.fn();

    const result = await stopExpiredServerDeployments({
      candidates: [candidate({ createdAt: daysAgo(5) }), candidate({ id: 'paid', planKey: 'core' })],
      ttlDaysForPlan: ttlForPlan,
      now: NOW,
      stopWorkload,
      markExpired: async () => {},
    });

    expect(stopWorkload).not.toHaveBeenCalled();
    expect(result).toMatchObject({ examined: 2, expired: 0 });
  });
});

describe("état de service exposé au proxy", () => {
  it('rend `expired` au-delà du TTL, `live` en deçà', () => {
    expect(servingState({ candidate: candidate(), ttlDays: 30, now: NOW })).toBe('expired');
    expect(servingState({ candidate: candidate({ createdAt: daysAgo(10) }), ttlDays: 30, now: NOW })).toBe('live');
  });

  it('un déploiement inconnu rend `not-found`, jamais `live`', () => {
    // Le proxy ne doit pas servir une app parce que l'API n'a pas su répondre.
    expect(servingState({ candidate: undefined, ttlDays: 30, now: NOW })).toBe('not-found');
  });

  it('un plan sans TTL reste `live` indéfiniment', () => {
    expect(servingState({ candidate: candidate({ createdAt: daysAgo(999) }), ttlDays: null, now: NOW })).toBe('live');
  });
});

describe('INV.1/2/3 — l extinction est une barrière DURABLE, pas une pause', () => {
  const startable = (patch: Partial<ExpiryCandidate> = {}) => ({
    environmentName: 'production',
    createdAt: daysAgo(31),
    planKey: 'free',
    ...patch,
  });

  it('INV.2 — un démarrage est REFUSÉ quand expiredAt est posé', () => {
    expect(() =>
      assertPublicationStartable({
        deploymentId: 'dep1',
        candidate: startable({ expiredAt: daysAgo(1), createdAt: daysAgo(2) }),
        ttlDays: 30,
        now: NOW,
      }),
    ).toThrow(ExpiredPublicationStartError);
  });

  it("INV.2 — refusé AUSSI par l'âge, avant même qu'un balayage soit passé", () => {
    /*
     * Sans ce second signal, une course entre le balayage et un redémarrage
     * rouvrirait l'application : le workload repartirait avant d'être marqué.
     */
    expect(() =>
      assertPublicationStartable({ deploymentId: 'dep1', candidate: startable(), ttlDays: 30, now: NOW }),
    ).toThrow(ExpiredPublicationStartError);
  });

  it('INV.2 — le refus porte un 410 typé, pas une erreur anonyme', () => {
    try {
      assertPublicationStartable({ deploymentId: 'dep-x', candidate: startable(), ttlDays: 30, now: NOW });
      throw new Error('aurait dû refuser');
    } catch (error) {
      expect(error).toBeInstanceOf(ExpiredPublicationStartError);
      expect((error as ExpiredPublicationStartError).statusCode).toBe(410);
      expect((error as ExpiredPublicationStartError).code).toBe('PUBLISHED_DEPLOYMENT_EXPIRED');
    }
  });

  it('INV.2 — une publication VIVANTE démarre normalement', () => {
    expect(() =>
      assertPublicationStartable({
        deploymentId: 'dep1',
        candidate: startable({ createdAt: daysAgo(3) }),
        ttlDays: 30,
        now: NOW,
      }),
    ).not.toThrow();
  });

  it("INV.2 — un plan payant n'est jamais bloqué au démarrage", () => {
    expect(() =>
      assertPublicationStartable({
        deploymentId: 'dep1',
        candidate: startable({ planKey: 'core', createdAt: daysAgo(999) }),
        ttlDays: null,
        now: NOW,
      }),
    ).not.toThrow();
  });

  it('INV.1 — MONOTONIE : le marqueur survit et continue de bloquer les démarrages', () => {
    /*
     * Même si l'âge n'était plus concluant (horloge remise, date réécrite), le
     * marqueur seul suffit à interdire la remise en route : l'extinction ne se
     * dégrade jamais en autorisation.
     */
    expect(() =>
      assertPublicationStartable({
        deploymentId: 'dep1',
        candidate: startable({ expiredAt: daysAgo(1), createdAt: new Date(NOW).toISOString() }),
        ttlDays: 30,
        now: NOW,
      }),
    ).toThrow(ExpiredPublicationStartError);
  });

  it("INV.3 — un arrêt en ÉCHEC ne marque pas, donc le déploiement reste candidat au retry", async () => {
    const candidates = [candidate()];

    const first = await stopExpiredServerDeployments({
      candidates,
      ttlDaysForPlan: ttlForPlan,
      now: NOW,
      stopWorkload: async () => {
        throw new Error('manager indisponible');
      },
      markExpired: async () => {},
    });

    expect(first.stopped).toHaveLength(0);
    expect(first.failed).toHaveLength(1);

    // Non marqué ⇒ toujours sélectionné au balayage suivant : l'échec ne se
    // transforme jamais en succès apparent.
    expect(
      selectExpiredServerDeployments({ candidates, ttlDaysForPlan: ttlForPlan, now: NOW }).map((c) => c.id),
    ).toEqual(['dep1']);
  });

  it("INV.3 — un arrêt en échec laisse le déploiement REFUSÉ au démarrage malgré tout", () => {
    /*
     * Le point crucial : même sans marqueur (l'arrêt a échoué), l'âge suffit à
     * interdire le redémarrage. Un manager en panne ne peut pas devenir une
     * autorisation implicite de relancer l'app.
     */
    expect(() =>
      assertPublicationStartable({ deploymentId: 'dep1', candidate: startable({ expiredAt: undefined }), ttlDays: 30, now: NOW }),
    ).toThrow(ExpiredPublicationStartError);
  });
});
