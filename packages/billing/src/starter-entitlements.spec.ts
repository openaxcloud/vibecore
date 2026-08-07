/**
 * Contrat Starter — les 4 cas doivent être prouvés SÉPARÉMENT.
 *
 * Le test naïf « 2e appel Publish → 402 » est FAUX : si c'est le même projet,
 * la republication doit passer. Les quatre scénarios ci-dessous distinguent
 * explicitement republication et second projet, et couvrent l'expiration.
 */
import { describe, expect, it } from 'vitest';

import {
  assertPublishEntitlement,
  DEFAULT_UPGRADE_GUARD_MODE,
  EntitlementError,
  evaluatePublish,
  isPublicationActive,
  maxActivePublishedProjects,
  maxConcurrentRunningWorkloads,
  publishedProjectTtlDays,
  starterCreditCounters,
  starterOverageIsPayAsYouGo,
  toEntitlementPlanKey,
} from './starter-entitlements.js';
import { isUsable, STARTER_RATE_CARD, STARTER_RATE_CARD_VERSION } from './starter-rate-card.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-04T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe('Starter — (a) publier le projet A est autorisé', () => {
  it('autorise la première publication', () => {
    const decision = evaluatePublish({
      planKey: 'starter',
      targetProjectId: 'A',
      publications: [],
      now: NOW,
    });

    expect(decision).toMatchObject({ allowed: true, plan: 'starter', cap: 1, isRepublish: false });
  });
});

describe('Starter — (b) republier A est autorisé, SANS limite artificielle', () => {
  it('autorise la republication du même projet, encore et encore', () => {
    // A est déjà publié : le republier ne consomme aucune place supplémentaire.
    for (const ageDays of [0, 1, 10, 29]) {
      const decision = evaluatePublish({
        planKey: 'starter',
        targetProjectId: 'A',
        publications: [{ projectId: 'A', publishedAt: daysAgo(ageDays) }],
        now: NOW,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.isRepublish).toBe(true);
      expect(decision.activeOtherProjects).toBe(0);
    }
  });

  it('ne lève jamais sur une republication, même au plafond', () => {
    expect(() =>
      assertPublishEntitlement({
        planKey: 'starter',
        targetProjectId: 'A',
        publications: [{ projectId: 'A', publishedAt: daysAgo(2) }],
        now: NOW,
      }),
    ).not.toThrow();
  });
});

describe('Starter — (c) publier un 2e projet DISTINCT est refusé + invitation upgrade', () => {
  it('refuse B pendant que A est actif', () => {
    try {
      assertPublishEntitlement({
        planKey: 'starter',
        targetProjectId: 'B',
        publications: [{ projectId: 'A', publishedAt: daysAgo(1) }],
        now: NOW,
      });
      throw new Error('aurait dû refuser');
    } catch (error) {
      expect(error).toBeInstanceOf(EntitlementError);
      const e = error as EntitlementError;
      // 402 : la limite se lève en changeant de plan, pas en attendant.
      expect(e.statusCode).toBe(402);
      expect(e.code).toBe('PLAN_ACTIVE_PUBLISHED_PROJECT_LIMIT');
      expect(e.details).toMatchObject({ plan: 'starter', cap: 1, activeOtherProjects: 1, upgradeRequired: true });
    }
  });

  it('le refus invite à monter de plan et ne parle pas de « quota dépassé »', () => {
    const decision = evaluatePublish({
      planKey: 'starter',
      targetProjectId: 'B',
      publications: [{ projectId: 'A', publishedAt: daysAgo(1) }],
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
  });

  it('la garde est CONFIGURABLE : en observe-only, on laisse passer sans lever', () => {
    /*
     * Le dépassement Starter n'est PAS branché sur du pay-as-you-go Stripe (la
     * doc Replit en fait un déblocage Core). Le mode d'observation permet de
     * mesurer avant de durcir, sans facturer quoi que ce soit.
     */
    const decision = assertPublishEntitlement({
      planKey: 'starter',
      targetProjectId: 'B',
      publications: [{ projectId: 'A', publishedAt: daysAgo(1) }],
      now: NOW,
      guardMode: 'observe-only',
    });
    expect(decision.allowed).toBe(false);
    expect(DEFAULT_UPGRADE_GUARD_MODE).toBe('block-and-invite-upgrade');
  });
});

describe('Starter — (d) après expiration à 30 jours, republier est autorisé', () => {
  it("une publication de plus de 30 jours ne consomme plus la place", () => {
    expect(isPublicationActive({ plan: 'starter', publishedAt: daysAgo(31), now: NOW })).toBe(false);
    expect(isPublicationActive({ plan: 'starter', publishedAt: daysAgo(29), now: NOW })).toBe(true);
  });

  it('le MÊME projet peut être republié après expiration', () => {
    const decision = evaluatePublish({
      planKey: 'starter',
      targetProjectId: 'A',
      publications: [{ projectId: 'A', publishedAt: daysAgo(31) }],
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
  });

  it('un AUTRE projet devient publiable une fois A expiré', () => {
    const decision = evaluatePublish({
      planKey: 'starter',
      targetProjectId: 'B',
      publications: [{ projectId: 'A', publishedAt: daysAgo(31) }],
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.activeOtherProjects).toBe(0);
  });

  it('le TTL de 30 j est propre à Starter, pas aux plans payants', () => {
    expect(publishedProjectTtlDays('starter')).toBe(30);
    expect(publishedProjectTtlDays('core')).toBeNull();
    expect(isPublicationActive({ plan: 'core', publishedAt: daysAgo(400), now: NOW })).toBe(true);
  });
});

describe('Starter — fail-closed', () => {
  it('un plan inconnu est traité comme Starter, jamais comme illimité', () => {
    for (const key of [undefined, null, '', 'mystery', 'free', 'FREE']) {
      expect(toEntitlementPlanKey(key as any)).toBe('starter');
    }

    expect(() =>
      assertPublishEntitlement({
        planKey: 'plan-inexistant',
        targetProjectId: 'B',
        publications: [{ projectId: 'A', publishedAt: NOW }],
        now: NOW,
      }),
    ).toThrow(EntitlementError);
  });

  it('un cap illisible bloque au lieu de laisser passer', () => {
    // +Infinity est une absence DÉLIBÉRÉE de plafond, pas une corruption : il est
    // testé séparément juste en dessous.
    for (const cap of [Number.NaN, -1, Number.NEGATIVE_INFINITY]) {
      expect(
        evaluatePublish({
          planKey: 'starter',
          targetProjectId: 'B',
          publications: [{ projectId: 'A', publishedAt: NOW }],
          now: NOW,
          cap,
        }).allowed,
      ).toBe(false);
    }
  });

  it('+Infinity signifie « aucun plafond » et laisse passer', () => {
    expect(
      evaluatePublish({
        planKey: 'core',
        targetProjectId: 'B',
        publications: [{ projectId: 'A', publishedAt: NOW }],
        now: NOW,
        cap: Number.POSITIVE_INFINITY,
      }).allowed,
    ).toBe(true);
  });

  it("les plans payants n'ont AUCUN plafond de publications", () => {
    expect(maxActivePublishedProjects('starter')).toBe(1);

    /*
     * La borne « 20 apps simultanées » ne doit PAS servir de cap de publications :
     * elle porte sur des workloads en exécution (état transitoire), pas sur des
     * projets publiés (état persistant). Les confondre transformait
     * « publications illimitées » en plafond dur de 20 projets à vie.
     */
    for (const plan of ['core', 'pro', 'enterprise'] as const) {
      expect(maxActivePublishedProjects(plan)).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('la concurrence d EXÉCUTION est une métrique DISTINCTE', () => {
    expect(maxConcurrentRunningWorkloads()).toBe(20);
    // …et elle ne borne pas les publications d'un plan payant.
    expect(maxActivePublishedProjects('core')).not.toBe(maxConcurrentRunningWorkloads());
  });

  it('un plan payant publie bien au-delà de 20 projets distincts', () => {
    const publications = Array.from({ length: 25 }, (_, i) => ({
      projectId: `P${i}`,
      publishedAt: NOW,
    }));

    expect(
      evaluatePublish({ planKey: 'core', targetProjectId: 'P-NOUVEAU', publications, now: NOW }).allowed,
    ).toBe(true);
  });
});

describe('Starter — deux compteurs de crédits DISTINCTS', () => {
  it('sépare crédits Agent quotidiens et crédits cloud mensuels', () => {
    const counters = starterCreditCounters();
    expect(counters.agentDaily.resetCadence).toBe('daily');
    expect(counters.cloudMonthly.resetCadence).toBe('monthly');
    // Enveloppes distinctes, pas deux vues d'une même.
    expect(counters.cloudMonthly.covers).toContain('database-production');
    expect(counters.cloudMonthly.covers).toContain('object-storage');
    expect(counters.cloudMonthly.covers).toContain('publishing');
  });

  it("aucun montant n'est appliqué tant qu'il n'a pas été capturé en réel", () => {
    const counters = starterCreditCounters();
    // null = INCONNU donc NON APPLIQUÉ — surtout pas « illimité ».
    expect(counters.agentDaily.limitCents).toBeNull();
    expect(counters.agentDaily.monthlyCapCents).toBeNull();
    expect(counters.cloudMonthly.limitCents).toBeNull();
  });

  it('le dépassement Starter n est PAS du pay-as-you-go', () => {
    expect(starterOverageIsPayAsYouGo()).toBe(false);
  });
});

describe('Rate card — versionnée, sourcée, sans invention', () => {
  it('porte une version et une date d effet', () => {
    expect(STARTER_RATE_CARD_VERSION).toBeGreaterThanOrEqual(1);
    expect(STARTER_RATE_CARD.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('toute valeur APPLIQUÉE est observée et datée', () => {
    for (const entry of [
      STARTER_RATE_CARD.publishing.maxActivePublishedProjects,
      STARTER_RATE_CARD.publishing.publishedProjectTtlDays,
      STARTER_RATE_CARD.technicalLimits.workspaceStorageGb,
      STARTER_RATE_CARD.technicalLimits.concurrentAppsAllPlans,
    ]) {
      expect(isUsable(entry)).toBe(true);
      expect(entry.provenance).toMatch(/replit|livescan/i);
      expect(entry.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('les montants NON publiés restent null et PENDING_LIVE_CAPTURE', () => {
    /*
     * Garde anti-invention : si quelqu'un « complète » un de ces montants avec
     * une valeur plausible, ce test tombe.
     */
    for (const entry of [
      STARTER_RATE_CARD.agentCredits.dailyAllowanceCents,
      STARTER_RATE_CARD.agentCredits.monthlyCapCents,
      STARTER_RATE_CARD.cloudCredits.monthlyAllowanceCents,
      STARTER_RATE_CARD.technicalLimits.cpuMillicores,
      STARTER_RATE_CARD.technicalLimits.ramMb,
    ]) {
      expect(entry.value).toBeNull();
      expect(entry.status).toBe('PENDING_LIVE_CAPTURE');
      expect(isUsable(entry)).toBe(false);
    }
  });

  it('les limites TECHNIQUES sont séparées des avantages commerciaux', () => {
    // Elles vivent sous `technicalLimits`, jamais dans la carte publique.
    expect(Object.keys(STARTER_RATE_CARD.technicalLimits)).toEqual(
      expect.arrayContaining(['workspaceStorageGb', 'concurrentAppsAllPlans', 'egressGibPerMonth']),
    );
  });

  it('documente que le pay-as-you-go est un déblocage Core', () => {
    expect(STARTER_RATE_CARD.coreOnlyCapabilities.payAsYouGo).toMatch(/Core/);
  });
});
