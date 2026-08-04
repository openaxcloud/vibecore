/**
 * EX-05 — les entitlements Starter doivent REFUSER, et refuser fail-closed.
 *
 * Ces tests visent les cas où une garde « passe » par accident : entrée
 * corrompue, plan inconnu, cap illisible. C'est là qu'un gating se transforme en
 * décoration.
 */
import { describe, expect, it } from 'vitest';

import {
  assertPublishedAppEntitlement,
  assertWorkspaceStorageEntitlement,
  EntitlementError,
  PUBLISHED_APP_CAP,
  STARTER_PARITY_SOURCES,
  toEntitlementPlanKey,
  WORKSPACE_STORAGE_GB_CAP,
} from './starter-entitlements.js';

const GB = 1024 * 1024 * 1024;

describe('EX-05 — normalisation de plan', () => {
  it('replie tout ce qui est inconnu sur STARTER (le plus restrictif)', () => {
    for (const key of [undefined, null, '', 'mystery', 'gratuit', 'FREE', 'free']) {
      expect(toEntitlementPlanKey(key as any)).toBe('starter');
    }
  });

  it('reconnaît les plans payants et la clé héritée team→pro', () => {
    expect(toEntitlementPlanKey('core')).toBe('core');
    expect(toEntitlementPlanKey('pro')).toBe('pro');
    expect(toEntitlementPlanKey('team')).toBe('pro');
    expect(toEntitlementPlanKey('enterprise')).toBe('enterprise');
  });
});

describe('EX-05 — cap d apps publiées', () => {
  it('Starter autorise 1 app publiée, refuse la 2e en 402', () => {
    expect(() => assertPublishedAppEntitlement({ planKey: 'starter', active: 0 })).not.toThrow();

    try {
      assertPublishedAppEntitlement({ planKey: 'starter', active: 1 });
      throw new Error('aurait dû refuser');
    } catch (error) {
      expect(error).toBeInstanceOf(EntitlementError);
      const e = error as EntitlementError;
      // 402 et non 429 : la limite se lève en changeant de plan, pas en attendant.
      expect(e.statusCode).toBe(402);
      expect(e.code).toBe('PLAN_PUBLISHED_APP_LIMIT');
      expect(e.details).toMatchObject({ plan: 'starter', cap: 1, active: 1 });
    }
  });

  it('un plan INCONNU est traité comme Starter, jamais comme illimité', () => {
    expect(() => assertPublishedAppEntitlement({ planKey: 'platine-ultra', active: 1 })).toThrow(EntitlementError);
  });

  it('un compteur illisible compte comme DÉJÀ au plafond (fail-closed)', () => {
    for (const active of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertPublishedAppEntitlement({ planKey: 'core', active })).toThrow(EntitlementError);
    }
  });

  it('un cap illisible ou négatif bloque au lieu de laisser passer', () => {
    for (const cap of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      expect(() => assertPublishedAppEntitlement({ planKey: 'pro', active: 0, cap })).toThrow(EntitlementError);
    }
  });

  it('les plans payants laissent passer au-delà de 1', () => {
    for (const plan of ['core', 'pro', 'enterprise'] as const) {
      expect(() => assertPublishedAppEntitlement({ planKey: plan, active: 1 })).not.toThrow();
      expect(PUBLISHED_APP_CAP[plan]).toBeGreaterThan(PUBLISHED_APP_CAP.starter);
    }
  });
});

describe('EX-05 — cap de stockage', () => {
  it('Starter est limité à 2 Go (chiffre Replit vérifié)', () => {
    expect(WORKSPACE_STORAGE_GB_CAP.starter).toBe(2);
    expect(() => assertWorkspaceStorageEntitlement({ planKey: 'starter', usedBytes: 1.5 * GB })).not.toThrow();

    try {
      assertWorkspaceStorageEntitlement({ planKey: 'starter', usedBytes: 2 * GB, incomingBytes: 1 });
      throw new Error('aurait dû refuser');
    } catch (error) {
      expect(error).toBeInstanceOf(EntitlementError);
      expect((error as EntitlementError).code).toBe('PLAN_STORAGE_LIMIT');
      expect((error as EntitlementError).statusCode).toBe(402);
    }
  });

  it('un usage illisible bloque (fail-closed)', () => {
    expect(() => assertWorkspaceStorageEntitlement({ planKey: 'starter', usedBytes: Number.NaN })).toThrow(
      EntitlementError,
    );
  });
});

describe('EX-05 — traçabilité des chiffres (aucune invention)', () => {
  it('tout chiffre appliqué porte une source Replit datée', () => {
    for (const key of ['publishedApps', 'workspaceStorageGb'] as const) {
      const entry = STARTER_PARITY_SOURCES[key];
      expect(entry.value).not.toBeNull();
      expect(entry.source).toMatch(/replit\.com/);
      expect(entry.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('les chiffres NON publiés par Replit restent null et ne sont appliqués nulle part', () => {
    /*
     * Garde anti-invention : si quelqu'un « complète » un de ces trous avec un
     * chiffre plausible, ce test tombe. Un entitlement inventé refuserait de
     * vrais utilisateurs sur une base fausse.
     */
    for (const key of ['collaborators', 'projectsCount', 'dailyCreditAmount'] as const) {
      expect(STARTER_PARITY_SOURCES[key].value).toBeNull();
      expect(STARTER_PARITY_SOURCES[key].source).toMatch(/NON PUBLIÉ/);
    }
  });

  it('le cap Starter appliqué est EXACTEMENT le chiffre sourcé', () => {
    expect(PUBLISHED_APP_CAP.starter).toBe(STARTER_PARITY_SOURCES.publishedApps.value);
    expect(WORKSPACE_STORAGE_GB_CAP.starter).toBe(STARTER_PARITY_SOURCES.workspaceStorageGb.value);
  });
});
