/**
 * ARBITRAGE DES ÉCRITURES ENTRE SOUS-AGENTS.
 *
 * Quand plusieurs rôles écrivent en parallèle dans le même arbre, deux d'entre
 * eux peuvent viser le même fichier. `detectFileOverlapConflicts` (passerelle)
 * sait le DÉTECTER — mesuré le 2026-09-07, 5 sondes vertes, y compris sur les
 * variantes d'écriture d'un même chemin et sur l'exclusion des rôles tombés.
 *
 * Mais il ne sait pas ARBITRER, et sa description ne porte que la clé
 * minusculisée : on ne peut donc pas en déduire où écrire. C'est la raison
 * d'être de ce module, et la raison pour laquelle il opère sur les chemins
 * d'origine plutôt que sur la liste de conflits.
 *
 * RÈGLE : la priorité est l'ordre du plan. Le rôle de rang le plus faible
 * l'emporte, quel que soit l'ordre d'ARRIVÉE des lanes.
 *
 * C'est ce qui rend l'état final déterministe. Les lanes se terminent dans un
 * ordre imprévisible — « le premier arrivé gagne » rendrait l'application
 * différente à chaque exécution pour le même prompt. Ici un rôle prioritaire
 * qui arrive en dernier reprend la main sur ce qu'un rôle secondaire avait
 * posé ; l'écriture reste incrémentale, seul le verdict est stable.
 */

/**
 * Réduit deux écritures du même fichier à une même clé.
 *
 * Reproduit délibérément `normalizeFilePath` de la passerelle
 * (`services/ai-gateway/src/consensus/voting.ts`) : les deux moitiés doivent
 * s'accorder sur ce qu'est « le même fichier », sinon la passerelle signale un
 * conflit que l'arbitre ne voit pas — ou l'inverse. La minusculisation est
 * conservatrice : elle regroupe `App.tsx` et `app.tsx`, ce qui provoque un
 * arbitrage de plus, jamais un écrasement de moins.
 */
export function cleDeChemin(chemin: string): string {
  return chemin
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .toLowerCase();
}

export interface DecisionDArbitrage {
  /** L'écriture est-elle autorisée ? */
  autorisee: boolean;

  /** Rang du rôle qui détient déjà le fichier, quand l'écriture est refusée. */
  detenuPar?: number;
}

export class ArbitreDesLanes {
  /** clé de chemin -> rang du rôle propriétaire (le plus faible l'emporte). */
  readonly #proprietaires = new Map<string, number>();

  /**
   * Décide si le rôle de rang `rang` peut écrire `chemin`.
   *
   * Idempotent : redemander pour le même couple rend la même réponse et ne
   * déplace pas la propriété. Le flux d'une lane émet plusieurs fragments pour
   * un même fichier (`onActionStream` puis `onActionClose`) — une méthode qui
   * changerait d'avis entre les deux couperait un fichier en son milieu.
   */
  peutEcrire(chemin: string, rang: number): DecisionDArbitrage {
    const cle = cleDeChemin(chemin);

    if (!cle) {
      return { autorisee: false };
    }

    const detenteur = this.#proprietaires.get(cle);

    if (detenteur === undefined || rang <= detenteur) {
      this.#proprietaires.set(cle, rang);
      return { autorisee: true };
    }

    return { autorisee: false, detenuPar: detenteur };
  }

  /** Les chemins effectivement attribués, pour la reddition de comptes. */
  attributions(): ReadonlyMap<string, number> {
    return new Map(this.#proprietaires);
  }

  reinitialiser(): void {
    this.#proprietaires.clear();
  }
}
