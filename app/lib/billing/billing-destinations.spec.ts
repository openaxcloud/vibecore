import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BILLING_DESTINATION_PREFIXES, isBillingDestination, withoutBillingDestinations } from './billing-destinations';

/*
 * KILL-SWITCH FACTURATION — masquage des surfaces CLIENT.
 *
 * Le filtre est générique sur `to` : navigation, palette de commandes et tuiles
 * de statistiques ont des types différents mais la même propriété. Un seul
 * filtre les couvre, plutôt qu'un traitement par surface — c'est ce qui évite
 * qu'un chemin reste allumé pendant que les autres s'éteignent.
 */

const APP_ROOT = join(__dirname, '..', '..');

describe('isBillingDestination', () => {
  it('reconnaît les destinations de facturation', () => {
    for (const to of ['/billing', '/usage', '/upgrade', '/invoices', '/plan-comparison', '/pricing']) {
      expect(isBillingDestination(to), to).toBe(true);
    }
  });

  it('reconnaît les sous-pages et les variantes avec query ou ancre', () => {
    expect(isBillingDestination('/billing/invoices')).toBe(true);
    expect(isBillingDestination('/upgrade?plan=pro')).toBe(true);
    expect(isBillingDestination('/usage#section')).toBe(true);
    expect(isBillingDestination('/billing/')).toBe(true);
  });

  it('ne confond pas un préfixe avec un simple début de mot', () => {
    /*
     * `/usage-limits` est bien une surface de facturation (il est dans la
     * liste), mais `/usages-internes` ne doit pas l'être par accident de
     * préfixe : la comparaison se fait sur des SEGMENTS.
     */
    expect(isBillingDestination('/usages-internes')).toBe(false);
    expect(isBillingDestination('/billing-support-article')).toBe(false);
  });

  it('laisse passer les destinations produit', () => {
    for (const to of ['/projects', '/dashboard', '/support', '/organization-members', '/account-settings']) {
      expect(isBillingDestination(to), to).toBe(false);
    }
  });

  it('gère l_absence de destination', () => {
    expect(isBillingDestination(undefined)).toBe(false);
    expect(isBillingDestination('')).toBe(false);
  });
});

describe('withoutBillingDestinations', () => {
  const items = [
    { to: '/dashboard', label: 'Tableau de bord' },
    { to: '/usage', label: 'Consommation' },
    { to: '/billing', label: 'Facturation' },
    { to: '/support', label: 'Support' },
  ];

  it('à OFF, retire toutes les entrées de facturation', () => {
    expect(withoutBillingDestinations(items, false).map((i) => i.to)).toEqual(['/dashboard', '/support']);
  });

  it('à ON, ne retire rien — la réversibilité vaut aussi pour l_interface', () => {
    expect(withoutBillingDestinations(items, true)).toHaveLength(4);
  });

  it('ne modifie pas le tableau d_origine', () => {
    withoutBillingDestinations(items, false);
    expect(items).toHaveLength(4);
  });

  it('supporte des entrées sans `to`', () => {
    expect(withoutBillingDestinations([{ label: 'x' } as { to?: string; label: string }], false)).toHaveLength(1);
  });
});

describe('FAIL-CLOSED jusque dans les signatures', () => {
  it('les constructeurs de surfaces masquent par DÉFAUT', () => {
    /*
     * `buildCommandPaletteItems(projects, translate)` sans troisième argument
     * doit MASQUER. Un défaut « ouvert » ferait qu'un appelant oublié révèle la
     * facturation — exactement le type d'oubli que le kill-switch doit couvrir.
     */
    const layout = readFileSync(join(APP_ROOT, 'components', 'dashboard', 'SaaSLayout.tsx'), 'utf8');

    expect(layout).toMatch(/buildCommandPaletteItems\([^)]*billingOn = false/s);
    expect(layout).toMatch(/localizedCommandPaletteActions\([^)]*billingOn = false/s);
  });

  it('le hook client rend `false` quand la donnée du loader est absente ou douteuse', () => {
    const hook = readFileSync(join(__dirname, 'use-billing-enabled.ts'), 'utf8');

    // Comparaison stricte à `true` : tout le reste — undefined, 'true', 1 — masque.
    expect(hook).toMatch(/billingEnabled === true/);
  });
});

describe('les surfaces de rendu passent bien par le filtre', () => {
  it('la navigation latérale filtre les deux sections', () => {
    const layout = readFileSync(join(APP_ROOT, 'components', 'dashboard', 'SaaSLayout.tsx'), 'utf8');

    expect(layout).toMatch(/withoutBillingDestinations\(orgNav, billingOn\)/);
    expect(layout).toMatch(/withoutBillingDestinations\(accountNav, billingOn\)/);
  });

  it('les tuiles du tableau de bord sont filtrées', () => {
    const dashboard = readFileSync(join(APP_ROOT, 'routes', 'dashboard.tsx'), 'utf8');

    expect(dashboard).toMatch(/withoutBillingDestinations\(\s*statsFromUsage/s);
  });

  it('la liste des préfixes couvre les routes Remix gardées', () => {
    /*
     * Cohérence entre ce qui est MASQUÉ (client) et ce qui est INJOIGNABLE
     * (routes). Une page 404 dont le lien reste visible produirait un lien mort ;
     * un lien masqué vers une page encore servie laisserait l'URL découvrable.
     */
    for (const route of ['/billing', '/usage', '/upgrade', '/invoices', '/plan-comparison', '/pricing']) {
      expect(BILLING_DESTINATION_PREFIXES, route).toContain(route);
    }
  });
});
