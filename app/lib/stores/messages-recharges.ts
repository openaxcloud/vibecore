/**
 * LES MESSAGES DONT LES ACTIONS NE DOIVENT JAMAIS ÊTRE REJOUÉES.
 *
 * BUG-QA0929-REOUVERTURE-REJOUE — un message qui existait avant cette session
 * (cache local OU fil relu depuis le serveur) a déjà produit ses effets : ses
 * `<boltAction>` décrivent le passé. Les rejouer réécrit des fichiers que
 * l'utilisateur a pu modifier depuis — mesuré le 2026-09-29, première ouverture
 * d'un projet sur un appareil neuf : la version de l'utilisateur remplacée par
 * l'ancienne version de l'agent, et « applied successfully » à l'écran.
 *
 * Deux sources, deux ensembles :
 *   - `remplacer` — les messages du cache local (`initialMessages`). La passe du
 *     parseur le rappelle à chaque fois : c'est son contrat, il REMPLACE.
 *   - `marquerHydrates` — le fil relu depuis le serveur. Il n'est PAS effacé par
 *     `remplacer` : c'était précisément le défaut, le cache local étant vide sur
 *     un appareil neuf.
 */
export class MessagesRecharges {
  #duCache = new Set<string>();
  #hydrates = new Set<string>();

  remplacer(ids: readonly string[]): void {
    this.#duCache = new Set(ids);
  }

  marquerHydrates(ids: readonly string[]): void {
    for (const id of ids) {
      this.#hydrates.add(id);
    }
  }

  contient(id: string): boolean {
    return this.#duCache.has(id) || this.#hydrates.has(id);
  }

  oublier(): void {
    this.#duCache.clear();
    this.#hydrates.clear();
  }
}
