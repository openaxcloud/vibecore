/*
 * KILL-SWITCH FACTURATION — les DESTINATIONS de facturation, en un seul endroit.
 *
 * Cette liste est le pendant client de `BILLING_ROUTE_PATTERNS` côté API. Elle
 * existe pour la même raison : une navigation, un bouton et un raccourci de
 * palette qui décideraient chacun dans leur coin finiraient par diverger, et il
 * resterait un chemin allumé pendant que les autres s'éteignent.
 *
 * On raisonne en PRÉFIXES parce qu'une destination porte parfois une
 * sous-page ou une query (`/billing/invoices`, `/upgrade?plan=pro`).
 */
export const BILLING_DESTINATION_PREFIXES: readonly string[] = [
  '/billing',
  '/downgrade',
  '/invoices',
  '/payment-method',
  '/plan-comparison',
  '/pricing',
  '/quota-exceeded',
  '/upgrade',
  '/usage',
  '/usage-limits',
];

/** Cette destination mène-t-elle à une surface de facturation ? */
export function isBillingDestination(to: string | undefined): boolean {
  if (!to) {
    return false;
  }

  const path = to.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

  return BILLING_DESTINATION_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Retire les entrées de facturation d'une liste de navigation.
 *
 * Générique sur la forme des entrées : la navigation, la palette de commandes et
 * les tuiles de statistiques ont des types différents mais la même propriété
 * `to`. Un seul filtre les couvre toutes, plutôt qu'un traitement par surface.
 */
export function withoutBillingDestinations<T extends { to?: string }>(items: readonly T[], enabled: boolean): T[] {
  if (enabled) {
    return [...items];
  }

  return items.filter((item) => !isBillingDestination(item.to));
}
