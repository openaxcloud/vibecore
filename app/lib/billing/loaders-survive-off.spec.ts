import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * KILL-SWITCH FACTURATION — les loaders NON-facturation doivent survivre à OFF.
 *
 * Défaut réel, trouvé à l'écran et PAS par les tests : le loader du tableau de
 * bord appelait `/orgs/:id/billing`. À OFF cette route répond 404, son `catch`
 * ne rattrapait qu'un 403, et le 404 remontait jusqu'à casser TOUTE la page
 * d'accueil. Un utilisateur gratuit se voyait refuser son tableau de bord —
 * exactement le blocage que le kill-switch doit empêcher.
 *
 * Les tests ne l'ont pas vu parce qu'ils tournent drapeau ARMÉ : la route
 * répondait. Seule la bascule A/B en environnement de test l'a révélé.
 *
 * Cette garde attrape la CLASSE : toute route non-facturation qui appelle une
 * API de facturation doit d'abord vérifier le drapeau.
 */

const ROUTES_DIR = join(__dirname, '..', '..', 'routes');

/** Appels API vers une surface de facturation. */
const BILLING_API_CALL = /apiRequest[^;]{0,200}?`\/orgs\/\$\{[^}]+\}\/(billing|credits)(\/|`)/s;

/** Routes qui SONT des surfaces de facturation : elles n'existent pas à OFF. */
const BILLING_ROUTES = new Set([
  'billing.tsx',
  'usage.tsx',
  'upgrade.tsx',
  'invoices.tsx',
  'invoices_.download.ts',
  'plan-comparison.tsx',
  'pricing.tsx',
  'usage-limits.tsx',
  'quota-exceeded.tsx',
  'api.payments.plans.ts',
  'downgrade.tsx',
  'payment-method.tsx',
]);

function routeFiles(): string[] {
  return readdirSync(ROUTES_DIR).filter(
    (name) => (name.endsWith('.tsx') || name.endsWith('.ts')) && !name.includes('.spec.'),
  );
}

describe('aucune route produit ne casse quand la facturation est éteinte', () => {
  it('le balayage trouve bien des routes', () => {
    expect(routeFiles().length).toBeGreaterThan(50);
  });

  it('toute route NON-facturation qui appelle une API de facturation vérifie le drapeau', () => {
    const offenders: string[] = [];

    for (const name of routeFiles()) {
      if (BILLING_ROUTES.has(name)) {
        continue;
      }

      const source = readFileSync(join(ROUTES_DIR, name), 'utf8');

      if (!BILLING_API_CALL.test(source)) {
        continue;
      }

      // Elle appelle la facturation : elle DOIT court-circuiter à OFF.
      if (!/billingEnabled\(\)/.test(source)) {
        offenders.push(name);
      }
    }

    expect(
      offenders,
      `ces routes appellent une API de facturation sans vérifier le drapeau — elles casseront à OFF :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('le tableau de bord court-circuite AVANT l_appel, pas dans un catch', () => {
    /*
     * Un `catch` ne suffit pas : celui qui existait ne rattrapait qu'un 403, et
     * rattraper un 404 masquerait aussi de vraies pannes. On n'appelle pas.
     */
    const dashboard = readFileSync(join(ROUTES_DIR, 'dashboard.tsx'), 'utf8');

    const fn = dashboard.slice(
      dashboard.indexOf('async function optionalBillingRequest'),
      dashboard.indexOf('async function optionalAiCostCents'),
    );

    expect(fn).toMatch(/if \(!billingEnabled\(\)\) \{[\s\S]{0,120}return/);
    expect(fn.indexOf('billingEnabled()')).toBeLessThan(fn.indexOf('try {'));
  });
});
