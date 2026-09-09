/**
 * UNE RÉCONCILIATION PAR OUVERTURE, PAS PAR LECTURE D'ARBORESCENCE.
 *
 * `reconcileRuntimeSeedFromPersisted` existe déjà et fait exactement ce qu'il
 * faut : elle pose dans le workspace les fichiers présents dans le stockage
 * durable qui lui manquent, et compare octet à octet ceux qui divergent plutôt
 * que de les écraser. Mais elle n'est appelée que sur DEUX routes — le
 * provisionnement à froid et le redémarrage.
 *
 * Elle ne tourne donc JAMAIS à la réouverture d'un projet dont le workspace est
 * déjà `RUNNING`. Mesuré le 2026-09-09 : une génération au transcrit complet à
 * 100 % laisse `src/App.tsx` et `src/main.tsx` dans le stockage et absents du
 * workspace ; le pod n'ayant jamais été reprovisionné, la réparation
 * disponible n'a jamais été invoquée et l'application ne démarre pas.
 *
 * POURQUOI PAS UN MINUTEUR. Une limitation par temps rate le seul moment qui
 * compte : si l'ouverture tombe dans la fenêtre morte, l'utilisateur voit son
 * application cassée et rien ne se passe. La limitation porte donc sur
 * l'ÉVÉNEMENT — un workspace est réconcilié une fois, puis plus jamais tant
 * qu'il n'a pas été reprovisionné.
 *
 * POURQUOI EN ARRIÈRE-PLAN. La réconciliation lit un fichier par fichier déjà
 * présent, en séquentiel. Mesuré sur les journaux de production : ~105 ms par
 * lecture au médian, soit ~3,4 s pour 32 fichiers (~5,6 s au p90). C'est
 * inacceptable sur le chemin d'ouverture — on en a retiré 1,5 s la veille. En
 * arrière-plan, les fichiers manquants apparaissent une seconde plus tard, ce
 * qui est sans conséquence pour un projet qu'on vient d'ouvrir.
 */

export class ReconciliationUneFois {
  readonly #faits = new Set<string>();

  /**
   * Vrai UNE SEULE FOIS par workspace. Les appels suivants rendent faux tant
   * que `oublier` n'a pas été appelé — c'est ce qui empêche les cinquante-cinq
   * lectures d'arborescence d'une session de déclencher cinquante-cinq
   * réconciliations.
   */
  doitReconcilier(workspaceId: string): boolean {
    if (!workspaceId || this.#faits.has(workspaceId)) {
      return false;
    }

    this.#faits.add(workspaceId);

    return true;
  }

  /**
   * À appeler quand le workspace est (re)provisionné : le pod est neuf, il peut
   * de nouveau manquer des fichiers, donc il redevient éligible.
   */
  oublier(workspaceId: string): void {
    this.#faits.delete(workspaceId);
  }

  get taille(): number {
    return this.#faits.size;
  }
}
