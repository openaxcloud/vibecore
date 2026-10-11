/**
 * DEUX CAUSES DIFFÉRENTES DERRIÈRE UN MÊME 429.
 *
 * `PANEL_QUOTA_EXCEEDED` était posé sur N'IMPORTE QUEL 429 venu de l'API — une
 * étiquette qui nomme une cause qu'elle n'a jamais vérifiée. Or les deux causes
 * ne demandent pas la même chose à l'utilisateur :
 *
 *   - refus de DÉBIT : trop de requêtes en peu de temps. Il faut ATTENDRE ;
 *     l'action se rouvrira d'elle-même en moins d'une minute.
 *   - refus de QUOTA : la limite du plan est atteinte. Il faut LIBÉRER de la
 *     place, ou attendre la période suivante.
 *
 * Ce mélange a coûté trois hypothèses fausses à trois personnes différentes le
 * 2026-09-06, sur un cas où le vrai motif était un quota compté à vie.
 *
 * LE DISCRIMINANT, mesuré en production le même jour : le limiteur global pose
 * `x-ratelimit-limit` / `x-ratelimit-remaining` sur TOUTES ses réponses — y
 * compris les 200 (`x-ratelimit-limit: 2000, x-ratelimit-remaining: 1999`). Il
 * ne suffit donc pas de constater leur présence.
 *
 * Ce qui distingue, c'est le RESTE : un refus de débit sort du limiteur avec
 * `remaining: 0`. Un refus de quota, lui, a FRANCHI le limiteur — son reste est
 * strictement positif — et n'est refusé qu'ensuite, par la facturation.
 */
export type Cause429 = 'debit' | 'quota';

export function causeDu429(headers: { get(name: string): string | null } | undefined): Cause429 {
  const reste = headers?.get('x-ratelimit-remaining');

  if (reste === null || reste === undefined || reste === '') {
    /*
     * Sans en-tête, on ne peut pas trancher. On retombe sur `quota` — le cas
     * qu'un utilisateur peut corriger — plutôt que d'annoncer une attente qui ne
     * viendra jamais. Un « libérez de la place » sur un refus de débit se corrige
     * en réessayant ; un « patientez » sur un quota atteint ne se corrige jamais.
     */
    return 'quota';
  }

  return Number(reste) <= 0 ? 'debit' : 'quota';
}
