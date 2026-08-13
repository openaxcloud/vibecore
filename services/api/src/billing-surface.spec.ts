import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BILLING_ROUTE_PATTERNS, classifyBillingRoute } from './billing-surface.js';

/*
 * KILL-SWITCH FACTURATION — la garde de routes.
 *
 * Le test qui porte réellement la sûreté est le dernier : il parcourt le CODE
 * SOURCE des routes enregistrées et vérifie qu'aucune surface de paiement
 * n'échappe à la garde. Une liste écrite à la main se périme au premier ajout ;
 * cette vérification-là échoue le jour où quelqu'un enregistre
 * `/orgs/:orgId/billing/refund` sans y penser.
 */

const APP_SOURCE = readFileSync(join(__dirname, 'app.ts'), 'utf8');

/** Tous les motifs de route enregistrés dans `app.ts`, tels qu'écrits. */
function registeredRoutes(): string[] {
  const pattern = /app\.(?:get|post|put|patch|delete)\(\s*'([^']+)'/g;
  const found = new Set<string>();

  for (const match of APP_SOURCE.matchAll(pattern)) {
    found.add(match[1]);
  }

  return [...found];
}

describe('classifyBillingRoute — décisions explicites', () => {
  it('bloque chaque route de la liste énumérée', () => {
    for (const route of BILLING_ROUTE_PATTERNS) {
      expect(classifyBillingRoute(route), route).toEqual({ blocked: true, reason: 'listed' });
    }
  });

  it('bloque une route de paiement ABSENTE de la liste, via le filet par mots-clés', () => {
    // Le cas « ajoutée demain sans y penser ».
    for (const route of [
      '/orgs/:orgId/billing/refund',
      '/orgs/:orgId/subscription/cancel',
      '/internal/stripe/sync',
      '/orgs/:orgId/wallet/topup',
    ]) {
      expect(classifyBillingRoute(route).blocked, route).toBe(true);
    }
  });

  it('laisse passer les routes qui n_ont rien à voir avec la facturation', () => {
    for (const route of [
      '/projects/:projectId/files',
      '/api/runtime/workspaces/:workspaceId/ports',
      '/projects/:projectId/deployments',
      '/orgs/:orgId/members',
      '/healthz',
    ]) {
      expect(classifyBillingRoute(route).blocked, route).toBe(false);
    }
  });

  it('ne confond pas le « checkout » de GIT avec un encaissement', () => {
    /*
     * Piège du filet par mots-clés : en git, « checkout » désigne une branche.
     * Bloquer cette route couperait une fonctionnalité gratuite.
     */
    expect(classifyBillingRoute('/projects/:projectId/git/branches/checkout').blocked).toBe(false);
  });

  it('laisse passer usage et quota — télémétrie et limites techniques restent vivantes', () => {
    /*
     * Ces routes ne encaissent rien. Le blocage lié aux compteurs est neutralisé
     * dans `ensureQuota`, pas en faisant disparaître la mesure.
     */
    for (const route of [
      '/orgs/:orgId/usage',
      '/admin/usage',
      '/admin/quotas',
      '/projects/:projectId/ai/check-quota',
    ]) {
      expect(classifyBillingRoute(route).blocked, route).toBe(false);
    }
  });

  it('ne devine RIEN quand aucune route n_a été résolue', () => {
    // Pas de motif = 404 naturel. Deviner sur l'URL brute serait contournable.
    expect(classifyBillingRoute(undefined).blocked).toBe(false);
    expect(classifyBillingRoute('').blocked).toBe(false);
  });

  it('normalise le slash final et la query', () => {
    expect(classifyBillingRoute('/admin/billing/').blocked).toBe(true);
    expect(classifyBillingRoute('/admin/billing?x=1').blocked).toBe(true);
  });
});

describe('AUCUNE PORTE OUBLIÉE — balayage des routes réellement enregistrées', () => {
  /*
   * Termes qui désignent sans ambiguïté un encaissement. `usage` / `quota` en
   * sont exclus à dessein : ils portent de la télémétrie et des limites
   * techniques qui doivent survivre en gratuit.
   */
  const PAYMENT_TERMS = /(stripe|checkout|invoice|billing|credits|wallet|subscription|payment|plan-override)/i;

  const GIT_CHECKOUT = '/projects/:projectId/git/branches/checkout';

  it('le balayage trouve bien des routes (sinon le test ne prouve rien)', () => {
    expect(registeredRoutes().length).toBeGreaterThan(100);
  });

  it('toute route enregistrée qui parle de paiement est bloquée par la garde', () => {
    const uncovered = registeredRoutes()
      .filter((route) => PAYMENT_TERMS.test(route))
      .filter((route) => route !== GIT_CHECKOUT)
      .filter((route) => !classifyBillingRoute(route).blocked);

    expect(uncovered, `routes de paiement NON gardées :\n${uncovered.join('\n')}`).toEqual([]);
  });

  it('la liste énumérée ne contient pas de route morte', () => {
    /*
     * L'inverse du test précédent : une entrée qui ne correspond à aucune route
     * réelle est du bruit qui masque les vraies, et signale souvent un renommage
     * dont la garde n'a pas suivi.
     */
    const registered = new Set(registeredRoutes().map((route) => route.replace(/\/+$/, '')));
    const dead = BILLING_ROUTE_PATTERNS.filter((route) => !registered.has(route));

    expect(dead, `entrées sans route correspondante :\n${dead.join('\n')}`).toEqual([]);
  });
});
