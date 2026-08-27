/**
 * Extinction RÉELLE d'une publication Starter à 30 jours (réserve n°3).
 *
 * Le contre-audit a relevé que l'expiration n'existait que dans le COMPTEUR
 * d'entitlement : le projet cessait d'occuper la place, mais son URL continuait
 * de répondre. Le produit disait une chose (« l'app publiée descend ») et le
 * serveur en faisait une autre.
 *
 * `publishedDeploymentExpired` est appliquée dans le chemin de SERVICE — la
 * preuve live montre l'URL passer de 200 à 410 sans qu'aucun octet de l'app ne
 * soit servi.
 */
import { describe, expect, it } from 'vitest';

import { publishedDeploymentExpired } from '../app.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-04T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

describe('extinction réelle des publications Starter', () => {
  it('éteint une publication de production Starter au-delà de 30 jours', () => {
    expect(
      publishedDeploymentExpired({
        planKey: 'free',
        environmentName: 'production',
        createdAt: daysAgo(31),
        now: NOW,
      }),
    ).toBe(true);
  });

  it("ne l'éteint pas avant l'échéance", () => {
    for (const age of [0, 1, 29]) {
      expect(
        publishedDeploymentExpired({
          planKey: 'free',
          environmentName: 'production',
          createdAt: daysAgo(age),
          now: NOW,
        }),
      ).toBe(false);
    }
  });

  it("n'éteint JAMAIS une publication d'un plan payant", () => {
    for (const planKey of ['core', 'pro', 'enterprise']) {
      expect(
        publishedDeploymentExpired({
          planKey,
          environmentName: 'production',
          createdAt: daysAgo(400),
          now: NOW,
        }),
      ).toBe(false);
    }
  });

  it("n'éteint pas une preview — une preview n'est pas une publication", () => {
    expect(
      publishedDeploymentExpired({
        planKey: 'free',
        environmentName: 'preview',
        createdAt: daysAgo(400),
        now: NOW,
      }),
    ).toBe(false);
  });

  it('sans date, on ne prétend pas savoir : pas d extinction', () => {
    expect(
      publishedDeploymentExpired({ planKey: 'free', environmentName: 'production', now: NOW }),
    ).toBe(false);
  });

  it('un plan inconnu est traité comme Starter (donc soumis au TTL)', () => {
    // Cohérent avec toEntitlementPlanKey : l'inconnu retombe sur le plan le plus
    // restrictif, jamais sur un plan permissif.
    expect(
      publishedDeploymentExpired({
        planKey: undefined,
        environmentName: 'production',
        createdAt: daysAgo(31),
        now: NOW,
      }),
    ).toBe(true);
  });
});
